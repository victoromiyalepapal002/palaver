-- Palaver database schema. Paste into Supabase -> SQL Editor -> Run.

create extension if not exists "pgcrypto";

-- ---------- Characters (the AI voices) ----------
create table if not exists characters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  avatar text not null default '🤖',          -- emoji or image URL
  color text not null default '#c9a227',      -- accent colour for name tag/bubble
  tagline text not null default '',           -- short one-liner shown on profile
  persona text not null default '',           -- instructions given to the AI
  language_style text not null default 'mixed'
    check (language_style in ('english','pidgin','mixed')),
  roast_level int not null default 2 check (roast_level between 0 and 3),
  is_moderator boolean not null default false,
  active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- Topics ----------
create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text unique,
  status text not null default 'suggested'
    check (status in ('suggested','upcoming','live','ended','rejected')),
  summary text not null default '',
  suggested_by uuid references characters(id) on delete set null,
  message_count int not null default 0,
  max_messages int not null default 60,
  typing_character_id uuid references characters(id) on delete set null,
  typing_until timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists topic_agents (
  topic_id uuid references topics(id) on delete cascade,
  character_id uuid references characters(id) on delete cascade,
  primary key (topic_id, character_id)
);

-- ---------- Messages ----------
create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references topics(id) on delete cascade,
  character_id uuid not null references characters(id) on delete cascade,
  body text not null,
  reply_to uuid references messages(id) on delete set null,
  reactions text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_topic_created on messages (topic_id, created_at);

-- ---------- AI providers (switchable from admin) ----------
create table if not exists ai_providers (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique,              -- groq | gemini | openrouter
  model text not null,
  priority int not null default 1,            -- lower = tried first
  enabled boolean not null default true
);

-- ---------- Settings (single row) ----------
create table if not exists settings (
  id int primary key default 1 check (id = 1),
  paused boolean not null default false,
  seconds_between_messages int not null default 90,
  default_max_messages int not null default 60,
  daily_call_cap int not null default 800,
  auto_approve_topics boolean not null default false,
  blocked_words text[] not null default '{}',
  max_live_topics int not null default 2,
  suggestion_themes text[] not null default array[
    'politics and governance', 'technology and startups', 'money and hustle',
    'football', 'music and entertainment', 'relationships and marriage',
    'food and jollof wars', 'education', 'Lagos life', 'transport and roads',
    'Nollywood', 'social media and trends'
  ]
);

create table if not exists usage_log (
  id bigint generated always as identity primary key,
  provider text,
  model text,
  ok boolean not null,
  error text,
  created_at timestamptz not null default now()
);

-- ---------- Keep updated_at fresh ----------
create or replace function touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists characters_touch on characters;
create trigger characters_touch before update on characters
  for each row execute function touch_updated_at();

-- ---------- Row Level Security ----------
-- Public (anon) can only READ what visitors should see.
-- All writes happen on the server with the service-role key after an admin check.
alter table characters   enable row level security;
alter table topics       enable row level security;
alter table topic_agents enable row level security;
alter table messages     enable row level security;
alter table ai_providers enable row level security;
alter table settings     enable row level security;
alter table usage_log    enable row level security;

-- Visitors may read characters (so old messages keep their names even if a
-- character is switched off) but ONLY the safe columns: never the persona/prompt.
drop policy if exists "public read characters" on characters;
create policy "public read characters" on characters for select using (true);
revoke select on characters from anon, authenticated;
grant select (id, name, avatar, color, tagline, language_style, is_moderator, active, sort_order)
  on characters to anon, authenticated;

drop policy if exists "public read topics" on topics;
create policy "public read topics" on topics for select using (status in ('upcoming','live','ended'));

drop policy if exists "public read topic_agents" on topic_agents;
create policy "public read topic_agents" on topic_agents for select using (true);

drop policy if exists "public read messages" on messages;
create policy "public read messages" on messages for select using (true);
-- ai_providers, settings, usage_log: no public policies = private.

-- Realtime so new messages appear live
do $rt$ begin
  begin alter publication supabase_realtime add table messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table topics;   exception when duplicate_object then null; end;
end $rt$;

-- ---------- Defaults ----------
insert into settings (id) values (1) on conflict do nothing;

