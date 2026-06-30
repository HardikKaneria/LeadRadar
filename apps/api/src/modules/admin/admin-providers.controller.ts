import { Controller, Get, Post, Put, Delete, Param, Body, Inject, UseGuards, InternalServerErrorException } from '@nestjs/common';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';
import { PlatformAdminGuard } from '../../common/guards/platform-admin.guard';
import type { AdminProviderAccountDto, AdminApiKeyDto } from '@radar/contracts';
import { encryptSecret, type AppConfig } from '@radar/core';
import { APP_CONFIG } from '../../config/app-config.module';

@UseGuards(PlatformAdminGuard)
@Controller('admin/providers')
export class AdminProvidersController {
  constructor(
    @Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  // ── Accounts ────────────────────────────────────────────────────────────────

  @Get('accounts')
  async listAccounts(): Promise<{ items: AdminProviderAccountDto[] }> {
    const { data, error } = await this.supabase
      .from('ai_provider_accounts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return {
      items: data.map((row) => ({
        id: row.id,
        provider: row.provider,
        accountName: row.account_name,
        accountType: row.account_type,
        monthlyBudget: row.monthly_budget,
        monthlyUsage: row.monthly_usage,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
    };
  }

  @Post('accounts')
  async createAccount(
    @Body() body: { provider: string; accountType: string; accountName: string },
  ): Promise<{ success: boolean; id: string }> {
    const { data, error } = await this.supabase
      .from('ai_provider_accounts')
      .insert({
        provider: body.provider,
        account_type: body.accountType as any,
        account_name: body.accountName?.trim() || body.provider,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new InternalServerErrorException(`Failed to create account: ${error?.message ?? 'unknown'}`);
    }
    return { success: true, id: data.id };
  }

  @Delete('accounts/:id')
  async deleteAccount(@Param('id') id: string): Promise<{ success: boolean }> {
    const { error } = await this.supabase
      .from('ai_provider_accounts')
      .delete()
      .eq('id', id);

    if (error) throw new InternalServerErrorException(error.message);
    return { success: true };
  }

  // ── Keys ─────────────────────────────────────────────────────────────────────

  @Get('keys')
  async listKeys(): Promise<{ items: AdminApiKeyDto[] }> {
    const { data, error } = await this.supabase
      .from('ai_api_keys')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);

    return {
      items: data.map((row) => ({
        id: row.id,
        provider: row.provider,
        providerAccountId: row.provider_account_id,
        keyName: row.key_name ?? null,
        status: row.status,
        lastUsedAt: row.last_used_at,
        lastError: row.last_error,
        cooldownUntil: row.cooldown_until,
        revokedAt: row.revoked_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        requestsUsedToday: row.requests_used_today,
        tokensUsedMonth: row.tokens_used_month,
        costUsedMonth: row.cost_used_month,
      })),
    };
  }

  @Post('keys')
  async createKey(
    @Body() body: { providerAccountId: string; apiKey: string; keyName?: string },
  ): Promise<{ success: boolean }> {
    if (!this.config.ENCRYPTION_KEY) {
      throw new InternalServerErrorException('ENCRYPTION_KEY is not configured');
    }

    // Resolve provider from the chosen account (single source of truth)
    const { data: account, error: accError } = await this.supabase
      .from('ai_provider_accounts')
      .select('id, provider')
      .eq('id', body.providerAccountId)
      .single();

    if (accError || !account) {
      throw new InternalServerErrorException(`Account not found: ${body.providerAccountId}`);
    }

    const keyName = body.keyName?.trim() || `${account.provider} key ${new Date().toISOString().slice(0, 10)}`;
    const encryptedApiKey = encryptSecret(body.apiKey, this.config.ENCRYPTION_KEY);

    const { error: keyError } = await this.supabase
      .from('ai_api_keys')
      .insert({
        provider: account.provider,
        provider_account_id: account.id,
        key_name: keyName,
        encrypted_api_key: encryptedApiKey,
        status: 'active',
      });

    if (keyError) throw new InternalServerErrorException(`Key error: ${keyError.message}`);
    return { success: true };
  }

  @Delete('keys/:id')
  async deleteKey(@Param('id') id: string): Promise<{ success: boolean }> {
    const { error } = await this.supabase
      .from('ai_api_keys')
      .delete()
      .eq('id', id);

    if (error) throw new InternalServerErrorException(error.message);
    return { success: true };
  }

  @Put('keys/:id')
  async updateKey(
    @Param('id') id: string,
    @Body() body: { status: string },
  ): Promise<{ success: boolean }> {
    const { error } = await this.supabase
      .from('ai_api_keys')
      .update({ status: body.status, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) throw new Error(error.message);
    return { success: true };
  }
}
