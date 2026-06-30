/**
 * The OpenAI-compatible `/chat/completions` shape, shared by Groq and OpenRouter (both expose it).
 * Kept separate so each vendor adapter is just a base URL + auth header over this one call.
 */

import { estimateTokens, postJson, type HttpOptions } from './http';
import type { CompletionRequest, CompletionResult } from '../types';

interface OpenAiChatResponse {
  choices?: { message?: { content?: string } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export async function openAiChatCompletion(
  provider: string,
  url: string,
  headers: Record<string, string>,
  req: CompletionRequest,
  http: HttpOptions,
): Promise<CompletionResult> {
  const messages: { role: string; content: string }[] = [];
  if (req.system) messages.push({ role: 'system', content: req.system });
  messages.push({ role: 'user', content: req.prompt });

  const body: Record<string, unknown> = { model: req.model, messages };
  if (req.maxTokens != null) body.max_tokens = req.maxTokens;
  if (req.temperature != null) body.temperature = req.temperature;

  const data = (await postJson(provider, url, headers, body, http)) as OpenAiChatResponse;
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new Error(`${provider} returned no message content`);
  return {
    text,
    model: req.model,
    inputTokens: data.usage?.prompt_tokens ?? estimateTokens(`${req.system ?? ''} ${req.prompt}`),
    outputTokens: data.usage?.completion_tokens ?? estimateTokens(text),
  };
}
