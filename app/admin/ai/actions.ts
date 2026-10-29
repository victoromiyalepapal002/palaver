"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai/generate";

function clampInt(v: FormDataEntryValue | null, min: number, max: number, fallback: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export async function updateProvider(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const model = String(formData.get("model") ?? "").trim().slice(0, 120);
  if (!id || !model) throw new Error("Provider and model are required");

  const db = createServiceClient();
  const { error } = await db
    .from("ai_providers")
    .update({
      model,
      priority: clampInt(formData.get("priority"), 1, 99, 1),
      enabled: formData.get("enabled") === "on",
    })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ai");
}

export async function updateSettings(formData: FormData) {
  await requireAdmin();
  const db = createServiceClient();
  const { error } = await db
    .from("settings")
    .update({
      paused: formData.get("paused") === "on",
      auto_approve_topics: formData.get("auto_approve_topics") === "on",
      seconds_between_messages: clampInt(formData.get("seconds_between_messages"), 20, 3600, 90),
      default_max_messages: clampInt(formData.get("default_max_messages"), 10, 300, 60),
      daily_call_cap: clampInt(formData.get("daily_call_cap"), 10, 100000, 800),
      max_live_topics: clampInt(formData.get("max_live_topics"), 1, 10, 2),
      suggestion_themes: String(formData.get("suggestion_themes") ?? "")
        .split("\n")
        .map((w) => w.trim())
        .filter((w) => w.length > 0 && w.length <= 60)
        .slice(0, 30),
      blocked_words: String(formData.get("blocked_words") ?? "")
        .split(/[,\n]/)
        .map((w) => w.trim().toLowerCase())
        .filter((w) => w.length > 0 && w.length <= 40)
        .slice(0, 200),
    })
    .eq("id", 1);
  if (error) throw new Error(error.message);
  revalidatePath("/admin/ai");
}

export type TestState =
  | { status: "idle" }
  | { status: "ok"; text: string; provider: string; model: string }
  | { status: "error"; detail: string };

export async function testAi(_prev: TestState, formData: FormData): Promise<TestState> {
  await requireAdmin();
  const prompt =
    String(formData.get("prompt") ?? "").trim().slice(0, 300) ||
    "Say hello in one short Nigerian Pidgin sentence.";

  const result = await generateText({
    ignorePause: true,
    maxTokens: 120,
    messages: [
      { role: "system", content: "You are a witty Nigerian chat character. Reply in one or two short sentences." },
      { role: "user", content: prompt },
    ],
  });

  revalidatePath("/admin/ai");
  if (result.ok) {
    return { status: "ok", text: result.text, provider: result.provider, model: result.model };
  }
  return { status: "error", detail: result.detail };
}
