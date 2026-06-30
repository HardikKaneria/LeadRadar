-- Update check constraints on ai_task_routes
ALTER TABLE public.ai_task_routes DROP CONSTRAINT IF EXISTS ai_task_routes_primary_provider_check;
ALTER TABLE public.ai_task_routes ADD CONSTRAINT ai_task_routes_primary_provider_check 
  CHECK (primary_provider = ANY (ARRAY['gemini'::text, 'groq'::text, 'openrouter'::text, 'ollama'::text, 'openai'::text, 'anthropic'::text, 'jina'::text]));

ALTER TABLE public.ai_task_routes DROP CONSTRAINT IF EXISTS ai_task_routes_fallback_provider_check;
ALTER TABLE public.ai_task_routes ADD CONSTRAINT ai_task_routes_fallback_provider_check 
  CHECK (fallback_provider IS NULL OR fallback_provider = ANY (ARRAY['gemini'::text, 'groq'::text, 'openrouter'::text, 'ollama'::text, 'openai'::text, 'anthropic'::text, 'jina'::text]));

ALTER TABLE public.ai_task_routes DROP CONSTRAINT IF EXISTS ai_task_routes_fallback_2_provider_check;
ALTER TABLE public.ai_task_routes ADD CONSTRAINT ai_task_routes_fallback_2_provider_check 
  CHECK (fallback_2_provider IS NULL OR fallback_2_provider = ANY (ARRAY['gemini'::text, 'groq'::text, 'openrouter'::text, 'ollama'::text, 'openai'::text, 'anthropic'::text, 'jina'::text]));

-- Insert Jina models into the catalog
INSERT INTO public.ai_model_catalog (
  provider,
  model,
  display_name,
  is_free_tier,
  is_active,
  supports_embedding,
  embedding_dims
)
VALUES
  ('jina', 'jina-embeddings-v3', 'Jina Embeddings V3', false, true, true, 1024)
ON CONFLICT (provider, model) DO NOTHING;
