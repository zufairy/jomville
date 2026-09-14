/**
 * Gemini via kie.ai (OpenAI-compatible chat completions), same contract the
 * vello support chat uses. Returns '' when the key is missing or the call fails
 * so callers can fall back to canned lines.
 */
const KIE_GEMINI_MODEL = process.env.KIE_GEMINI_MODEL?.trim() || 'gemini-3-6-flash-openai';
const KIE_GEMINI_COMPLETIONS = `https://api.kie.ai/${KIE_GEMINI_MODEL}/v1/chat/completions`;

export interface ChatMsg {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export function kieKey(): string {
  return process.env.KIE_API_KEY?.trim() || process.env.KIE_API_TOKEN?.trim() || '';
}

/** Direct Google Gemini (generativelanguage API) when GEMINI_API_KEY is set; used when kie is unavailable or out of credits. */
async function googleGemini(messages: ChatMsg[], opts: { maxTokens?: number; timeoutMs?: number }): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim() || '';
  if (!key) return '';
  const model = process.env.GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
  const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }));
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ systemInstruction: system ? { parts: [{ text: system }] } : undefined, contents, generationConfig: { maxOutputTokens: opts.maxTokens ?? 120 } }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new Error(`google HTTP ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    return String(data?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '').trim();
  } catch (e) {
    console.warn(`[gemini] direct unavailable: ${e instanceof Error ? e.message : e}`);
    return '';
  }
}

export async function geminiChat(messages: ChatMsg[], opts: { maxTokens?: number; timeoutMs?: number } = {}): Promise<string> {
  const key = kieKey();
  if (!key) return googleGemini(messages, opts);
  try {
    const res = await fetch(KIE_GEMINI_COMPLETIONS, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: KIE_GEMINI_MODEL, stream: false, max_tokens: opts.maxTokens ?? 120, messages }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });
    if (!res.ok) throw new Error(`gemini HTTP ${res.status}`);
    const data = (await res.json().catch(() => ({}))) as { code?: number; msg?: string; choices?: Array<{ message?: { content?: string } }> };
    // kie's "bad request" shape carries code/msg with a 200 status
    if (data?.code && data.code !== 200) throw new Error(`gemini ${data.code}: ${data.msg ?? 'unknown'}`);
    return String(data?.choices?.[0]?.message?.content ?? '').trim();
  } catch (e) {
    console.warn(`[kie] gemini unavailable: ${e instanceof Error ? e.message : e}`);
    return googleGemini(messages, opts);
  }
}
