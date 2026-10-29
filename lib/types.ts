// Shapes of the public (visitor-safe) data used by the chat page.

export type PublicCharacter = {
  id: string;
  name: string;
  avatar: string;
  color: string;
  tagline: string;
  language_style: "english" | "pidgin" | "mixed";
  is_moderator: boolean;
  active: boolean;
};

export type PublicTopic = {
  id: string;
  title: string;
  slug: string | null;
  status: "suggested" | "upcoming" | "live" | "ended" | "rejected";
  suggested_by: string | null;
  summary: string;
  message_count: number;
  max_messages: number;
  typing_character_id: string | null;
  typing_until: string | null;
  started_at: string | null;
  ended_at: string | null;
};

export type PublicMessage = {
  id: string;
  topic_id: string;
  character_id: string;
  body: string;
  reply_to: string | null;
  reactions: string[];
  created_at: string;
};
