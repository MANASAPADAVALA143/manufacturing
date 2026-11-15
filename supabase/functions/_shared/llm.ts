import { HttpError } from './http.ts';

/** OpenAI-compatible chat completion. Configure AI_API_URL / AI_API_KEY / AI_MODEL as function secrets. */
export async function chatJson<T>(messages: unknown[], opts: { model?: string; maxTokens?: number } = {}): Promise<T> {
  const key = Deno.env.get('AI_API_KEY');
  if (!key) throw new HttpError(503, 'AI service is not configured (AI_API_KEY secret missing)');
  const url = Deno.env.get('AI_API_URL') ?? 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: opts.model ?? Deno.env.get('AI_MODEL') ?? 'gpt-4o-mini',
      temperature: 0,
      max_tokens: opts.maxTokens ?? 900,
      response_format: { type: 'json_object' },
      messages,
    }),
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) throw new HttpError(502, `AI provider error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const content = body?.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content) as T;
  } catch {
    throw new HttpError(502, 'AI provider returned invalid JSON');
  }
}
