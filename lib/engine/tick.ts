import { createServiceClient } from "@/lib/supabase/server";
import { generateText } from "@/lib/ai/generate";
import {
  buildDuelSystemPrompt,
  buildDuelUserPrompt,
  buildSummaryMessages,
  buildSystemPrompt,
  buildUserPrompt,
} from "./prompts";
import { activateUpcoming } from "./topics";
import { suggestTopics } from "./suggest";

type DB = ReturnType<typeof createServiceClient>;

type Char = {
  id: string;
  name: string;
  persona: string;
  language_style: string;
  roast_level: number;
  is_moderator: boolean;
  active: boolean;
};
type Msg = { id: string; character_id: string; body: string; reactions: string[]; created_at: string };
type TopicRow = {
  id: string;
  title: string;
  kind: string;
  message_count: number;
  max_messages: number;
};

const REACTIONS = ["😂", "🔥", "👏", "💀", "😭", "🙌", "🤔", "💯"];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentions(body: string, c: { name: string }): boolean {
  const text = body.toLowerCase();
  const full = c.name.toLowerCase();
  if (text.includes(full)) return true;
  const last = full.split(/\s+/).pop() ?? "";
  return last.length >= 4 && text.includes(last.replace(/[.]/g, ""));
}

function cleanText(raw: string, speakerName: string): string {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  t = t.replace(
    new RegExp(`^[*\\[]*${escapeRegExp(speakerName)}[*\\]]*\\s*[:\\-–]\\s*`, "i"),
    ""
  );
  t = t.replace(/^["“”]+|["“”]+$/g, "").replace(/\*\*/g, "").trim();
  if (t.length > 320) {
    const cut = t.slice(0, 320);
    const end = Math.max(cut.lastIndexOf("."), cut.lastIndexOf("!"), cut.lastIndexOf("?"));
    t = end > 100 ? cut.slice(0, end + 1) : cut.trimEnd() + "…";
  }
  return t;
}

function pickSpeaker(participants: Char[], recent: Msg[]): Char {
  const last = recent[recent.length - 1];
  const lastTwo = recent.slice(-2).reverse(); // [latest, one before]
  const last8 = recent.slice(-8);
  const last6 = recent.slice(-6);
  const moderatorSpokeRecently = last8.some(
    (m) => participants.find((p) => p.id === m.character_id)?.is_moderator
  );

  const weights = participants.map((p) => {
    if (last && p.id === last.character_id) return 0; // nobody speaks twice in a row
    let w = p.is_moderator ? (recent.length >= 8 && !moderatorSpokeRecently ? 3 : 0.4) : 1;
    if (lastTwo[0] && mentions(lastTwo[0].body, p)) w *= 4;
    else if (lastTwo[1] && mentions(lastTwo[1].body, p)) w *= 2;
    if (!last6.some((m) => m.character_id === p.id)) w *= 2;
    return w;
  });

  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return participants[Math.floor(Math.random() * participants.length)];
  let r = Math.random() * total;
  for (let i = 0; i < participants.length; i++) {
    r -= weights[i];
    if (r <= 0) return participants[i];
  }
  return participants[participants.length - 1];
}

