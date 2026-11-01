import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { PublicCharacter, PublicMessage, PublicTopic } from "@/lib/types";
import ChatRoom from "./ChatRoom";
import DuelRoom from "./DuelRoom";

export const dynamic = "force-dynamic";

const CHAR_COLUMNS = "id, name, avatar, color, tagline, language_style, is_moderator, active";

async function loadTopic(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("topics").select("*").eq("slug", slug).maybeSingle();
  return { supabase, topic: (data ?? null) as PublicTopic | null };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { topic } = await loadTopic(slug);
  if (!topic) return { title: "Palaver" };
  const description = topic.summary || "Watch the voices argue it out, live.";
  return {
    title: `${topic.title} · Palaver`,
    description,
    openGraph: { title: topic.title, description, siteName: "Palaver", type: "article" },
    twitter: { card: "summary_large_image", title: topic.title, description },
  };
}

export default async function TopicPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ clip?: string }>;
}) {
  const { slug } = await params;
  const { clip } = await searchParams;
  const { supabase, topic } = await loadTopic(slug);
  if (!topic) notFound();

  const [{ data: messages }, { data: links }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("topic_id", topic.id)
      .order("created_at", { ascending: true })
      .limit(400),
    supabase.from("topic_agents").select("character_id, side, stance").eq("topic_id", topic.id),
  ]);

  const linkRows = (links ?? []) as { character_id: string; side: string | null; stance: string }[];
  const ids = linkRows.map((l) => l.character_id);
  const { data: chars } = ids.length
    ? await supabase.from("characters").select(CHAR_COLUMNS).in("id", ids)
    : { data: [] };

  if (topic.kind === "duel") {
    const sideOf = (side: "left" | "right") => {
      const row = linkRows.find((l) => l.side === side);
      const c = (chars ?? []).find((x: { id: string }) => x.id === row?.character_id) as
        | PublicCharacter
        | undefined;
      return c ? { character: c, stance: row?.stance ?? "" } : null;
    };
    const left = sideOf("left");
    const right = sideOf("right");
    if (left && right) {
      return (
        <DuelRoom
          initialTopic={topic}
          initialMessages={(messages ?? []) as PublicMessage[]}
          left={left}
          right={right}
          clip={clip === "1"}
        />
      );
    }
  }

  return (
    <ChatRoom
      initialTopic={topic}
      initialMessages={(messages ?? []) as PublicMessage[]}
      characters={(chars ?? []) as PublicCharacter[]}
    />
  );
}
