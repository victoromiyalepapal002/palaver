import { createServiceClient } from "@/lib/supabase/server";
import { PROVIDERS, hasKey, isProviderId, type ProviderId } from "./providers";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type GenerateResult =
  | { ok: true; text: string; provider: string; model: string }
  | {
      ok: false;
      reason: "paused" | "cap_reached" | "no_provider" | "all_failed";
      detail: string;
    };

const REQUEST_TIMEOUT_MS = 15_000; // per provider
const TOTAL_BUDGET_MS = 40_000; // stop trying more providers after this
const HARD_COOLDOWN_MS = 10 * 60_000; // wrong model name, bad key, no credit
const SOFT_COOLDOWN_MS = 90_000; // rate limit, busy, timeout, empty reply

// Errors that will not fix themselves in a few minutes.
const HARD_ERROR = /HTTP (401|402|403|404)|model_not_found|does not exist|not found|invalid api key/i;

type LogRow = {
  provider: string | null;
  model: string | null;
  ok: boolean;
  error: string | null;
  created_at: string;
};
type ProviderRow = { provider: string; model: string; priority: number };

function startOfTodayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}

// "Thinking" models spend part of the token budget reasoning before they answer.
// With a small budget they can return an empty message.
function isReasoningModel(model: string): boolean {
  return /gpt-oss|deepseek-r1|qwq/i.test(model);
}

/**
 * Looks at the newest attempt for this provider + model. A model that just failed is skipped
 * for a while so one broken provider does not slow down or spam every message.
 * Changing the model name in admin starts fresh, because the history is per model.
 */
function cooldownState(rows: LogRow[], provider: string, model: string): "ready" | "soft" | "hard" {
  const last = rows.find((r) => r.provider === provider && r.model === model);
  if (!last || last.ok) return "ready";
  const age = Date.now() - new Date(last.created_at).getTime();
  if (HARD_ERROR.test(last.error ?? "")) return age < HARD_COOLDOWN_MS ? "hard" : "ready";
  return age < SOFT_COOLDOWN_MS ? "soft" : "ready";
}

async function callProvider(
  url: string,
  key: string,
  payload: Record<string, unknown>
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
      body: JSON.stringify(payload),
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
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`Timed out after ${REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw e;
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
  /** Test calls from admin also try providers that recently failed. */
  ignoreCooldown?: boolean;
}): Promise<GenerateResult> {
  const t0 = Date.now();
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

  const usable = ((providers ?? []) as ProviderRow[]).filter(
    (p): p is ProviderRow & { provider: ProviderId } => isProviderId(p.provider) && hasKey(p.provider)
  );
  if (usable.length === 0) {
    return {
      ok: false,
      reason: "no_provider",
      detail: "No enabled provider has an API key set. Add a key in Vercel and enable the provider.",
    };
  }

  const { data: recent } = await db
    .from("usage_log")
    .select("provider, model, ok, error, created_at")
    .gte("created_at", new Date(Date.now() - HARD_COOLDOWN_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (recent ?? []) as LogRow[];

  const states = usable.map((p) => ({
    p,
    state: opts.ignoreCooldown ? ("ready" as const) : cooldownState(rows, p.provider, p.model),
  }));

  // Healthy providers first, then ones that were only rate-limited or busy a moment ago.
  // Providers with a setup problem (wrong model name, bad key) are not retried until fixed.
  const order = [
    ...states.filter((s) => s.state === "ready"),
    ...states.filter((s) => s.state === "soft"),
  ].map((s) => s.p);

  if (order.length === 0) {
    const detail = states
      .map(({ p }) => {
        const last = rows.find((r) => r.provider === p.provider && r.model === p.model);
        return `${PROVIDERS[p.provider].label} (${p.model}): ${last?.error ?? "unavailable"}`;
      })
      .join(" | ");
    return {
      ok: false,
      reason: "all_failed",
      detail: `Every provider has a setup problem. Fix the model name or key in AI & Settings, then press Run test. ${detail}`.slice(
        0,
        600
      ),
    };
  }

  const errors: string[] = [];
  for (const p of order) {
    if (Date.now() - t0 > TOTAL_BUDGET_MS) {
      errors.push("Stopped early to stay inside the time limit");
      break;
    }

    const cfg = PROVIDERS[p.provider];
    const key = process.env[cfg.keyEnv]!;
    const reasoning = isReasoningModel(p.model);

    const payload: Record<string, unknown> = {
      model: p.model,
      messages: opts.messages,
      max_tokens: reasoning ? Math.max(maxTokens, 700) : maxTokens,
      temperature,
    };
    if (reasoning && p.provider === "groq" && /gpt-oss/i.test(p.model)) {
      payload.reasoning_effort = "low";
    }

    try {
      const text = await callProvider(cfg.url, key, payload);
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
