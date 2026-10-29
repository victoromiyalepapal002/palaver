import { createServiceClient } from "@/lib/supabase/server";

type DB = ReturnType<typeof createServiceClient>;

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
  return `${base || "topic"}-${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Turns a suggested/upcoming topic into a live one: picks the cast
 * (the proposer + up to 4 random others + the host) and starts it.
 */
export async function activateTopic(db: DB, topicId: string): Promise<string> {
  const { data: topic } = await db
    .from("topics")
    .select("id, suggested_by")
    .eq("id", topicId)
    .single();
  if (!topic) return "topic not found";

  const { data: chars } = await db.from("characters").select("id, is_moderator").eq("active", true);
  const active = (chars ?? []) as { id: string; is_moderator: boolean }[];
  const moderator = active.find((c) => c.is_moderator);
  const speakers = active.filter((c) => !c.is_moderator);

  const chosen = new Set<string>();
  if (topic.suggested_by && speakers.some((s) => s.id === topic.suggested_by)) {
    chosen.add(topic.suggested_by);
  }
  for (const s of [...speakers].sort(() => Math.random() - 0.5)) {
    if (chosen.size >= 5) break;
    chosen.add(s.id);
  }
  if (chosen.size < 2) return "not enough active characters";
  if (moderator) chosen.add(moderator.id);

  await db.from("topic_agents").delete().eq("topic_id", topicId);
  const { error } = await db
    .from("topic_agents")
    .insert([...chosen].map((character_id) => ({ topic_id: topicId, character_id })));
  if (error) return error.message;

  const { data: settings } = await db
    .from("settings")
    .select("default_max_messages")
    .eq("id", 1)
    .single();

  const { error: updateError } = await db
    .from("topics")
    .update({
      status: "live",
      started_at: new Date().toISOString(),
      max_messages: settings?.default_max_messages ?? 60,
    })
    .eq("id", topicId);
  return updateError ? updateError.message : "live";
}

/** Starts queued ("upcoming") topics while there is room for more live ones. */
export async function activateUpcoming(db: DB, maxLive: number): Promise<number> {
  const { count } = await db
    .from("topics")
    .select("id", { count: "exact", head: true })
    .eq("status", "live");
  const room = Math.max(0, maxLive - (count ?? 0));
  if (room === 0) return 0;

  const { data: queued } = await db
    .from("topics")
    .select("id")
    .eq("status", "upcoming")
    .order("created_at", { ascending: true })
    .limit(room);

  let started = 0;
  for (const q of (queued ?? []) as { id: string }[]) {
    if ((await activateTopic(db, q.id)) === "live") started++;
  }
  return started;
}
