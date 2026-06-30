CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  key text PRIMARY KEY,
  fingerprint text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  response jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx ON public.idempotency_keys (expires_at);