/** Writes/refreshes the short summary shown on homepage cards. Best effort. */
export async function summarizeTopic(db: DB, topicId: string, title: string, ended: boolean) {
  const { data: msgs } = await db
    .from("messages")
    .select("character_id, body")
    .eq("topic_id", topicId)
    .order("created_at", { ascending: false })
    .limit(30);
  if (!msgs || msgs.length < 3) return;

  const { data: chars } = await db.from("characters").select("id, name");
  const nameOf = new Map<string, string>((chars ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
  const transcript = [...msgs]
    .reverse()
    .map((m: { character_id: string; body: string }) => `${nameOf.get(m.character_id) ?? "Someone"}: ${m.body}`)
    .join("\n");

  const res = await generateText({
    messages: buildSummaryMessages(title, transcript, ended),
    maxTokens: 120,
    temperature: 0.5,
  });
  if (res.ok) {
    const summary = res.text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/\s+/g, " ").trim().slice(0, 400);
    if (summary) await db.from("topics").update({ summary }).eq("id", topicId);
  }
}

async function postNextMessage(db: DB, topic: TopicRow, blocked: string[]): Promise<string> {
  const { data: links } = await db.from("topic_agents").select("character_id").eq("topic_id", topic.id);
  const ids = (links ?? []).map((l: { character_id: string }) => l.character_id);
  if (ids.length === 0) return "skipped: no characters in this topic";

  const { data: charRows } = await db.from("characters").select("*").in("id", ids);
  const allChars = (charRows ?? []) as Char[];
  const participants = allChars.filter((c) => c.active);
  if (participants.length < 2) return "skipped: fewer than 2 active characters";

  const nameOf = new Map<string, string>(allChars.map((c) => [c.id, c.name]));
  const moderator = participants.find((c) => c.is_moderator) ?? participants[0];

  const { data: recentDesc } = await db
    .from("messages")
    .select("id, character_id, body, reactions, created_at")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: false })
    .limit(14);
  const recent = ((recentDesc ?? []) as Msg[]).slice().reverse();
  const lastMsg = recent[recent.length - 1];

  const count = topic.message_count;
  const mode: "open" | "normal" | "close" =
    count === 0 ? "open" : count >= topic.max_messages - 1 ? "close" : "normal";
  const speaker = mode === "normal" ? pickSpeaker(participants, recent) : moderator;

  // Claim the turn so two overlapping ticks can never post twice.
  const startedAt = Date.now();
  const { data: claimed } = await db
    .from("topics")
    .update({
      typing_character_id: speaker.id,
      typing_until: new Date(startedAt + 45_000).toISOString(),
    })
    .eq("id", topic.id)
    .eq("status", "live")
    .eq("message_count", count)
    .or(`typing_until.is.null,typing_until.lt.${new Date(startedAt).toISOString()}`)
    .select("id");
  if (!claimed || claimed.length === 0) return "skipped: another tick is working on this topic";

  const release = () =>
    db.from("topics").update({ typing_character_id: null, typing_until: null }).eq("id", topic.id);

  // Who are we replying to?
  let replyTo: Msg | null = null;
  if (mode === "normal" && lastMsg) {
    const mentionedIn = recent
      .slice(-2)
      .reverse()
      .find((m) => m.character_id !== speaker.id && mentions(m.body, speaker));
    if (mentionedIn) replyTo = mentionedIn;
    else if (Math.random() < 0.65 && lastMsg.character_id !== speaker.id) replyTo = lastMsg;
  }

  const transcript = recent
    .map((m) => `${nameOf.get(m.character_id) ?? "Someone"}: ${m.body}`)
    .join("\n");

  const res = await generateText({
    maxTokens: 140,
    temperature: 0.95,
    messages: [
      { role: "system", content: buildSystemPrompt(speaker, topic.title) },
      {
        role: "user",
        content: buildUserPrompt({
          transcript,
          speakerName: speaker.name,
          mode,
          replyTo: replyTo
            ? { name: nameOf.get(replyTo.character_id) ?? "someone", body: replyTo.body }
            : null,
          castNames: participants.map((p) => p.name),
        }),
      },
    ],
  });

  if (!res.ok) {
    await release();
    return `skipped: ${res.reason} (${res.detail.slice(0, 160)})`;
  }

  const text = cleanText(res.text, speaker.name);
  if (!text) {
    await release();
    return "skipped: empty reply";
  }
  const lower = text.toLowerCase();
  if (blocked.some((w) => w && lower.includes(w))) {
    await release();
    return "skipped: message contained a blocked word";
  }

  // Feel human: "typing…" lasts longer for longer messages.
  const typingMs = Math.min(7000, Math.max(1800, text.length * 45));
  await sleep(Math.max(0, typingMs - (Date.now() - startedAt)));

  const { error: insertError } = await db.from("messages").insert({
    topic_id: topic.id,
    character_id: speaker.id,
    body: text,
    reply_to: replyTo?.id ?? null,
  });
  if (insertError) {
    await release();
    return `error: ${insertError.message}`;
  }

  const newCount = count + 1;
  const finished = newCount >= topic.max_messages;
  await db
    .from("topics")
    .update({
      message_count: newCount,
      typing_character_id: null,
      typing_until: null,
      ...(finished ? { status: "ended", ended_at: new Date().toISOString() } : {}),
    })
    .eq("id", topic.id);

  // Occasionally someone reacts to a recent message with an emoji.
  if (!finished && Math.random() < 0.35) {
    const candidates = recent.slice(-4).filter((m) => m.character_id !== speaker.id);
    if (candidates.length > 0) {
      const target = candidates[Math.floor(Math.random() * candidates.length)];
      const emoji = REACTIONS[Math.floor(Math.random() * REACTIONS.length)];
      await db
        .from("messages")
        .update({ reactions: [...(target.reactions ?? []), emoji].slice(0, 6) })
        .eq("id", target.id);
    }
  }

  if (finished || newCount % 10 === 0) {
    await summarizeTopic(db, topic.id, topic.title, finished);
  }
  return "posted";
}

