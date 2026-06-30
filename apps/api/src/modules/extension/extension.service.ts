import { Inject, Injectable } from '@nestjs/common';
import type {
  ExtensionHealthSummary,
  ExtensionTokenCreateInput,
  ExtensionTokenCreated,
  ExtensionTokenScope,
  ExtensionTokenSummary,
} from '@radar/contracts';
import { EXTENSION_TOKEN_SCOPES } from '@radar/contracts';
import { hashToken, randomToken, NotFoundError, UnauthorizedError, ValidationError } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

interface ExtensionTokenRowShape {
  id: string;
  organization_id: string;
  user_id: string;
  name: string;
  scopes: string[];
  last_used_at: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

export interface VerifiedExtensionToken {
  tokenId: string;
  organizationId: string;
  userId: string;
  scopes: ExtensionTokenScope[];
}

@Injectable()
export class ExtensionService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async listTokens(organizationId: string): Promise<ExtensionTokenSummary[]> {
    const { data, error } = await this.supabase
      .from('extension_tokens')
      .select('id, organization_id, user_id, name, scopes, last_used_at, expires_at, revoked_at, created_at')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Failed to list extension tokens: ${error.message}`);
    }

    return (data ?? []).map((row) => this.mapTokenSummary(row as ExtensionTokenRowShape));
  }

  async createToken(
    organizationId: string,
    userId: string,
    input: ExtensionTokenCreateInput,
  ): Promise<ExtensionTokenCreated> {
    if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
      throw new ValidationError('expiresAt must be in the future');
    }

    const token = `radar_ext_${randomToken(36)}`;
    const { data, error } = await this.supabase
      .from('extension_tokens')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        name: input.name,
        token_hash: hashToken(token),
        scopes: [...EXTENSION_TOKEN_SCOPES],
        expires_at: input.expiresAt ?? null,
      })
      .select('id, organization_id, user_id, name, scopes, last_used_at, expires_at, revoked_at, created_at')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create extension token: ${error?.message ?? 'unknown error'}`);
    }

    return {
      ...this.mapTokenSummary(data as ExtensionTokenRowShape),
      token,
    };
  }

  async revokeToken(organizationId: string, tokenId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('extension_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('organization_id', organizationId)
      .eq('id', tokenId)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to revoke extension token: ${error.message}`);
    }
    if (!data) {
      throw new NotFoundError('Extension token');
    }
  }

  async health(organizationId: string): Promise<ExtensionHealthSummary> {
    const [{ data: tokens, error: tokenError }, { data: batches, error: batchError }] = await Promise.all([
      this.supabase
        .from('extension_tokens')
        .select('id, revoked_at, expires_at')
        .eq('organization_id', organizationId),
      this.supabase
        .from('discovery_batches')
        .select('id, source, status, parser_version, item_count, created_at, error')
        .eq('organization_id', organizationId)
        .eq('channel', 'extension')
        .order('created_at', { ascending: false })
        .limit(25),
    ]);

    if (tokenError) {
      throw new Error(`Failed to load extension token health: ${tokenError.message}`);
    }
    if (batchError) {
      throw new Error(`Failed to load extension batch health: ${batchError.message}`);
    }

    const now = Date.now();
    const activeTokenCount = (tokens ?? []).filter((row) => {
      const revoked = row.revoked_at != null;
      const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : null;
      return !revoked && (expiresAt == null || expiresAt > now);
    }).length;

    const parserHealthMap = new Map<string, { parserVersion: string; totalBatches: number; failedBatches: number; latestBatchAt: string }>();
    for (const batch of batches ?? []) {
      const parserVersion = batch.parser_version ?? 'unknown';
      const current = parserHealthMap.get(parserVersion);
      if (current) {
        current.totalBatches += 1;
        if (batch.status === 'failed') current.failedBatches += 1;
      } else {
        parserHealthMap.set(parserVersion, {
          parserVersion,
          totalBatches: 1,
          failedBatches: batch.status === 'failed' ? 1 : 0,
          latestBatchAt: batch.created_at,
        });
      }
    }

    return {
      activeTokenCount,
      recentBatches: (batches ?? []).map((batch) => ({
        id: batch.id,
        source: batch.source,
        status: batch.status,
        parserVersion: batch.parser_version,
        itemCount: batch.item_count,
        createdAt: batch.created_at,
        error: batch.error,
      })),
      parserHealth: [...parserHealthMap.values()],
    };
  }

  async verifyCaptureToken(token: string, requiredScope: ExtensionTokenScope): Promise<VerifiedExtensionToken> {
    const raw = token.trim();
    if (!raw) {
      throw new UnauthorizedError('Missing extension capture token');
    }

    const { data, error } = await this.supabase
      .from('extension_tokens')
      .select('id, organization_id, user_id, scopes, expires_at, revoked_at')
      .eq('token_hash', hashToken(raw))
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to verify extension token: ${error.message}`);
    }
    if (!data) {
      throw new UnauthorizedError('Invalid extension token');
    }
    if (data.revoked_at) {
      throw new UnauthorizedError('Extension token has been revoked');
    }
    if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
      throw new UnauthorizedError('Extension token has expired');
    }

    const scopes = (data.scopes ?? []).filter((scope: string): scope is ExtensionTokenScope =>
      EXTENSION_TOKEN_SCOPES.includes(scope as ExtensionTokenScope),
    );
    if (!scopes.includes(requiredScope)) {
      throw new UnauthorizedError('Extension token is missing the required scope');
    }

    const { data: membership, error: membershipError } = await this.supabase
      .from('memberships')
      .select('id')
      .eq('organization_id', data.organization_id)
      .eq('user_id', data.user_id)
      .eq('status', 'active')
      .maybeSingle();

    if (membershipError) {
      throw new Error(`Failed to verify extension token membership: ${membershipError.message}`);
    }
    if (!membership) {
      throw new UnauthorizedError('Extension token owner is no longer an active member');
    }

    await this.supabase
      .from('extension_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', data.id);

    return {
      tokenId: data.id,
      organizationId: data.organization_id,
      userId: data.user_id,
      scopes,
    };
  }

  private mapTokenSummary(row: ExtensionTokenRowShape): ExtensionTokenSummary {
    return {
      id: row.id,
      name: row.name,
      scopes: (row.scopes ?? []).filter((scope: string): scope is ExtensionTokenScope =>
        EXTENSION_TOKEN_SCOPES.includes(scope as ExtensionTokenScope),
      ),
      lastUsedAt: row.last_used_at,
      expiresAt: row.expires_at,
      revokedAt: row.revoked_at,
      createdAt: row.created_at,
      createdByUserId: row.user_id,
    };
  }
}
