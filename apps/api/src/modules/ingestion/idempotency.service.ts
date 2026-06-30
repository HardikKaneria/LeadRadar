import { Inject, Injectable } from '@nestjs/common';
import { ConflictError } from '@radar/core';
import type { ServiceClient } from '@radar/supabase';
import { SUPABASE_SERVICE } from '../../supabase/supabase.module';

interface StoredIdempotencyRecord<T> {
  fingerprint: string;
  status: 'pending' | 'completed';
  response?: T;
}

type ReservationResult<T> =
  | { kind: 'reserved' }
  | { kind: 'replayed'; response: T };

@Injectable()
export class IdempotencyService {
  constructor(@Inject(SUPABASE_SERVICE) private readonly supabase: ServiceClient) {}

  async reserve<T>(
    scope: string,
    idempotencyKey: string,
    fingerprint: string,
  ): Promise<ReservationResult<T>> {
    const key = this.dbKey(scope, idempotencyKey);

    // Try to insert cleanly
    const { data: inserted, error: insertError } = await this.supabase
      .from('idempotency_keys')
      .insert({
        key,
        fingerprint,
        status: 'pending',
      })
      .select('key')
      .maybeSingle();

    // If inserted successfully
    if (inserted) return { kind: 'reserved' };

    // Otherwise it exists (conflict). Let's read it.
    const existing = await this.read<T>(key);
    if (!existing) {
      // It might have expired and been deleted in a cleanup, or just strange timing
      const { data: retried } = await this.supabase
        .from('idempotency_keys')
        .insert({ key, fingerprint, status: 'pending' })
        .select('key')
        .maybeSingle();
      if (retried) return { kind: 'reserved' };
      throw new ConflictError('Unable to reserve Idempotency-Key');
    }

    if (existing.fingerprint !== fingerprint) {
      throw new ConflictError('Idempotency-Key was already used with a different request body');
    }

    if (existing.status === 'completed' && existing.response !== undefined) {
      return { kind: 'replayed', response: existing.response };
    }

    throw new ConflictError('A request with this Idempotency-Key is already in progress');
  }

  async complete<T>(
    scope: string,
    idempotencyKey: string,
    fingerprint: string,
    response: T,
  ): Promise<void> {
    const key = this.dbKey(scope, idempotencyKey);
    await this.supabase
      .from('idempotency_keys')
      .update({
        status: 'completed',
        response: response as any,
      })
      .eq('key', key);
  }

  async clear(scope: string, idempotencyKey: string): Promise<void> {
    await this.supabase.from('idempotency_keys').delete().eq('key', this.dbKey(scope, idempotencyKey));
  }

  private dbKey(scope: string, idempotencyKey: string): string {
    return `${scope}:${idempotencyKey}`;
  }

  private async read<T>(key: string): Promise<StoredIdempotencyRecord<T> | null> {
    // Read only unexpired
    const { data } = await this.supabase
      .from('idempotency_keys')
      .select('*')
      .eq('key', key)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle();

    if (!data) return null;

    return {
      fingerprint: data.fingerprint,
      status: data.status as 'pending' | 'completed',
      response: data.response as T | undefined,
    };
  }
}