/** A duel: two characters, strictly taking turns, left side opens, right side has the last word. */
async function postDuelMessage(db: DB, topic: TopicRow, blocked: string[]): Promise<string> {
  const { data: links } = await db
    .from("topic_agents")
    .select("character_id, side, stance")
    .eq("topic_id", topic.id);
  const rows = (links ?? []) as { character_id: string; side: string | null; stance: string }[];
  const leftRow = rows.find((r) => r.side === "left");
  const rightRow = rows.find((r) => r.side === "right");
  if (!leftRow || !rightRow) return "skipped: a duel needs a left and a right character";

  const { data: charRows } = await db
    .from("characters")
    .select("*")
    .in("id", [leftRow.character_id, rightRow.character_id]);
  const chars = (charRows ?? []) as Char[];
  const left = chars.find((c) => c.id === leftRow.character_id);
  const right = chars.find((c) => c.id === rightRow.character_id);
  if (!left || !right) return "skipped: a duel character was deleted";

  const count = topic.message_count;
  const leftTurn = count % 2 === 0;
  const speaker = leftTurn ? left : right;
  const rival = leftTurn ? right : left;
  const stance = (leftTurn ? leftRow.stance : rightRow.stance) ?? "";
  const mode: "open" | "normal" | "close" =
    count === 0 ? "open" : count >= topic.max_messages - 1 ? "close" : "normal";

  const { data: recentDesc } = await db
    .from("messages")
    .select("id, character_id, body, reactions, created_at")
    .eq("topic_id", topic.id)
    .order("created_at", { ascending: false })
    .limit(10);
  const recent = ((recentDesc ?? []) as Msg[]).slice().reverse();
  const lastMsg = recent[recent.length - 1];

  const startedAt = Date.now();
  const { data: claimed } = await db
    .from("topics")
    .update({
      typing_character_id: speaker.id,
      typing_until: new Date(startedAt + 45_000).toISOString(),
    })
    .eq("id", topic.id)
    .eq("status", "live")
    .eq("message_count", count)
    .or(`typing_until.is.null,typing_until.lt.${new Date(startedAt).toISOString()}`)
    .select("id");
  if (!claimed || claimed.length === 0) return "skipped: another tick is working on this duel";

  const release = () =>
    db.from("topics").update({ typing_character_id: null, typing_until: null }).eq("id", topic.id);

  const nameOf = new Map<string, string>([
    [left.id, left.name],
    [right.id, right.name],
  ]);
  const transcript = recent.map((m) => `${nameOf.get(m.character_id) ?? "Someone"}: ${m.body}`).join("\n");

  const res = await generateText({
    maxTokens: 140,
    temperature: 0.95,
    messages: [
      { role: "system", content: buildDuelSystemPrompt(speaker, rival.name, topic.title, stance) },
      {
        role: "user",
        content: buildDuelUserPrompt({
          transcript,
          speakerName: speaker.name,
          rivalName: rival.name,
          mode,
          rivalLast: lastMsg && lastMsg.character_id === rival.id ? lastMsg.body : null,
        }),
      },
    ],
  });
  if (!res.ok) {
    await release();
    return `skipped: ${res.reason} (${res.detail.slice(0, 160)})`;
  }

  // Spoken text: no emojis or leftover markup.
  const text = cleanText(res.text, speaker.name)
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!text) {
    await release();
    return "skipped: empty reply";
  }
  const lower = text.toLowerCase();
  if (blocked.some((w) => w && lower.includes(w))) {
    await release();
    return "skipped: message contained a blocked word";
  }

  const typingMs = Math.min(6000, Math.max(1800, text.length * 40));
  await sleep(Math.max(0, typingMs - (Date.now() - startedAt)));

  const { error: insertError } = await db.from("messages").insert({
    topic_id: topic.id,
    character_id: speaker.id,
    body: text,
    reply_to: lastMsg?.id ?? null,
  });
  if (insertError) {
    await release();
    return `error: ${insertError.message}`;
  }

  const newCount = count + 1;
  const finished = newCount >= topic.max_messages;
  await db
    .from("topics")
    .update({
      message_count: newCount,
      typing_character_id: null,
      typing_until: null,
      ...(finished ? { status: "ended", ended_at: new Date().toISOString() } : {}),
    })
    .eq("id", topic.id);

  if (finished || newCount % 10 === 0) {
    await summarizeTopic(db, topic.id, topic.title, finished);
  }
  return "posted";
}

