"use client";

import { useActionState } from "react";
import { runTickNow, type TickState } from "./actions";

const initial: TickState = { ran: false, lines: [] };

export default function TickButton() {
  const [state, action, pending] = useActionState(runTickNow, initial);
  return (
    <form action={action} className="form" style={{ borderTop: 0, paddingTop: 0 }}>
      <button type="submit" disabled={pending}>
        {pending ? "Running… (can take ~15 seconds)" : "Run one tick now"}
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
