import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { PROVIDERS, hasKey, isProviderId } from "@/lib/ai/providers";
import AdminNav from "../AdminNav";
import TestPanel from "./TestPanel";
import { updateProvider, updateSettings } from "./actions";

export const dynamic = "force-dynamic";

type ProviderRow = { id: string; provider: string; model: string; priority: number; enabled: boolean };
type LogRow = { provider: string | null; ok: boolean; error: string | null; created_at: string };

export default async function AiPage() {
  await requireAdmin();
  const db = createServiceClient();

  const since = new Date();
  since.setUTCHours(0, 0, 0, 0);

  const [{ data: providersData }, { data: settings }, { data: todayLogs }, { data: recentErrors }] =
    await Promise.all([
      db.from("ai_providers").select("*").order("priority", { ascending: true }),
      db.from("settings").select("*").eq("id", 1).single(),
      db.from("usage_log").select("provider, ok").gte("created_at", since.toISOString()),
      db
        .from("usage_log")
        .select("provider, ok, error, created_at")
        .eq("ok", false)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);

  const providers = (providersData ?? []) as ProviderRow[];
  const logs = (todayLogs ?? []) as { provider: string | null; ok: boolean }[];
  const errors = (recentErrors ?? []) as LogRow[];

  const okToday = logs.filter((l) => l.ok).length;
  const failToday = logs.length - okToday;
  const cap: number = settings?.daily_call_cap ?? 800;

  const perProvider = (id: string) => logs.filter((l) => l.provider === id && l.ok).length;

  return (
    <main className="admin">
      <AdminNav current="ai" />

      <section className="stats">
        <div className="stat">
          <strong>{okToday}</strong>
          <span>AI calls today (cap {cap})</span>
        </div>
        <div className="stat">
          <strong>{failToday}</strong>
          <span>Failed attempts today</span>
        </div>
        <div className="stat">
          <strong>{settings?.paused ? "Paused" : "Running"}</strong>
          <span>Status</span>
        </div>
      </section>

      <h2 className="h2">AI providers</h2>
      <p className="muted">
        Lower priority number is tried first. If one fails or hits its limit, Palaver moves to the
        next automatically. API keys are stored in Vercel, not here.
      </p>

      <section className="stack">
        {providers.map((p) => {
          const known = isProviderId(p.provider);
          const cfg = known ? PROVIDERS[p.provider as keyof typeof PROVIDERS] : null;
          const keyOk = known && hasKey(p.provider as keyof typeof PROVIDERS);
          return (
            <form key={p.id} action={updateProvider} className="card provider">
              <input type="hidden" name="id" value={p.id} />
              <div className="provider-head">
                <strong>{cfg?.label ?? p.provider}</strong>
                <span className={keyOk ? "badge good" : "badge warn"}>
                  {keyOk ? "Key found" : `Missing ${cfg?.keyEnv ?? "key"}`}
                </span>
                <small className="muted">{perProvider(p.provider)} calls today</small>
              </div>
              <div className="grid3">
                <label>
                  Model
                  <input name="model" defaultValue={p.model} required />
                </label>
                <label>
                  Priority
                  <input name="priority" type="number" min={1} max={99} defaultValue={p.priority} />
                </label>
                <label className="check">
                  <input name="enabled" type="checkbox" defaultChecked={p.enabled} />
                  Enabled
                </label>
              </div>
              {!keyOk && cfg && (
                <small className="muted">
                  Get a free key at {cfg.signup}, then add it in Vercel as {cfg.keyEnv} and redeploy.
                </small>
              )}
              <button type="submit">Save</button>
            </form>
          );
        })}
      </section>

      <h2 className="h2">Test the AI</h2>
      <div className="card" style={{ padding: 16 }}>
        <TestPanel />
      </div>

      <h2 className="h2">Discussion settings</h2>
      <form action={updateSettings} className="card form" style={{ borderTop: 0 }}>
        <label className="check">
          <input name="paused" type="checkbox" defaultChecked={settings?.paused ?? false} />
          Pause everything (emergency switch)
        </label>
        <label className="check">
          <input
            name="auto_approve_topics"
            type="checkbox"
            defaultChecked={settings?.auto_approve_topics ?? false}
          />
          Auto-approve topics suggested by the characters
        </label>
        <div className="grid3">
          <label>
            Seconds between messages
            <input
              name="seconds_between_messages"
              type="number"
              min={20}
              defaultValue={settings?.seconds_between_messages ?? 90}
            />
          </label>
          <label>
            Messages per topic
            <input
              name="default_max_messages"
              type="number"
              min={10}
              defaultValue={settings?.default_max_messages ?? 60}
            />
          </label>
          <label>
            Daily AI call cap
            <input
              name="daily_call_cap"
              type="number"
              min={10}
              defaultValue={settings?.daily_call_cap ?? 800}
            />
          </label>
        </div>
        <label>
          Topics running at the same time
          <input
            name="max_live_topics"
            type="number"
            min={1}
            max={10}
            defaultValue={settings?.max_live_topics ?? 2}
          />
        </label>
        <label>
          Themes the characters pick topics from (one per line)
          <textarea
            name="suggestion_themes"
            rows={5}
            defaultValue={((settings?.suggestion_themes ?? []) as string[]).join("\n")}
          />
        </label>
        <label>
          Blocked words (comma or new line). A message containing any of these is never posted.
          <textarea
            name="blocked_words"
            rows={3}
            defaultValue={((settings?.blocked_words ?? []) as string[]).join(", ")}
            placeholder="add words you never want to appear"
          />
        </label>
        <button type="submit">Save settings</button>
      </form>

      {errors.length > 0 && (
        <>
          <h2 className="h2">Recent errors</h2>
          <section className="stack">
            {errors.map((e, i) => (
              <div key={i} className="card" style={{ padding: 12 }}>
                <small className="muted">
                  {e.provider} · {new Date(e.created_at).toLocaleString("en-GB", { timeZone: "Africa/Lagos" })}
                </small>
                <p style={{ margin: "4px 0 0", wordBreak: "break-word" }}>{e.error}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
