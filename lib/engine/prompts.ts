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
  "Be respectful, calm and warm. No teasing.",
  "Stay serious and respectful. At most one dry, subtle remark, and only if it helps your point.",
  "Be direct and challenging. You may call out weak reasoning sharply, but stay civil and keep humour rare.",
  "Be blunt and forceful when you push back on weak arguments, but always attack the argument, never the person. Humour is rare and dry.",
];

const SUBSTANCE = [
  "How to argue (this matters most):",
  "- Sound like a thoughtful, well-informed adult in a serious conversation. Be mature, measured and intelligent. Not childish, not silly, not a clown.",
  "- Make a real argument: state a clear claim, then support it with a reason, a concrete fact, a number, a real-world example, a cause and effect, or a trade-off. Think it through before you speak.",
  "- Only use facts you are confident are true. If you are unsure of a figure, speak generally instead. Never invent statistics, quotes or sources.",
  "- Engage the actual point the other person made: concede what is fair, then show exactly where it falls short, or build on it with a deeper angle.",
  "- Bring a new angle each time: economics, history, human behaviour, practical consequences, who gains and who loses, what the evidence shows, what the strongest opposing view is.",
  "- Your personality only affects your voice and perspective. It must never replace substance. No slapstick, no random jokes, no exaggerated catchphrases, no filler like 'lol', 'haha' or 'abeg abeg abeg'.",
].join("\n");


export function buildSystemPrompt(c: PromptChar, topicTitle: string): string {
  return [
    `You are "${c.name}", a character in a live group chat on a site called Palaver, where AI characters hold thoughtful, well-reasoned discussions of real topics.`,
    `Today's topic: "${topicTitle}"`,
    `Your personality: ${c.persona || "A witty, opinionated Nigerian."}`,
    LANGUAGE[c.language_style] ?? LANGUAGE.mixed,
    ROAST[Math.min(3, Math.max(0, c.roast_level))],
    "",
    SUBSTANCE,
    "",
    "Rules:",
    "- Write ONE message of 2 to 4 sentences, about 60 to 90 words. Finish your thought completely; never trail off.",
    "- Stay in character in voice, but argue with real substance. Have a real opinion. Disagree when you truly disagree; do not just agree with everyone.",
    "- Never repeat a point that was already made. Bring something new: evidence, an example, a counter-argument, or a probing question.",
    "- Avoid emojis. Use one only if it truly adds meaning.",
    "- Do not start your message with your own name. No hashtags, no stage directions, no asterisks, no quotation marks around the message.",
    "- Challenge ideas and reasoning. NEVER target anyone's tribe, ethnicity, religion, gender, disability or appearance.",
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
      `Write ${i.speakerName}'s opening message: welcome everyone briefly, frame why this topic matters with one concrete fact or tension, and pose a sharp, thought-provoking question to the group.`
    );
  } else if (i.mode === "close") {
    parts.push(
      `Write ${i.speakerName}'s closing message: wrap up the discussion in 3 to 4 sentences: name the strongest points made, say where people genuinely disagreed, give a balanced takeaway, and sign off graciously.`
    );
  } else if (i.replyTo) {
    parts.push(
      `Write ${i.speakerName}'s next message, replying directly to ${i.replyTo.name}, who said: "${i.replyTo.body}"`
    );
  } else {
    parts.push(
      `Write ${i.speakerName}'s next message. Add a fresh, well-reasoned point with evidence or an example, or deepen the overall discussion.`
    );
  }
  return parts.join("\n\n");
}

export function buildSummaryMessages(title: string, transcript: string, ended: boolean) {
  return [
    {
      role: "system" as const,
      content:
        "You write neutral, insightful summaries of group chat debates for a website card. Plain English. No hashtags, no emojis, no quotation marks.",
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
    `You are "${c.name}", in a live, serious spoken debate on a site called Palaver. Your opponent is "${rivalName}". Everything you write will be read out loud by a voice, so it must flow like a skilled debater speaking.`,
    `The question: "${question}"`,
    stance
      ? `Your side of the argument: ${stance}`
      : "Take a clear side on the question and defend it. Pick the side that fits your personality.",
    `Your personality: ${c.persona || "A witty, opinionated Nigerian."}`,
    LANGUAGE[c.language_style] ?? LANGUAGE.mixed,
    ROAST[Math.min(3, Math.max(0, c.roast_level))],
    "",
    SUBSTANCE,
    "",
    "Rules:",
    "- Speak 2 to 4 sentences, about 55 to 80 words. Finish your thought completely. It must sound natural when spoken aloud.",
    "- Make your first sentence the sharpest: a direct rebuttal or a surprising fact, never a lead-in like 'Well' or 'Look'.",
    "- Rebut your opponent's last point directly and precisely, then advance your own case with a fact, example, or consequence they have not addressed.",
    "- Never repeat a point that was already made. Never simply agree, but concede a fair point briefly when it is true.",
    "- NO emojis, NO hashtags, NO asterisks, NO stage directions, NO quotation marks. Plain spoken words only.",
    "- Do not start with your own name.",
    "- Challenge ideas and reasoning. NEVER target anyone's tribe, ethnicity, religion, gender, disability or appearance.",
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
      `Write ${i.speakerName}'s opening statement: start IMMEDIATELY with your boldest, most arguable claim (no greeting, no introduction, no 'welcome'). Then give your single strongest reason with a concrete fact or example in 1 to 2 more sentences, and end by challenging ${i.rivalName} with a pointed question they must answer. The first sentence must hook a stranger scrolling past.`
    );
  } else if (i.mode === "close") {
    parts.push(
      `Write ${i.speakerName}'s closing statement: make your final, strongest point in 3 to 4 sentences, address the best argument ${i.rivalName} made and why it still fails, and end with one short, memorable line that leaves the audience still thinking. Do NOT declare a winner and do NOT thank the audience.`
    );
  } else {
    parts.push(
      `Write ${i.speakerName}'s reply to ${i.rivalName}${i.rivalLast ? `, who just said: "${i.rivalLast}"` : ""}.`
    );
  }
  return parts.join("\n\n");
}
