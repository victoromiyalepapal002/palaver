import { requireAdmin } from "@/lib/admin";
import { createServiceClient } from "@/lib/supabase/server";
import AdminNav from "../AdminNav";
import { createCharacter, updateCharacter } from "./actions";

export const dynamic = "force-dynamic";

type Character = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  tagline: string;
  persona: string;
  language_style: "english" | "pidgin" | "mixed";
  roast_level: number;
  is_moderator: boolean;
  active: boolean;
};

function Avatar({ value, color }: { value: string; color: string }) {
  const isUrl = /^https?:\/\//.test(value);
  return (
    <span className="avatar" style={{ borderColor: color }}>
      {isUrl ? <img src={value} alt="" /> : value}
    </span>
  );
}

function Fields({ c }: { c?: Character }) {
  return (
    <>
      <div className="grid2">
        <label>
          Name
          <input name="name" defaultValue={c?.name ?? ""} maxLength={60} required />
        </label>
        <label>
          Avatar (emoji or image link)
          <input name="avatar" defaultValue={c?.avatar ?? "🤖"} />
        </label>
      </div>
      <label>
        Tagline
        <input name="tagline" defaultValue={c?.tagline ?? ""} maxLength={120} />
      </label>
      <label>
        Personality (instructions the AI follows)
        <textarea name="persona" rows={5} defaultValue={c?.persona ?? ""} maxLength={2000} />
      </label>
      <div className="grid3">
        <label>
          Language
          <select name="language_style" defaultValue={c?.language_style ?? "mixed"}>
            <option value="english">English</option>
            <option value="pidgin">Pidgin</option>
            <option value="mixed">Mixed</option>
          </select>
        </label>
        <label>
          Roast level
          <select name="roast_level" defaultValue={String(c?.roast_level ?? 2)}>
            <option value="0">0 · Gentle</option>
            <option value="1">1 · Light</option>
            <option value="2">2 · Spicy</option>
            <option value="3">3 · Savage</option>
          </select>
        </label>
        <label>
          Colour
          <input name="color" type="color" defaultValue={c?.color ?? "#c9a227"} />
        </label>
      </div>
      <label className="check">
        <input name="active" type="checkbox" defaultChecked={c?.active ?? true} />
        Active (can speak in discussions)
      </label>
    </>
  );
}

export default async function CharactersPage() {
  await requireAdmin();
  const db = createServiceClient();
  const { data, error } = await db
    .from("characters")
    .select("*")
    .order("sort_order", { ascending: true });

  const characters = (data ?? []) as Character[];

  return (
    <main className="admin">
      <AdminNav current="characters" />

      {error && <p className="error">Could not load characters: {error.message}</p>}

      <p className="muted">
        Rename or edit anyone here. Changes apply instantly to old and new messages.
      </p>

      <section className="stack">
        {characters.map((c) => (
          <details key={c.id} className="card" style={{ borderLeftColor: c.color }}>
            <summary>
              <Avatar value={c.avatar} color={c.color} />
              <span className="who">
                <strong>
                  {c.name}
                  {c.is_moderator && <em className="pill">Moderator</em>}
                  {!c.active && <em className="pill off">Off</em>}
                </strong>
                <small>{c.tagline}</small>
              </span>
              <span className="chev">Edit</span>
            </summary>
            <form action={updateCharacter} className="form">
              <input type="hidden" name="id" value={c.id} />
              <Fields c={c} />
              <button type="submit">Save changes</button>
            </form>
          </details>
        ))}
      </section>

      <details className="card add">
        <summary>
          <span className="who"><strong>+ Add a new character</strong></span>
        </summary>
        <form action={createCharacter} className="form">
          <Fields />
          <button type="submit">Create character</button>
        </form>
      </details>
    </main>
  );
}
