/**
 * Shared HTTP plumbing for the live provider adapters: a minimal `fetch` abstraction (so adapters
 * stay testable and don't pull in a DOM lib), a request timeout via AbortController, and a
 * normalized error. A thrown `ProviderHttpError` is what the ModelRouter treats as a fallback
 * trigger (next attempt in the route).
 */

export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  text(): Promise<string>;
  headers?: { get(name: string): string | null };
}>;

export interface HttpOptions {
  /** Injectable fetch (tests). Defaults to the global `fetch` (Node 18+). */
  fetch?: FetchLike;
  /** Per-request timeout in ms. Default 30_000. */
  timeoutMs?: number;
}

export class ProviderHttpError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    readonly detail: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(`${provider} HTTP ${status}: ${detail}`);
    this.name = 'ProviderHttpError';
  }
}

function parseRetryAfterSeconds(value: string | null | undefined): number | undefined {
  if (!value) return undefined;

  const asNumber = Number(value);
  if (Number.isFinite(asNumber) && asNumber >= 0) {
    return Math.ceil(asNumber);
  }

  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) return undefined;

  return Math.max(0, Math.ceil((asDate - Date.now()) / 1000));
}

const defaultFetch: FetchLike = (url, init) => {
  const f = (globalThis as { fetch?: FetchLike }).fetch;
  if (!f) throw new Error('global fetch is not available; pass options.fetch');
  return f(url, init);
};

/** POST a JSON body and return the parsed JSON response, or throw ProviderHttpError. */
export async function postJson(
  provider: string,
  url: string,
  headers: Record<string, string>,
  body: unknown,
  options: HttpOptions = {},
): Promise<unknown> {
  const fetchImpl = options.fetch ?? defaultFetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 30_000);

  let res: {
    ok: boolean;
    status: number;
    text(): Promise<string>;
    headers?: { get(name: string): string | null };
  };
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (error) {
    throw new ProviderHttpError(provider, 0, error instanceof Error ? error.message : String(error));
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  if (!res.ok) {
    throw new ProviderHttpError(
      provider,
      res.status,
      text.slice(0, 500),
      parseRetryAfterSeconds(res.headers?.get('retry-after')),
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new ProviderHttpError(provider, res.status, `invalid JSON response: ${text.slice(0, 200)}`);
  }
}

/** Rough whitespace token estimate — only used when a provider omits usage counts. */
export function estimateTokens(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}
