import Link from "next/link";
import type { PublicCharacter, PublicTopic } from "@/lib/types";
import ShareButton from "./ShareButton";

function ago(iso: string | null): string {
  if (!iso) return "ended";
  const mins = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `ended ${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `ended ${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return `ended ${days}d ago`;
}

function Face({ c }: { c: PublicCharacter }) {
  const isUrl = /^https?:\/\//.test(c.avatar);
  return (
    <span className="face" style={{ borderColor: c.color }} title={c.name}>
      {isUrl ? <img src={c.avatar} alt="" /> : c.avatar}
    </span>
  );
}

export default function TopicCard({
  topic,
  cast,
  proposer,
}: {
  topic: PublicTopic;
  cast: PublicCharacter[];
  proposer?: string;
}) {
  const live = topic.status === "live";
  const upcoming = topic.status === "upcoming";
  const href = `/t/${topic.slug}`;
  const shown = cast.slice(0, 6);
  const extra = cast.length - shown.length;

  return (
    <article className={`tcard${live ? " is-live" : ""}${upcoming ? " is-next" : ""}`}>
      <div className="tcard-top">
        {live ? (
          <span className="live-pill">
            <i className="dot" /> LIVE
          </span>
        ) : upcoming ? (
          <span className="next-pill">UP NEXT</span>
        ) : (
          <span className="ended-pill">{ago(topic.ended_at)}</span>
        )}
        <ShareButton path={href} title={topic.title} />
      </div>

      <h3 className="tcard-title">
        <Link href={href} className="tcard-link">
          {topic.title}
        </Link>
      </h3>

      <p className="tcard-sum">
        {upcoming
          ? proposer
            ? `Suggested by ${proposer}. Starting soon.`
            : "Starting soon."
          : topic.summary ||
            (live ? "The characters are just getting started…" : "Open the replay to see how it went.")}
      </p>

      <div className="tcard-foot">
        <div className="faces">
          {shown.map((c) => (
            <Face key={c.id} c={c} />
          ))}
          {extra > 0 && <span className="face more">+{extra}</span>}
        </div>
        <span className="tcard-count">
          {upcoming
            ? "Starts soon"
            : `${live ? `${topic.message_count}/${topic.max_messages}` : topic.message_count} messages`}
        </span>
      </div>
    </article>
  );
}
