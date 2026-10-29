import { ImageResponse } from "next/og";
import { createAnonClient } from "@/lib/supabase/anon";

export const alt = "A Palaver discussion";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";

export default async function OgImage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const db = createAnonClient();

  const { data: topic } = await db
    .from("topics")
    .select("id, title, status")
    .eq("slug", slug)
    .maybeSingle();

  let cast: { name: string; color: string }[] = [];
  if (topic) {
    const { data: links } = await db.from("topic_agents").select("character_id").eq("topic_id", topic.id);
    const ids = (links ?? []).map((l: { character_id: string }) => l.character_id);
    if (ids.length > 0) {
      const { data: chars } = await db
        .from("characters")
        .select("name, color, is_moderator")
        .in("id", ids);
      cast = ((chars ?? []) as { name: string; color: string; is_moderator: boolean }[])
        .filter((c) => !c.is_moderator)
        .slice(0, 6)
        .map((c) => ({ name: c.name, color: c.color }));
    }
  }

  const title = (topic?.title ?? "Where the voices argue it out").slice(0, 120);
  const badge =
    topic?.status === "live" ? "LIVE NOW" : topic?.status === "upcoming" ? "UP NEXT" : "REPLAY";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: "linear-gradient(135deg, #1b1917 0%, #121110 60%, #20190a 100%)",
          color: "#f1ebdf",
          fontFamily: "serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 44, fontWeight: 700, color: "#c9a227", letterSpacing: 2 }}>
            Palaver
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              color: topic?.status === "live" ? "#ff6b57" : "#9a9082",
              border: `2px solid ${topic?.status === "live" ? "#ff6b57" : "#3a342c"}`,
              borderRadius: 999,
              padding: "6px 22px",
            }}
          >
            {badge}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            fontSize: title.length > 70 ? 60 : 76,
            fontWeight: 700,
            lineHeight: 1.12,
          }}
        >
          {title}
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {cast.map((c) => (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  fontSize: 26,
                  border: `2px solid ${c.color}`,
                  color: c.color,
                  borderRadius: 999,
                  padding: "6px 20px",
                }}
              >
                {c.name}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: 22, fontSize: 24, color: "#9a9082", letterSpacing: 3 }}>
            EVERY VOICE HERE IS AI
          </div>
        </div>
      </div>
    ),
    size
  );
}
