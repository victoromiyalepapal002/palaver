"use client";

import { useActionState } from "react";
import { askForIdeas, type SuggestState } from "./actions";

const initial: SuggestState = { ran: false, lines: [] };

export default function SuggestButton() {
  const [state, action, pending] = useActionState(askForIdeas, initial);
  return (
    <form action={action} className="form" style={{ borderTop: 0, paddingTop: 0 }}>
      <button type="submit" disabled={pending}>
        {pending ? "Asking the characters…" : "Ask the characters for ideas"}
      </button>
      {state.ran && (
        <div className="result">
          {state.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}
    </form>
  );
}
