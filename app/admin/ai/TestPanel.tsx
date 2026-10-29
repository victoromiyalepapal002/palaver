"use client";

import { useActionState } from "react";
import { testAi, type TestState } from "./actions";

const initial: TestState = { status: "idle" };

export default function TestPanel() {
  const [state, action, pending] = useActionState(testAi, initial);

  return (
    <form action={action} className="form" style={{ borderTop: 0, paddingTop: 0 }}>
      <label>
        Test message
        <input name="prompt" placeholder="Say hello in one short Nigerian Pidgin sentence." />
      </label>
      <button type="submit" disabled={pending}>
        {pending ? "Asking the AI…" : "Run test"}
      </button>
      {state.status === "ok" && (
        <div className="result ok">
          <p>{state.text}</p>
          <small>
            via {state.provider} · {state.model}
          </small>
        </div>
      )}
      {state.status === "error" && (
        <div className="result bad">
          <p>{state.detail}</p>
        </div>
      )}
    </form>
  );
}
