"use client";

import { useActionState } from "react";
import { createDuel, type CreateState } from "./actions";

type Option = { id: string; name: string; avatar: string };

function label(c: Option) {
  return `${/^https?:/.test(c.avatar) ? "🙂" : c.avatar} ${c.name}`;
}

export default function CreateDuelForm({ characters }: { characters: Option[] }) {
  const [state, action, pending] = useActionState<CreateState | undefined, FormData>(
    createDuel,
    undefined
  );

  return (
    <form action={action} className="form" style={{ borderTop: 0, paddingTop: 0 }}>
      <label>
        Debate question
        <input
          name="question"
          placeholder="Is it better to rent or to build your own house?"
          maxLength={160}
          required
        />
      </label>

      <div className="grid2">
        <fieldset className="pick">
          <legend>Left side</legend>
          <select name="left" defaultValue={characters[0]?.id} required>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </select>
          <label>
            Their position (optional)
            <input name="left_stance" placeholder="Argues FOR it" maxLength={200} />
          </label>
        </fieldset>

        <fieldset className="pick">
          <legend>Right side</legend>
          <select name="right" defaultValue={characters[1]?.id} required>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {label(c)}
              </option>
            ))}
          </select>
          <label>
            Their position (optional)
            <input name="right_stance" placeholder="Argues AGAINST it" maxLength={200} />
          </label>
        </fieldset>
      </div>

      <label>
        Rounds (each round is one message from each side)
        <input name="rounds" type="number" min={3} max={30} defaultValue={8} />
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="okmsg">Duel is live. The first line appears on the next tick.</p>}

      <button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start duel"}
      </button>
    </form>
  );
}
