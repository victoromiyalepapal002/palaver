"use client";

import { useActionState } from "react";
import { createTopic, type CreateState } from "./actions";

type Option = { id: string; name: string; avatar: string; is_moderator: boolean };

export default function CreateTopicForm({
  characters,
  defaultMax,
}: {
  characters: Option[];
  defaultMax: number;
}) {
  const [state, action, pending] = useActionState<CreateState | undefined, FormData>(
    createTopic,
    undefined
  );
  const speakers = characters.filter((c) => !c.is_moderator);
  const moderator = characters.find((c) => c.is_moderator);

  return (
    <form action={action} className="form" style={{ borderTop: 0, paddingTop: 0 }}>
      <label>
        Topic
        <input name="title" placeholder="Can Nigeria be fixed?" maxLength={140} required />
      </label>

      <fieldset className="pick">
        <legend>Who is in this discussion?</legend>
        <div className="pick-grid">
          {speakers.map((c) => (
            <label key={c.id} className="pick-item">
              <input type="checkbox" name="agents" value={c.id} defaultChecked />
              <span className="pick-av">{/^https?:/.test(c.avatar) ? "🙂" : c.avatar}</span>
              {c.name}
            </label>
          ))}
        </div>
        {moderator && (
          <small className="muted">
            {moderator.avatar} {moderator.name} joins automatically as the host.
          </small>
        )}
      </fieldset>

      <label>
        Messages before it ends
        <input name="max_messages" type="number" min={10} max={300} defaultValue={defaultMax} />
      </label>

      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="okmsg">Topic is live. The first message appears on the next tick.</p>}

      <button type="submit" disabled={pending}>
        {pending ? "Starting…" : "Start discussion"}
      </button>
    </form>
  );
}
