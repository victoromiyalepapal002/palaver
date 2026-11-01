"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import type { PublicCharacter, PublicMessage, PublicTopic } from "@/lib/types";

type Side = "left" | "right";
type Fighter = { character: PublicCharacter; stance: string };

function mergeMessages(list: PublicMessage[], incoming: PublicMessage[]): PublicMessage[] {
  const map = new Map<string, PublicMessage>(list.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
}

/** How long a line takes to say, used to time the animation when voice is off. */
function readMs(text: string) {
  return Math.min(14000, Math.max(2500, text.length * 62));
}

const MALE = /(male|david|james|daniel|alex|mark|george|guy|ryan|fred|thomas|oliver|abeo|christopher|eric|roger)/i;
const FEMALE = /(female|zira|samantha|susan|hazel|karen|aria|jenny|libby|sonia|moira|ezinne|victoria|serena|fiona|tessa)/i;

function pickVoices(): { left?: SpeechSynthesisVoice; right?: SpeechSynthesisVoice } {
  const all = window.speechSynthesis.getVoices();
  const en = all.filter((v) => /^en/i.test(v.lang));
  const ng = en.filter((v) => /en[-_]NG/i.test(v.lang));
  const pool = ng.length >= 2 ? ng : en.length ? en : all;
  if (pool.length === 0) return {};
  const left = pool.find((v) => MALE.test(v.name) && !FEMALE.test(v.name)) ?? pool[0];
  const right =
    pool.find((v) => FEMALE.test(v.name) && v !== left) ?? pool.find((v) => v !== left) ?? pool[0];
  return { left, right };
}

function FighterView({
  fighter,
  side,
  speaking,
  thinking,
  winner = false,
}: {
  fighter: Fighter;
  side: Side;
  speaking: boolean;
  thinking: boolean;
  winner?: boolean;
}) {
  const c = fighter.character;
  const isUrl = /^https?:\/\//.test(c.avatar);
  return (
    <div
      className={`fighter ${side}${speaking ? " is-speaking" : ""}${thinking ? " is-thinking" : ""}${winner ? " is-winner" : ""}`}
      style={{ "--c": c.color } as React.CSSProperties}
    >
      <div className="orb-stage">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <span className="ripple" />
        <span className="ripple d2" />
        <span className="ripple d3" />
        <div className="orb">
          <span className="orb-face">{isUrl ? <img src={c.avatar} alt="" /> : c.avatar}</span>
          <span className="orb-shine" />
        </div>
      </div>
      <div className="eq" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
        <i />
      </div>
      {winner && <div className="crown" aria-label="Winner">🏆 WINNER</div>}
      <div className="f-name">{c.name}</div>
      <div className="f-tag">{fighter.stance || c.tagline}</div>
      <div className="f-status">{speaking ? "speaking" : thinking ? "thinking…" : "listening"}</div>
    </div>
  );
}

export default function DuelRoom({
  initialTopic,
  initialMessages,
  left,
  right,
  clip = false,
}: {
  initialTopic: PublicTopic;
  initialMessages: PublicMessage[];
  left: Fighter;
  right: Fighter;
  clip?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const sideOf = useMemo(
    () =>
      new Map<string, Side>([
        [left.character.id, "left"],
        [right.character.id, "right"],
      ]),
    [left, right]
  );
  const fighterOf = useCallback(
    (id: string) => (id === left.character.id ? left : id === right.character.id ? right : null),
    [left, right]
  );

  const [topic, setTopic] = useState(initialTopic);
  const [messages, setMessages] = useState(initialMessages);
  const [typingId, setTypingId] = useState<string | null>(
    initialTopic.typing_until && new Date(initialTopic.typing_until) > new Date()
      ? initialTopic.typing_character_id
      : null
  );
  const [viewers, setViewers] = useState(1);
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceOk, setVoiceOk] = useState(true);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(
    initialMessages[initialMessages.length - 1]?.id ?? null
  );
  const [copied, setCopied] = useState(false);
  const arenaRef = useRef<HTMLElement>(null);

  const messagesRef = useRef(messages);
  messagesRef.current = messages;
  const voiceOnRef = useRef(false);
  const queueRef = useRef<PublicMessage[]>([]);
  const busyRef = useRef(false);
  const seenRef = useRef(new Set(initialMessages.map((m) => m.id)));
  const voicesRef = useRef<{ left?: SpeechSynthesisVoice; right?: SpeechSynthesisVoice }>({});

  const live = topic.status === "live";
  const ended = topic.status === "ended";

  // ---- speaking queue: one line at a time, with voice or just the animation ----
  const pump = useCallback(() => {
    if (busyRef.current) return;
    const m = queueRef.current.shift();
    if (!m) return;
    busyRef.current = true;
    setCurrentId(m.id);
    setSpeakingId(m.character_id);

    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      busyRef.current = false;
      setSpeakingId(null);
      pump();
    };

    const canSpeak = voiceOnRef.current && typeof window !== "undefined" && "speechSynthesis" in window;
    if (canSpeak) {
      const side = sideOf.get(m.character_id) ?? "left";
      const u = new SpeechSynthesisUtterance(m.body);
      const v = voicesRef.current[side];
      if (v) {
        u.voice = v;
        u.lang = v.lang;
      } else {
        u.lang = "en-GB";
      }
      const sameVoice = voicesRef.current.left === voicesRef.current.right;
      u.pitch = side === "left" ? (sameVoice ? 0.8 : 0.95) : sameVoice ? 1.25 : 1.05;
      u.rate = queueRef.current.length >= 2 ? 1.15 : 0.98; // catch up if lines pile up
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
      setTimeout(done, readMs(m.body) + 9000); // safety net if the browser never reports the end
    } else {
      setTimeout(done, readMs(m.body));
    }
  }, [sideOf]);

  const onNewMessage = useCallback(
    (m: PublicMessage) => {
      setMessages((list) => mergeMessages(list, [m]));
      setTypingId((cur) => (cur === m.character_id ? null : cur));
      if (seenRef.current.has(m.id)) return;
      seenRef.current.add(m.id);
      queueRef.current.push(m);
      pump();
    },
    [pump]
  );

  // ---- realtime ----
  useEffect(() => {
    const viewerKey = `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    const channel = supabase.channel(`duel-${initialTopic.id}`, {
      config: { presence: { key: viewerKey } },
    });
    channel
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `topic_id=eq.${initialTopic.id}` },
        (payload) => onNewMessage(payload.new as PublicMessage)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "topics", filter: `id=eq.${initialTopic.id}` },
        (payload) => {
          const t = payload.new as PublicTopic;
          setTopic((prev) => ({ ...prev, ...t }));
          const active = t.typing_character_id && t.typing_until && new Date(t.typing_until) > new Date();
          setTypingId(active ? t.typing_character_id : null);
        }
      )
      .on("presence", { event: "sync" }, () => {
        setViewers(Math.max(1, Object.keys(channel.presenceState()).length));
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") await channel.track({ at: Date.now() });
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, initialTopic.id, onNewMessage]);

  // Safety net: catch up every 20s if realtime drops.
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(async () => {
      const last = messagesRef.current[messagesRef.current.length - 1]?.created_at ?? "1970-01-01";
      const [{ data: fresh }, { data: t }] = await Promise.all([
        supabase
          .from("messages")
          .select("*")
          .eq("topic_id", initialTopic.id)
          .gt("created_at", last)
          .order("created_at", { ascending: true })
          .limit(50),
        supabase.from("topics").select("*").eq("id", initialTopic.id).maybeSingle(),
      ]);
      ((fresh ?? []) as PublicMessage[]).forEach(onNewMessage);
      if (t) {
        setTopic((prev) => ({ ...prev, ...(t as PublicTopic) }));
        const tt = t as PublicTopic;
        const active = tt.typing_character_id && tt.typing_until && new Date(tt.typing_until) > new Date();
        setTypingId(active ? tt.typing_character_id : null);
      }
    }, 20_000);
    return () => clearInterval(timer);
  }, [live, supabase, initialTopic.id, onNewMessage]);

  useEffect(() => {
    if (!typingId) return;
    const timer = setTimeout(() => setTypingId(null), 50_000);
    return () => clearTimeout(timer);
  }, [typingId]);

  // ---- voices ----
  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      setVoiceOk(false);
      return;
    }
    const load = () => {
      voicesRef.current = pickVoices();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
      window.speechSynthesis.cancel();
    };
  }, []);

  function toggleVoice() {
    if (!voiceOk) return;
    if (voiceOn) {
      voiceOnRef.current = false;
      setVoiceOn(false);
      window.speechSynthesis.cancel(); // the current line's animation finishes by its own timer
    } else {
      voiceOnRef.current = true;
      setVoiceOn(true);
      voicesRef.current = pickVoices();
      // A tap is required by browsers before sound is allowed. This silent line "unlocks" it.
      const unlock = new SpeechSynthesisUtterance(" ");
      unlock.volume = 0;
      window.speechSynthesis.speak(unlock);
    }
  }

  function replay() {
    window.speechSynthesis?.cancel();
    queueRef.current = [...messagesRef.current];
    busyRef.current = false;
    if (!voiceOnRef.current && voiceOk) toggleVoice();
    pump();
  }

  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) await navigator.share({ title: topic.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* cancelled */
    }
  }

  // ---- 3D tilt that follows the pointer ----
  function tilt(e: React.PointerEvent<HTMLElement>) {
    const el = arenaRef.current;
    if (!el || e.pointerType === "touch") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty("--rx", `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(x * 14).toFixed(2)}deg`);
  }
  function untilt() {
    arenaRef.current?.style.setProperty("--rx", "0deg");
    arenaRef.current?.style.setProperty("--ry", "0deg");
  }

  const current = messages.find((m) => m.id === currentId) ?? messages[messages.length - 1];
  const currentFighter = current ? fighterOf(current.character_id) : null;
  const currentSide: Side = current ? sideOf.get(current.character_id) ?? "left" : "left";
  const thinkingFighter = typingId ? fighterOf(typingId) : null;
  const lastSpoken = !!current && messages[messages.length - 1]?.id === current.id && !speakingId;
  const winnerFighter = topic.winner_id ? fighterOf(topic.winner_id) : null;
  const showVerdict = ended && lastSpoken && !!winnerFighter;
  const rounds = Math.max(1, Math.ceil(topic.max_messages / 2));
  const round = Math.min(rounds, Math.ceil(topic.message_count / 2));
  const pct = Math.min(100, Math.round((topic.message_count / Math.max(1, topic.max_messages)) * 100));

  return (
    <div className={`duel${clip ? " clip" : ""}`}>
      <header className="duel-head">
        <Link href="/" className="back" aria-label="Back to Palaver">
          ←
        </Link>
        <span className="room-brand">Palaver · Duel</span>
        <div className="room-meta">
          {live ? (
            <span className="live-pill">
              <i className="dot" /> LIVE
            </span>
          ) : (
            <span className="ended-pill">REPLAY</span>
          )}
          {live && <span className="viewers">👁 {viewers} watching</span>}
          <button className="icon-btn" onClick={share} aria-label="Share this duel" title="Share">
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

      {clip && (
        <div className="clip-top" aria-hidden="true">
          <span className="clip-brand">PALAVER</span>
          <span className="clip-round">{ended ? "FINAL" : `ROUND ${Math.max(1, round)}/${rounds}`}</span>
        </div>
      )}
      <h1 className="duel-q">{topic.title}</h1>

      <section
        className="arena"
        ref={arenaRef}
        onPointerMove={tilt}
        onPointerLeave={untilt}
        aria-label="The two debaters"
      >
        <div className="arena-floor" aria-hidden="true" />
        <div className="arena-beam b-left" aria-hidden="true" />
        <div className="arena-beam b-right" aria-hidden="true" />
        <div className="arena-grid">
          <FighterView
            fighter={left}
            side="left"
            speaking={speakingId === left.character.id}
            winner={showVerdict && topic.winner_id === left.character.id}
            thinking={typingId === left.character.id && speakingId !== left.character.id}
          />
          <div className="vs" aria-hidden="true">
            <div className="coin">
              <span>VS</span>
            </div>
          </div>
          <FighterView
            fighter={right}
            side="right"
            speaking={speakingId === right.character.id}
            winner={showVerdict && topic.winner_id === right.character.id}
            thinking={typingId === right.character.id && speakingId !== right.character.id}
          />
        </div>
      </section>

      <section className="say-wrap" aria-live="polite">
        {thinkingFighter && !speakingId ? (
          <div
            className={`say ${sideOf.get(thinkingFighter.character.id) ?? "left"} thinking`}
            style={{ "--c": thinkingFighter.character.color } as React.CSSProperties}
          >
            <span className="say-who">{thinkingFighter.character.name}</span>
            <span className="typing-line">
              is getting ready to answer
              <span className="dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </span>
          </div>
        ) : current && currentFighter ? (
          <div
            key={current.id}
            className={`say ${currentSide}${speakingId === current.character_id ? " live-line" : ""}`}
            style={{ "--c": currentFighter.character.color } as React.CSSProperties}
          >
            <span className="say-who">{currentFighter.character.name}</span>
            <p>{current.body}</p>
          </div>
        ) : (
          <div className="say left thinking">
            <span className="typing-line">The debaters are taking their positions…</span>
          </div>
        )}
      </section>

      {showVerdict && winnerFighter && (
        <div
          className={`verdict${clip ? " in-clip" : ""}`}
          role="status"
          style={{ "--c": winnerFighter.character.color } as React.CSSProperties}
        >
          <p className="verdict-label">🏆 The winner</p>
          <p className="verdict-name">{winnerFighter.character.name}</p>
          {topic.verdict && <p className="verdict-why">{topic.verdict}</p>}
          <p className="verdict-cta">Do you agree? Comment 1 for {left.character.name} or 2 for {right.character.name}</p>
        </div>
      )}
      {clip && ended && lastSpoken && !winnerFighter && (
        <div className="clip-end" role="status">
          <p className="clip-end-q">Who won?</p>
          <div className="clip-end-opts">
            <span style={{ "--c": left.character.color } as React.CSSProperties}>1 · {left.character.name}</span>
            <span style={{ "--c": right.character.color } as React.CSSProperties}>2 · {right.character.name}</span>
          </div>
          <p className="clip-end-cta">Comment 1 or 2 · Follow for the next round</p>
        </div>
      )}

      <div className="duel-controls">
        {voiceOk ? (
          <button className={`voice-btn${voiceOn ? " on" : ""}`} onClick={toggleVoice}>
            {voiceOn ? "🔊 Voices on · tap to mute" : "🔈 Tap to hear the voices"}
          </button>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            This browser cannot play voices, but you can still read along.
          </p>
        )}
        {ended && voiceOk && (
          <button className="voice-btn ghost" onClick={replay}>
            ▶ Play the whole debate
          </button>
        )}
        <Link className="voice-btn ghost" href={clip ? `/t/${topic.slug}` : `/t/${topic.slug}?clip=1`}>
          {clip ? "✕ Exit clip mode" : "🎬 Clip mode (for TikTok)"}
        </Link>
      </div>
      {voiceOk && <p className="voice-note">Voices come from your own device, so they may sound different on each phone.</p>}

      <div className="progress" aria-label={`Round ${round} of ${rounds}`}>
        <div className="progress-bar" style={{ width: `${pct}%` }} />
      </div>
      <p className="round-label">
        {ended ? "Debate finished" : `Round ${Math.max(1, round)} of ${rounds}`}
      </p>

      {topic.summary && (
        <aside className="summary" style={{ margin: "0 14px" }}>
          <strong>{live ? "So far" : "Summary"}</strong>
          <p>{topic.summary}</p>
        </aside>
      )}

      <h2 className="exchange-title">The exchange</h2>
      <main className="exchange">
        {messages.length === 0 && <p className="empty">No one has spoken yet.</p>}
        {messages.map((m) => {
          const f = fighterOf(m.character_id);
          const side = sideOf.get(m.character_id) ?? "left";
          return (
            <article
              key={m.id}
              className={`dmsg ${side}${speakingId === m.character_id && current?.id === m.id ? " now" : ""}`}
              style={{ "--c": f?.character.color ?? "#c9a227" } as React.CSSProperties}
            >
              <span className="dmsg-av">
                {f && !/^https?:\/\//.test(f.character.avatar) ? f.character.avatar : "🤖"}
              </span>
              <div className="dmsg-bubble">
                <span className="who-name">{f?.character.name ?? "Someone"}</span>
                <p className="text">{m.body}</p>
              </div>
            </article>
          );
        })}
        {ended && (
          <p className="empty">
            This duel has ended. <Link href="/">See more on Palaver</Link>
          </p>
        )}
      </main>

      <footer className="room-foot">Every voice here is AI · Palaver</footer>
    </div>
  );
}