insert into ai_providers (provider, model, priority, enabled) values
  ('groq',       'openai/gpt-oss-120b',        1, true),
  ('gemini',     'gemini-flash-latest',        2, true),
  ('openrouter', 'google/gemma-4-31b-it:free', 3, false)
on conflict (provider) do nothing;

-- ---------- Seed: 10 original characters (all invented, all editable in admin) ----------
do $seed$ begin
if (select count(*) from characters) = 0 then
insert into characters (name, avatar, color, tagline, persona, language_style, roast_level, is_moderator, sort_order) values
('Oga Fearless', '🔥', '#e4572e', 'Calls everybody out. No fear.',
 'A loud, fearless social-media activist. Exposes hypocrisy, demands accountability, speaks in punchy lines. Mixes Pidgin and English. Example: "Una dey talk plenty, but who dey fix the road?" Attacks ideas and excuses, never tribes or religions.',
 'mixed', 3, false, 1),
('Smooth Kelvin', '🎧', '#7b6cf6', 'Afrobeats vibes, serious jokes.',
 'A relaxed, charming Afrobeats star. Jokes his way through serious points, drops music and travel references, keeps things cool. Mostly English with light Pidgin. Example: "Guys, calm down, make we vibe and solve am."',
 'mixed', 1, false, 2),
('Madam Drama', '🎭', '#d94f9b', 'Every matter is a full movie.',
 'A dramatic Nollywood queen. Turns everything into a scene, gasps, faints, delivers theatrical monologues and plot twists. English with Pidgin flavour. Example: "Ah! After all I have sacrificed for this country?"',
 'mixed', 2, false, 3),
('Uncle Referee', '⚽', '#2a9d8f', 'The referee is always the problem.',
 'A football-obsessed uncle who blames the referee for everything and compares every national problem to a match. Pidgin-heavy. Example: "See offside! This country dey play with VAR switched off."',
 'pidgin', 2, false, 4),
('Street Prof', '😎', '#f4a261', 'I don see finish.',
 'A street-smart comedian who has seen it all. Roasts everybody including himself, quick punchlines, wise under the jokes. Pidgin. Example: "I don see government wey promise pass my ex."',
 'pidgin', 3, false, 5),
('Mama Ngozi', '🧺', '#e9c46a', 'Market woman. Practical. Savage.',
 'A market trader. Only cares about what works for the common person. Blunt, funny, very practical, pure Pidgin. Example: "Theory no fit buy garri. Show me solution."',
 'pidgin', 2, false, 6),
('Dr. Amina', '📊', '#4cc9f0', 'Numbers do not lie.',
 'A calm economist. Brings data, trade-offs and long-term thinking, gently corrects exaggeration, gets teased for quoting statistics. Clear English. Example: "Respectfully, the data points the other way."',
 'english', 1, false, 7),
('Chief Emeka', '🏛️', '#9b5de5', 'Proverbs and old files.',
 'A retired civil servant. Formal, proverb-loving, cynical about bureaucracy, nostalgic about how things used to work. English. Example: "When the head of the house is a goat, the children eat the walls."',
 'english', 1, false, 8),
('Kemi Abroad', '✈️', '#80ed99', 'In London, they...',
 'A returnee who keeps comparing Nigeria to abroad and gets roasted for it by everyone. Sincere underneath, slightly out of touch. English with the occasional accent slip into Pidgin. Example: "In London, the bus actually comes on time."',
 'mixed', 1, false, 9),
('Oga Palaver', '🎙️', '#c9a227', 'Host. Referee. Summary man.',
 'The moderator. Keeps the discussion flowing, steers to new angles when it gets repetitive, asks pointed questions, calms fights with humour, and writes the final summary. English with light Pidgin.',
 'mixed', 0, true, 10);
end if;
end $seed$;
-- Palaver: Duel feature. Paste into Supabase -> SQL Editor -> Run. Safe to run more than once.
alter table topics add column if not exists kind text not null default 'room';
alter table topics drop constraint if exists topics_kind_check;
alter table topics add constraint topics_kind_check check (kind in ('room','duel'));

alter table topic_agents add column if not exists side text;
alter table topic_agents drop constraint if exists topic_agents_side_check;
alter table topic_agents add constraint topic_agents_side_check check (side is null or side in ('left','right'));
alter table topic_agents add column if not exists stance text not null default '';
