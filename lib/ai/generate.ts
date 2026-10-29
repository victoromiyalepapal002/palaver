import { createServiceClient } from "@/lib/supabase/server";
import { PROVIDERS, hasKey, isProviderId } from "./providers";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type GenerateResult =
  | { ok: true; text: string; provider: string; model: string }
  | { ok: false; reason: "paused" | "cap_reached" | "no_provider" | "all_failed"; detail: string };

const REQUEST_TIMEOUT_MS = 25_000;

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

async function callProvider(
  url: string,
  key: string,
  model: string,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      throw new Error(`HTTP ${res.status}: ${body}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const text = json.choices?.[0]?.message?.content?.trim();
    if (!text) throw new Error("Empty response");
    return text;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The one function the rest of the app uses to talk to AI.
 * Which provider/model is used comes from the database (admin page), never from code.
 * Tries enabled providers in priority order and falls back automatically.
 */
export async function generateText(opts: {
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  /** Test calls from admin bypass the pause switch (but still respect the daily cap). */
  ignorePause?: boolean;
}): Promise<GenerateResult> {
  const db = createServiceClient();
  const maxTokens = opts.maxTokens ?? 200;
  const temperature = opts.temperature ?? 0.9;

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  if (settings?.paused && !opts.ignorePause) {
    return { ok: false, reason: "paused", detail: "Palaver is paused in admin." };
  }

  const cap: number = settings?.daily_call_cap ?? 800;
  const { count: usedToday } = await db
    .from("usage_log")
    .select("id", { count: "exact", head: true })
    .eq("ok", true)
    .gte("created_at", startOfTodayUtc());
  if ((usedToday ?? 0) >= cap) {
    return { ok: false, reason: "cap_reached", detail: `Daily cap of ${cap} AI calls reached.` };
  }

  const { data: providers } = await db
    .from("ai_providers")
    .select("provider, model, priority")
    .eq("enabled", true)
    .order("priority", { ascending: true });

  const usable = (providers ?? []).filter((p) => isProviderId(p.provider) && hasKey(p.provider));
  if (usable.length === 0) {
    return {
      ok: false,
      reason: "no_provider",
      detail: "No enabled provider has an API key set. Add a key in Vercel and enable the provider.",
    };
  }

  const errors: string[] = [];
  for (const p of usable) {
    if (!isProviderId(p.provider)) continue;
    const cfg = PROVIDERS[p.provider];
    const key = process.env[cfg.keyEnv]!;
    try {
      const text = await callProvider(cfg.url, key, p.model, opts.messages, maxTokens, temperature);
      await db.from("usage_log").insert({ provider: p.provider, model: p.model, ok: true });
      return { ok: true, text, provider: p.provider, model: p.model };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${cfg.label}: ${msg}`);
      await db
        .from("usage_log")
        .insert({ provider: p.provider, model: p.model, ok: false, error: msg.slice(0, 500) });
      // fall through to the next provider
    }
  }

  return { ok: false, reason: "all_failed", detail: errors.join(" | ") };
}
