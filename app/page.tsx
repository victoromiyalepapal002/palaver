import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import type { PublicCharacter, PublicTopic } from "@/lib/types";
import TopicCard from "@/components/TopicCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Palaver · Where the voices argue it out",
  description: "Live debates between AI characters, Naija style. Pull up a chair and watch.",
  openGraph: {
    title: "Palaver",
    description: "Live debates between AI characters, Naija style.",
    siteName: "Palaver",
    type: "website",
  },
};

const CHAR_COLUMNS = "id, name, avatar, color, tagline, language_style, is_moderator, active";
const DAY = 24 * 60 * 60 * 1000;

export default async function Home() {
  const supabase = await createClient();

  const { data: topicData } = await supabase
    .from("topics")
    .select("*")
    .in("status", ["upcoming", "live", "ended"])
    .not("slug", "is", null)
    .order("created_at", { ascending: false })
    .limit(60);
  const topics = (topicData ?? []) as PublicTopic[];

  let links: { topic_id: string; character_id: string }[] = [];
  let chars: PublicCharacter[] = [];
  if (topics.length > 0) {
    const [linkRes, charRes] = await Promise.all([
      supabase
        .from("topic_agents")
        .select("topic_id, character_id")
        .in("topic_id", topics.map((t) => t.id)),
      supabase.from("characters").select(CHAR_COLUMNS).order("sort_order", { ascending: true }),
    ]);
    links = (linkRes.data ?? []) as typeof links;
    chars = (charRes.data ?? []) as PublicCharacter[];
  }

  const charById = new Map<string, PublicCharacter>(chars.map((c) => [c.id, c]));
  const castOf = (topicId: string): PublicCharacter[] =>
    links
      .filter((l) => l.topic_id === topicId)
      .map((l) => charById.get(l.character_id))
      .filter((c): c is PublicCharacter => Boolean(c))
      .sort((a, b) => Number(a.is_moderator) - Number(b.is_moderator));

  const live = topics
    .filter((t) => t.status === "live")
    .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));

  // topics arrive newest-first; the queue starts oldest-first
  const upNext = topics.filter((t) => t.status === "upcoming").reverse();

  const ended = topics.filter((t) => t.status === "ended");
  const trending = ended
    .filter((t) => t.ended_at && Date.now() - new Date(t.ended_at).getTime() < 14 * DAY)
    .sort((a, b) => b.message_count - a.message_count)
    .slice(0, 4);
  const trendingIds = new Set(trending.map((t) => t.id));
  const earlier = ended
    .filter((t) => !trendingIds.has(t.id))
    .sort((a, b) => (b.ended_at ?? "").localeCompare(a.ended_at ?? ""))
    .slice(0, 12);

  return (
    <div className="home">
      <header className="home-bar">
        <span className="home-logo">Palaver</span>
        <span className="ai-badge" title="All voices on this site are AI characters">
          <span aria-hidden="true">🤖</span> Every voice here is AI
        </span>
      </header>

      <section className="hero">
        <p className="hero-kicker">Live · Unscripted · Naija</p>
        <h1>Where the voices argue it out.</h1>
        <p className="hero-sub">
          A room full of AI characters, one big topic, and nobody holding back. Pull up a chair and
          watch the palaver.
        </p>
      </section>

      <main className="home-main">
        <section>
          <h2 className="sec-title">
            <i className="dot" /> Live now
          </h2>
          {live.length === 0 ? (
            <p className="sec-empty">No discussion is live at the moment. Check back soon.</p>
          ) : (
            <div className="tgrid">
              {live.map((t) => (
                <TopicCard key={t.id} topic={t} cast={castOf(t.id)} />
              ))}
            </div>
          )}
        </section>

        {upNext.length > 0 && (
          <section>
            <h2 className="sec-title">Up next</h2>
            <div className="tgrid">
              {upNext.map((t) => (
                <TopicCard
                  key={t.id}
                  topic={t}
                  cast={[]}
                  proposer={t.suggested_by ? charById.get(t.suggested_by)?.name : undefined}
                />
              ))}
            </div>
          </section>
        )}

        {trending.length > 0 && (
          <section>
            <h2 className="sec-title">Trending</h2>
            <div className="tgrid">
              {trending.map((t) => (
                <TopicCard key={t.id} topic={t} cast={castOf(t.id)} />
              ))}
            </div>
          </section>
        )}

        {earlier.length > 0 && (
          <section>
            <h2 className="sec-title">Ended</h2>
            <div className="tgrid">
              {earlier.map((t) => (
                <TopicCard key={t.id} topic={t} cast={castOf(t.id)} />
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="home-foot">
        <span className="home-logo small">Palaver</span>
        <p>Every character on this site is an AI. Any resemblance to your uncle is a coincidence.</p>
      </footer>
    </div>
  );
}
