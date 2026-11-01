import { createServiceClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai/generate";
import { slugify } from "./topics";

type DB = ReturnType<typeof createServiceClient>;

/**
 * Asks different characters to each propose one debate topic.
 * With "auto-approve" on, topics go straight to the public "Up next" queue;
 * otherwise they wait for you in admin.
 */
export async function suggestTopics(
  db: DB,
  count = 3
): Promise<{ created: number; notes: string[] }> {
  const notes: string[] = [];

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  const themes: string[] =
    settings?.suggestion_themes?.length > 0 ? settings.suggestion_themes : ["life in Nigeria"];
  const blocked: string[] = (settings?.blocked_words ?? []).map((w: string) => w.toLowerCase());
  const auto = Boolean(settings?.auto_approve_topics);

  const { data: charRows } = await db
    .from("characters")
    .select("id, name, persona")
    .eq("active", true)
    .eq("is_moderator", false);
  const pool = ((charRows ?? []) as { id: string; name: string; persona: string }[]).sort(
    () => Math.random() - 0.5
  );
  if (pool.length === 0) return { created: 0, notes: ["No active characters to ask"] };

  const { data: existing } = await db
    .from("topics")
    .select("title")
    .order("created_at", { ascending: false })
    .limit(80);
  const seen = new Set<string>(
    ((existing ?? []) as { title: string }[]).map((t) => t.title.toLowerCase().trim())
  );

  let created = 0;
  for (let i = 0; i < count; i++) {
    const proposer = pool[i % pool.length];
    const theme = themes[Math.floor(Math.random() * themes.length)];
    const avoid = [...seen].slice(0, 15).join("\n");

    const res = await generateText({
      maxTokens: 60,
      temperature: 1,
      messages: [
        {
          role: "system",
          content: `You are "${proposer.name}": ${proposer.persona}\nYou are proposing a debate topic for a Nigerian group-chat site where AI characters argue like friends.`,
        },
        {
          role: "user",
          content: `Theme: ${theme}.\n\nTopics already used (do not repeat or closely copy):\n${avoid || "(none yet)"}\n\nPropose ONE fresh debate topic that splits people roughly 50/50 and that everyone has a gut opinion on. It must be a short question with two clearly opposite sides, rooted in everyday life, money, relationships, work, family, technology or tradition, and phrased so a stranger can pick a side in two seconds. Style examples: "Should a man pay on the first date?", "Is japa the smartest move or just running away?". Avoid dry policy or technical topics, and avoid questions with an obvious right answer. Maximum 90 characters. Do not name real people. Nothing hateful, no attacks on any tribe, religion or gender. No quotation marks, no numbering, no explanation. Output only the topic.`,
        },
      ],
    });

    if (!res.ok) {
      notes.push(`AI unavailable: ${res.reason}`);
      break;
    }

    let title =
      res.text
        .replace(/<think>[\s\S]*?<\/think>/gi, "")
        .split("\n")
        .map((l) => l.trim())
        .find(Boolean) ?? "";
    title = title
      .replace(/^[-*\d.)\s]+/, "")
      .replace(/^["“'`]+|["”'`]+$/g, "")
      .trim();

    if (title.length < 12 || title.length > 110) {
      notes.push(`Skipped a topic with a bad length: "${title.slice(0, 40)}"`);
      continue;
    }
    const key = title.toLowerCase();
    if (seen.has(key)) {
      notes.push("Skipped a duplicate topic");
      continue;
    }
    if (blocked.some((w) => w && key.includes(w))) {
      notes.push("Skipped a topic containing a blocked word");
      continue;
    }

    const { error } = await db.from("topics").insert({
      title,
      slug: slugify(title),
      status: auto ? "upcoming" : "suggested",
      suggested_by: proposer.id,
    });
    if (error) {
      notes.push(error.message);
      continue;
    }
    seen.add(key);
    created++;
  }

  return { created, notes };
}
