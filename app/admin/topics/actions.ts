"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import { runTick, summarizeTopic } from "@/lib/engine/tick";
import { activateTopic, slugify } from "@/lib/engine/topics";
import { suggestTopics } from "@/lib/engine/suggest";

export type CreateState = { error?: string; ok?: boolean };

export async function createTopic(
  _prev: CreateState | undefined,
  formData: FormData
): Promise<CreateState> {
  await requireAdmin();

  const title = String(formData.get("title") ?? "").trim();
  if (title.length < 5 || title.length > 140) {
    return { error: "Give the topic a title between 5 and 140 characters." };
  }

  const picked = formData.getAll("agents").map(String);
  const db = createServiceClient();

  const { data: chars } = await db.from("characters").select("id, is_moderator").eq("active", true);
  const active = (chars ?? []) as { id: string; is_moderator: boolean }[];
  const moderator = active.find((c) => c.is_moderator);

  const ids = new Set(picked.filter((id) => active.some((c) => c.id === id)));
  if (moderator) ids.add(moderator.id);
  if (ids.size < 3) return { error: "Pick at least 2 characters (the moderator joins automatically)." };

  const { data: settings } = await db.from("settings").select("default_max_messages").eq("id", 1).single();
  const maxRaw = Number(formData.get("max_messages"));
  const max = Number.isFinite(maxRaw) && maxRaw >= 10 && maxRaw <= 300
    ? Math.round(maxRaw)
    : settings?.default_max_messages ?? 60;

  const { data: topic, error } = await db
    .from("topics")
    .insert({
      title,
      slug: slugify(title),
      status: "live",
      max_messages: max,
      started_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error || !topic) return { error: error?.message ?? "Could not create the topic." };

  const { error: linkError } = await db
    .from("topic_agents")
    .insert([...ids].map((character_id) => ({ topic_id: topic.id, character_id })));
  if (linkError) {
    await db.from("topics").delete().eq("id", topic.id);
    return { error: linkError.message };
  }

  revalidatePath("/admin/topics");
  revalidatePath("/");
  return { ok: true };
}

export async function endTopic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = createServiceClient();
  const { data: topic } = await db.from("topics").select("title").eq("id", id).single();
  await db
    .from("topics")
    .update({
      status: "ended",
      ended_at: new Date().toISOString(),
      typing_character_id: null,
      typing_until: null,
    })
    .eq("id", id);
  if (topic) await summarizeTopic(db, id, topic.title, true);
  revalidatePath("/admin/topics");
  revalidatePath("/");
}

export async function deleteTopic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const db = createServiceClient();
  await db.from("topics").delete().eq("id", id);
  revalidatePath("/admin/topics");
  revalidatePath("/");
}

export type TickState = { ran: boolean; lines: string[] };

export async function runTickNow(_prev: TickState, _formData: FormData): Promise<TickState> {
  await requireAdmin();
  const result = await runTick();
  revalidatePath("/admin/topics");
  return { ran: true, lines: [`Posted ${result.posted} message(s).`, ...result.notes] };
}

// ---------- suggestions queue ----------

async function setStatus(id: string, status: "upcoming" | "rejected") {
  const db = createServiceClient();
  await db.from("topics").update({ status }).eq("id", id).in("status", ["suggested", "upcoming"]);
  revalidatePath("/admin/topics");
  revalidatePath("/");
}

export async function approveTopic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await setStatus(id, "upcoming");
}

export async function rejectTopic(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (id) await setStatus(id, "rejected");
}

export async function startTopicNow(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await activateTopic(createServiceClient(), id);
  revalidatePath("/admin/topics");
  revalidatePath("/");
}

export type SuggestState = { ran: boolean; lines: string[] };

export async function askForIdeas(_prev: SuggestState, _formData: FormData): Promise<SuggestState> {
  await requireAdmin();
  const result = await suggestTopics(createServiceClient(), 3);
  revalidatePath("/admin/topics");
  revalidatePath("/");
  return { ran: true, lines: [`Got ${result.created} new idea(s).`, ...result.notes] };
}
