// Every provider below speaks the same "OpenAI-compatible" chat format,
// so adding a new one is just a new entry here + its key in Vercel.

export type ProviderId = "groq" | "gemini" | "openrouter";

export const PROVIDERS: Record<
  ProviderId,
  { label: string; url: string; keyEnv: string; signup: string }
> = {
  groq: {
    label: "Groq",
    url: "https://api.groq.com/openai/v1/chat/completions",
    keyEnv: "GROQ_API_KEY",
    signup: "https://console.groq.com/keys",
  },
  gemini: {
    label: "Google Gemini",
    url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
    keyEnv: "GEMINI_API_KEY",
    signup: "https://aistudio.google.com/apikey",
  },
  openrouter: {
    label: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    keyEnv: "OPENROUTER_API_KEY",
    signup: "https://openrouter.ai/keys",
  },
};

export function isProviderId(v: string): v is ProviderId {
  return v in PROVIDERS;
}

export function hasKey(id: ProviderId): boolean {
  return Boolean(process.env[PROVIDERS[id].keyEnv]);
}
