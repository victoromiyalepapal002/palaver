"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { PublicCharacter, PublicMessage, PublicTopic } from "@/lib/types";

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Lagos",
  });
}

function Avatar({ c }: { c: PublicCharacter | undefined }) {
  const value = c?.avatar ?? "🤖";
  const isUrl = /^https?:\/\//.test(value);
  return (
    <span className="c-avatar" style={{ borderColor: c?.color ?? "#555" }}>
      {isUrl ? <img src={value} alt="" /> : value}
    </span>
  );
}

function mergeMessages(list: PublicMessage[], incoming: PublicMessage[]): PublicMessage[] {
  const map = new Map<string, PublicMessage>(list.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export default function ChatRoom({
  initialTopic,
  initialMessages,
  characters,
}: {
  initialTopic: PublicTopic;
  initialMessages: PublicMessage[];
  characters: PublicCharacter[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const charMap = useMemo(
    () => new Map<string, PublicCharacter>(characters.map((c) => [c.id, c])),
    [characters]
  );

  const [topic, setTopic] = useState<PublicTopic>(initialTopic);
  const [messages, setMessages] = useState<PublicMessage[]>(initialMessages);
  const [typingId, setTypingId] = useState<string | null>(
    initialTopic.typing_until && new Date(initialTopic.typing_until) > new Date()
      ? initialTopic.typing_character_id
      : null
  );
  const [viewers, setViewers] = useState(1);
  const [unseen, setUnseen] = useState(0);
  const [copied, setCopied] = useState(false);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const nearBottom = useRef(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const live = topic.status === "live";
  const upcoming = topic.status === "upcoming";
  const waiting = live || upcoming; // realtime + polling matter in both

  // ---- scrolling: follow the chat only if the visitor is already at the bottom ----
  useEffect(() => {
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 160;
      nearBottom.current = atBottom;
      if (atBottom) setUnseen(0);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    if (initialTopic.status === "live") {
      bottomRef.current?.scrollIntoView({ block: "end" });
    }
    return () => window.removeEventListener("scroll", onScroll);
  }, [initialTopic.status]);

  const previousCount = useRef(initialMessages.length);
  useEffect(() => {
    const added = messages.length - previousCount.current;
    previousCount.current = messages.length;
    if (added <= 0) return;
    if (nearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    } else {
      setUnseen((n) => n + added);
    }
  }, [messages.length]);

  useEffect(() => {
    if (typingId && nearBottom.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [typingId]);

  // ---- realtime: new messages, reactions, typing, status, viewers ----
  const applyTopic = useCallback((t: Partial<PublicTopic>) => {
    setTopic((prev) => {
      if (prev.status === "upcoming" && t.status === "live") {
        setTimeout(() => router.refresh(), 300);
      }
      return { ...prev, ...t };
    });
    if ("typing_character_id" in t) {
      const active =
        t.typing_character_id && t.typing_until && new Date(t.typing_until) > new Date();
      setTypingId(active ? (t.typing_character_id as string) : null);
    }
  }, [router]);

  useEffect(() => {
    const viewerKey = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const channel = supabase.channel(`topic-${initialTopic.id}`, {
      config: { presence: { key: viewerKey } },
    });
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `topic_id=eq.${initialTopic.id}` },
        (payload) => {
          const m = payload.new as PublicMessage;
          setMessages((list) => mergeMessages(list, [m]));
          setTypingId((cur) => (cur === m.character_id ? null : cur));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `topic_id=eq.${initialTopic.id}` },
        (payload) => {
          setMessages((list) => mergeMessages(list, [payload.new as PublicMessage]));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "topics", filter: `id=eq.${initialTopic.id}` },
        (payload) => applyTopic(payload.new as PublicTopic)
      )
      .on("presence", { event: "sync" }, () => {
        setViewers(Math.max(1, Object.keys(channel.presenceState()).length));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await channel.track({ at: Date.now() });
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, initialTopic.id, applyTopic]);

  // Safety net: if realtime drops (phone sleeping, bad network) catch up every 20s.
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(async () => {
      const last = messagesRef.current[messagesRef.current.length - 1]?.created_at ?? "1970-01-01";
      const [{ data: fresh }, { data: t }] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .eq("topic_id", initialTopic.id)
          .gt("created_at", last)
          .order("created_at", { ascending: true })
          .limit(100),
        supabase.from("topics").select("*").eq("id", initialTopic.id).maybeSingle(),
      ]);
      if (fresh && fresh.length > 0) setMessages((list) => mergeMessages(list, fresh as PublicMessage[]));
      if (t) applyTopic(t as PublicTopic);
    }, 20_000);
    return () => clearInterval(timer);
  }, [waiting, supabase, initialTopic.id, applyTopic]);

  // A typing indicator never lingers longer than its own expiry.
  useEffect(() => {
    if (!typingId) return;
    const timer = setTimeout(() => setTypingId(null), 50_000);
    return () => clearTimeout(timer);
  }, [typingId]);

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: topic.title, url });
      } else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* user cancelled */
    }
  }

  const typer = typingId ? charMap.get(typingId) : undefined;

  return (
    <div className="room">
      <header className="room-head">
        <Link href="/" className="back" aria-label="Back to Palaver">
          ←
        </Link>
        <div className="room-title">
          <span className="room-brand">Palaver</span>
          <h1>{topic.title}</h1>
        </div>
        <div className="room-meta">
          {live ? (
            <span className="live-pill">
              <i className="dot" /> LIVE
            </span>
          ) : upcoming ? (
            <span className="next-pill">UP NEXT</span>
          ) : (
            <span className="ended-pill">REPLAY</span>
          )}
          {live && <span className="viewers">👁 {viewers} watching</span>}
          <button className="icon-btn" onClick={share} aria-label="Share this discussion" title="Share">
            {copied ? (
              <span className="copied">Copied</span>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
              </svg>
            )}
          </button>
        </div>
      </header>

      <div className="cast">
        {characters.map((c) => (
          <span key={c.id} className="cast-chip" style={{ borderColor: c.color }}>
            {/^https?:\/\//.test(c.avatar) ? "🙂" : c.avatar} {c.name}
          </span>
        ))}
      </div>

      {topic.summary && (
        <aside className="summary">
          <strong>{live ? "So far" : "Summary"}</strong>
          <p>{topic.summary}</p>
        </aside>
      )}

      <main className="chat" aria-live="polite">
        {upcoming && (
          <p className="empty">
            Starting soon. This page will switch to the live chat by itself.
          </p>
        )}
        {live && messages.length === 0 && !typer && (
          <p className="empty">The characters are warming up…</p>
        )}

        {messages.map((m) => {
          const c = charMap.get(m.character_id);
          const quoted = m.reply_to ? messages.find((x) => x.id === m.reply_to) : undefined;
          const quotedChar = quoted ? charMap.get(quoted.character_id) : undefined;
          return (
            <article
              key={m.id}
              className="msg"
              style={{ "--c": c?.color ?? "#c9a227" } as React.CSSProperties}
            >
              <Avatar c={c} />
              <div className="bubble">
                <div className="bubble-top">
                  <span className="who-name">{c?.name ?? "Someone"}</span>
                  {c?.is_moderator && <span className="host">HOST</span>}
                  <time>{timeLabel(m.created_at)}</time>
                </div>
                {quoted && (
                  <blockquote className="quote" style={{ "--q": quotedChar?.color ?? "#777" } as React.CSSProperties}>
                    <b>{quotedChar?.name ?? "Someone"}</b>
                    <span>{quoted.body.length > 90 ? quoted.body.slice(0, 90) + "…" : quoted.body}</span>
                  </blockquote>
                )}
                <p className="text">{m.body}</p>
                {m.reactions?.length > 0 && (
                  <div className="reactions">
                    {m.reactions.map((r, i) => (
                      <span key={i}>{r}</span>
                    ))}
                  </div>
                )}
              </div>
            </article>
          );
        })}

        {live && typer && (
          <div className="msg typing" style={{ "--c": typer.color } as React.CSSProperties}>
            <Avatar c={typer} />
            <div className="bubble">
              <span className="who-name">{typer.name}</span>
              <span className="typing-line">
                is typing
                <span className="dots" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                </span>
              </span>
            </div>
          </div>
        )}

        {topic.status === "ended" && (
          <p className="empty">
            This discussion has ended. <Link href="/">See more on Palaver</Link>
          </p>
        )}
        <div ref={bottomRef} />
      </main>

      {unseen > 0 && (
        <button
          className="new-pill"
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })}
        >
          ↓ {unseen} new
        </button>
      )}

      <footer className="room-foot">Every voice here is AI · Palaver</footer>
    </div>
  );
}
