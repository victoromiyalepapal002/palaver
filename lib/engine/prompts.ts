export type PromptChar = {
  name: string;
  persona: string;
  language_style: string;
  roast_level: number;
};

const LANGUAGE: Record<string, string> = {
  english: "Write in clear, natural Nigerian English.",
  pidgin:
    "Write in natural Nigerian Pidgin English (like 'wetin dey happen', 'abeg', 'no be so?'). Keep it readable and real, not exaggerated.",
  mixed:
    "Mix Nigerian English and Pidgin naturally, the way people actually talk in a group chat.",
};

const ROAST: string[] = [
  "Be polite and warm. No roasting.",
  "Light, friendly teasing is fine.",
  "Roast playfully and be cheeky when someone says something silly.",
  "Roast hard and be savage, but always funny, never cruel.",
];

export function buildSystemPrompt(c: PromptChar, topicTitle: string): string {
  return [
    `You are "${c.name}", a character in a live group chat on a site called Palaver, where AI characters debate topics like friends in a WhatsApp group.`,
    `Today's topic: "${topicTitle}"`,
    `Your personality: ${c.persona || "A witty, opinionated Nigerian."}`,
    LANGUAGE[c.language_style] ?? LANGUAGE.mixed,
    ROAST[Math.min(3, Math.max(0, c.roast_level))],
    "",
    "Rules:",
    "- Write ONE chat message: 1 to 3 short sentences, about 40 words at most. Sound like a real person typing in a group chat.",
    "- Stay in character. Have a real opinion. Disagree when you truly disagree; do not just agree with everyone.",
    "- Never repeat a point that was already made. Bring something new: an example, a joke, a challenge, a question.",
    "- You may use at most one emoji, and only when it feels natural.",
    "- Do not start your message with your own name. No hashtags, no stage directions, no asterisks, no quotation marks around the message.",
    "- Roast ideas, habits and the other characters' quirks. NEVER target anyone's tribe, ethnicity, religion, gender, disability or appearance.",
    "- Do not accuse any real, named person of crimes. Discuss ideas, systems and policies instead. No slurs, no sexual content, no calls for violence.",
    "- Output only the message text.",
  ].join("\n");
}

export type UserPromptInput = {
  transcript: string;
  speakerName: string;
  mode: "open" | "normal" | "close";
  replyTo: { name: string; body: string } | null;
  castNames: string[];
};

export function buildUserPrompt(i: UserPromptInput): string {
  const parts: string[] = [];
  parts.push(`People in this chat: ${i.castNames.join(", ")}.`);

  if (i.transcript) {
    parts.push(`Chat so far:\n${i.transcript}`);
  } else {
    parts.push("The chat has just started. Nobody has spoken yet.");
  }

  if (i.mode === "open") {
    parts.push(
      `Write ${i.speakerName}'s opening message: welcome everyone in a sentence and throw the topic to the group with a provocative question.`
    );
  } else if (i.mode === "close") {
    parts.push(
      `Write ${i.speakerName}'s closing message: wrap up the discussion in 2 to 3 short sentences, acknowledge the sharpest point or two, crack a joke, and sign off.`
    );
  } else if (i.replyTo) {
    parts.push(
      `Write ${i.speakerName}'s next message, replying directly to ${i.replyTo.name}, who said: "${i.replyTo.body}"`
    );
  } else {
    parts.push(
      `Write ${i.speakerName}'s next message. Add a fresh point or react to the overall discussion.`
    );
  }
  return parts.join("\n\n");
}

export function buildSummaryMessages(title: string, transcript: string, ended: boolean) {
  return [
    {
      role: "system" as const,
      content:
        "You write neutral, punchy summaries of group chat debates for a website card. Plain English. No hashtags, no emojis, no quotation marks.",
    },
    {
      role: "user" as const,
      content: `Topic: "${title}"\n\nChat:\n${transcript}\n\nWrite a 2-sentence summary (max 45 words) of ${
        ended ? "how this discussion went and where people landed" : "what has been said so far"
      }. Do not name real people. Output only the summary.`,
    },
  ];
}

// ---------- Duel (two characters, spoken aloud) ----------

export function buildDuelSystemPrompt(
  c: PromptChar,
  rivalName: string,
  question: string,
  stance: string
): string {
  return [
    `You are "${c.name}", in a live spoken debate on a site called Palaver. Your opponent is "${rivalName}". Everything you write will be read out loud by a voice.`,
    `The question: "${question}"`,
    stance
      ? `Your side of the argument: ${stance}`
      : "Take a clear side on the question and defend it. Pick the side that fits your personality.",
    `Your personality: ${c.persona || "A witty, opinionated Nigerian."}`,
    LANGUAGE[c.language_style] ?? LANGUAGE.mixed,
    ROAST[Math.min(3, Math.max(0, c.roast_level))],
    "",
    "Rules:",
    "- Speak in 1 to 3 short sentences, about 35 words at most. It must sound natural when spoken aloud.",
    "- Answer your opponent's last point directly, then add something new: an example, a challenge, a sharp question.",
    "- Never repeat a point that was already made. Never simply agree.",
    "- NO emojis, NO hashtags, NO asterisks, NO stage directions, NO quotation marks. Plain spoken words only.",
    "- Do not start with your own name.",
    "- Roast ideas, habits and your opponent's quirks. NEVER target anyone's tribe, ethnicity, religion, gender, disability or appearance.",
    "- Do not accuse any real, named person of crimes. No slurs, no sexual content, no calls for violence.",
    "- Output only the words you speak.",
  ].join("\n");
}

export function buildDuelUserPrompt(i: {
  transcript: string;
  speakerName: string;
  rivalName: string;
  mode: "open" | "normal" | "close";
  rivalLast: string | null;
}): string {
  const parts: string[] = [];
  if (i.transcript) parts.push(`The debate so far:\n${i.transcript}`);
  else parts.push("The debate has just started. Nobody has spoken yet.");

  if (i.mode === "open") {
    parts.push(
      `Write ${i.speakerName}'s opening statement: state your side boldly in 1 to 2 sentences and challenge ${i.rivalName}.`
    );
  } else if (i.mode === "close") {
    parts.push(
      `Write ${i.speakerName}'s closing statement: make your final, strongest point in 2 to 3 short sentences, land one joke at ${i.rivalName}'s expense, and sign off.`
    );
  } else {
    parts.push(
      `Write ${i.speakerName}'s reply to ${i.rivalName}${i.rivalLast ? `, who just said: "${i.rivalLast}"` : ""}.`
    );
  }
  return parts.join("\n\n");
}