/** Once a day (when the queue is short) asks the characters for new topic ideas. */
async function maybeDailySuggestions(db: DB, notes: string[]) {
  const { data: last } = await db
    .from("topics")
    .select("created_at")
    .not("suggested_by", "is", null)
    .order("created_at", { ascending: false })
    .limit(1);
  const ageMs = last?.[0]?.created_at ? Date.now() - new Date(last[0].created_at).getTime() : Infinity;
  if (ageMs < 20 * 60 * 60 * 1000) return;

  const { count: pending } = await db
    .from("topics")
    .select("id", { count: "exact", head: true })
    .in("status", ["suggested", "upcoming"]);
  if ((pending ?? 0) >= 8) return;

  const result = await suggestTopics(db, 3);
  notes.push(`Suggested ${result.created} new topic(s)`);
  for (const n of result.notes) notes.push(`suggest: ${n}`);
}

/** One pass of the engine. Called every minute by the cron, or from the admin "Run now" button. */
export async function runTick(): Promise<{ posted: number; notes: string[] }> {
  const t0 = Date.now();
  const db = createServiceClient();
  const notes: string[] = [];

  const { data: settings } = await db.from("settings").select("*").eq("id", 1).single();
  if (settings?.paused) return { posted: 0, notes: ["Paused in admin"] };

  // Approved topics waiting in the queue start automatically when there is room.
  const started = await activateUpcoming(db, settings?.max_live_topics ?? 2);
  if (started > 0) notes.push(`Started ${started} queued topic(s)`);

  const blocked: string[] = (settings?.blocked_words ?? []).map((w: string) => w.toLowerCase());

  const { data: topics } = await db
    .from("topics")
    .select("id, title, kind, message_count, max_messages")
    .eq("status", "live")
    .order("started_at", { ascending: true })
    .limit(20);

  let posted = 0;
  if (!topics || topics.length === 0) {
    notes.push("No live topics");
  } else {
    // Fast mode: keep going inside this run, taking turns between live topics, so chats feel live.
    // Each line takes a few seconds (typing time), then the next one starts. The next cron run
    // continues where this one stopped.
    const BURST_MS = 38_000; // do not start another line after this; one line takes up to ~12s
    const all = topics as TopicRow[];
    // Duels first: they are the ones people are watching and listening to in real time.
    let active = [...all.filter((t) => t.kind === "duel"), ...all.filter((t) => t.kind !== "duel")];
    const perTopic = new Map<string, number>();

    while (active.length > 0 && Date.now() - t0 < BURST_MS) {
      const next: TopicRow[] = [];
      for (const t of active) {
        if (Date.now() - t0 >= BURST_MS) {
          next.push(t);
          continue;
        }
        let result: string;
        try {
          result =
            t.kind === "duel"
              ? await postDuelMessage(db, t, blocked)
              : await postNextMessage(db, t, blocked);
        } catch (e) {
          notes.push(`${t.title}: error ${e instanceof Error ? e.message : String(e)}`);
          continue; // drop it for this run
        }
        if (result !== "posted") {
          if (!result.startsWith("skipped: another tick")) notes.push(`${t.title}: ${result}`);
          continue; // drop it for this run
        }
        posted++;
        perTopic.set(t.title, (perTopic.get(t.title) ?? 0) + 1);

        const { data: fresh } = await db
          .from("topics")
          .select("id, title, kind, status, message_count, max_messages")
          .eq("id", t.id)
          .single();
        if (fresh && fresh.status === "live") next.push(fresh as TopicRow);
      }
      active = next;
      if (active.length > 0) await sleep(2000);
    }
    for (const [title, n] of perTopic) notes.push(`${title}: ${n} line(s) this run`);
  }

  // Only if there is time left in this run.
  if (Date.now() - t0 < 30_000) {
    try {
      await maybeDailySuggestions(db, notes);
    } catch (e) {
      notes.push(`suggestions error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return { posted, notes };
}
