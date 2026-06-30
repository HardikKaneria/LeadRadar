-- Phase 3 · Embeddings + analysis pipeline (P3-07).
-- The analysis pipeline now populates `discoveries.embedding` (vector(1536)) via the
-- `generate-embedding` job, so the ivfflat index deferred in P2-03 (0005_discovery.sql) can land.
-- Cosine ops match the gateway's embedding semantics; nulls are skipped until embeddings populate.

create index if not exists discoveries_embedding_ivfflat
  on public.discoveries using ivfflat (embedding vector_cosine_ops) with (lists = 100);
