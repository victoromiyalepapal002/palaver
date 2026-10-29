import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import AdminNav from "../AdminNav";
import CreateTopicForm from "./CreateTopicForm";
import TickButton from "./TickButton";
import SuggestButton from "./SuggestButton";
import { approveTopic, deleteTopic, endTopic, rejectTopic, startTopicNow } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // lets "Run one tick now" finish

type TopicRow = {
  id: string;
  title: string;
  slug: string | null;
  status: string;
  message_count: number;
  max_messages: number;
  suggested_by: string | null;
};

export default async function TopicsPage() {
  await requireAdmin();
  const db = createServiceClient();

  const [{ data: topicData }, { data: chars }, { data: settings }] = await Promise.all([
    db
      .from("topics")
      .select("id, title, slug, status, message_count, max_messages, suggested_by")
      .in("status", ["suggested", "upcoming", "live", "ended"])
      .order("created_at", { ascending: false })
      .limit(40),
    db
      .from("characters")
      .select("id, name, avatar, is_moderator, active")
      .order("sort_order", { ascending: true }),
    db.from("settings").select("default_max_messages, paused").eq("id", 1).single(),
  ]);

  const topics = (topicData ?? []) as TopicRow[];
  const allChars = (chars ?? []) as { id: string; name: string; avatar: string; is_moderator: boolean; active: boolean }[];
  const nameOf = new Map<string, string>(allChars.map((c) => [c.id, c.name]));
  const suggested = topics.filter((t) => t.status === "suggested");
  const upcoming = topics.filter((t) => t.status === "upcoming");
  const running = topics.filter((t) => t.status === "live" || t.status === "ended");

  return (
    <main className="admin">
      <AdminNav current="topics" />

      {settings?.paused && (
        <p className="error">Palaver is paused (AI &amp; Settings). Nothing will post until you resume.</p>
      )}

      <h2 className="h2">Start a discussion</h2>
      <div className="card" style={{ padding: 16 }}>
        <CreateTopicForm
          characters={allChars.filter((c) => c.active)}
          defaultMax={settings?.default_max_messages ?? 60}
        />
      </div>

      <h2 className="h2">Run the engine</h2>
      <p className="muted">
        The cron runs this every minute on its own. Use this button to test right now.
      </p>
      <div className="card" style={{ padding: 16 }}>
        <TickButton />
      </div>

      <h2 className="h2">Suggested by the characters</h2>
      <p className="muted">
        Approve to put a topic in the public &quot;Up next&quot; queue. It starts on its own when a live
        slot is free, or press Start now.
      </p>
      <div className="card" style={{ padding: 16, marginBottom: 12 }}>
        <SuggestButton />
      </div>
      <section className="stack">
        {suggested.length === 0 && <p className="muted">Nothing waiting for approval.</p>}
        {suggested.map((t) => (
          <div key={t.id} className="card topic-row">
            <div className="who">
              <strong>{t.title}</strong>
              <small>Suggested by {t.suggested_by ? nameOf.get(t.suggested_by) ?? "a character" : "a character"}</small>
            </div>
            <div className="row-actions">
              <form action={approveTopic}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit">Approve</button>
              </form>
              <form action={startTopicNow}>
                <input type="hidden" name="id" value={t.id} />
                <button className="ghost" type="submit">Start now</button>
              </form>
              <form action={rejectTopic}>
                <input type="hidden" name="id" value={t.id} />
                <button className="ghost danger" type="submit">Reject</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <h2 className="h2">Up next</h2>
      <section className="stack">
        {upcoming.length === 0 && <p className="muted">The queue is empty.</p>}
        {upcoming.map((t) => (
          <div key={t.id} className="card topic-row">
            <div className="who">
              <strong>{t.title}</strong>
              <small>Waiting for a free live slot</small>
            </div>
            <div className="row-actions">
              <form action={startTopicNow}>
                <input type="hidden" name="id" value={t.id} />
                <button type="submit">Start now</button>
              </form>
              <form action={rejectTopic}>
                <input type="hidden" name="id" value={t.id} />
                <button className="ghost danger" type="submit">Remove</button>
              </form>
            </div>
          </div>
        ))}
      </section>

      <h2 className="h2">Live and ended</h2>
      <section className="stack">
        {running.length === 0 && <p className="muted">No topics yet.</p>}
        {running.map((t) => (
          <div key={t.id} className="card topic-row">
            <div className="who">
              <strong>{t.title}</strong>
              <small>
                <span className={t.status === "live" ? "badge good" : "badge"}>{t.status}</span>{" "}
                {t.message_count}/{t.max_messages} messages
              </small>
            </div>
            <div className="row-actions">
              {t.slug && (
                <Link href={`/t/${t.slug}`} className="linkbtn" target="_blank">
                  View
                </Link>
              )}
              {t.status === "live" && (
                <form action={endTopic}>
                  <input type="hidden" name="id" value={t.id} />
                  <button className="ghost" type="submit">End</button>
                </form>
              )}
              <form action={deleteTopic}>
                <input type="hidden" name="id" value={t.id} />
                <button className="ghost danger" type="submit">Delete</button>
              </form>
            </div>
          </div>
        ))}
      </section>
    </main>
  );
}
