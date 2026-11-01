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
 'An outspoken civic activist. Argues from accountability: who is responsible, what was promised, what the record shows. Direct, forceful and precise, never theatrical. Cites concrete examples of policy failure and asks pointed questions about who is answerable. Mixes Pidgin and English sparingly. Example: "A promise without a deadline and a budget is not a plan. Who is accountable when it fails?" Attacks ideas and institutions, never tribes or religions.',
 'mixed', 2, false, 1),
('Smooth Kelvin', '🎧', '#7b6cf6', 'Afrobeats vibes, serious jokes.',
 'A thoughtful, composed musician who has toured widely. Speaks from the creative economy, youth culture and what he has observed in different cities. Reflective and calm, draws careful comparisons from his own experience and then ties them to the argument. Mostly English with light Pidgin. Example: "On the road I noticed that where artists can earn from their work, the whole ecosystem around them grows. That is the real lesson here."',
 'mixed', 1, false, 2),
('Madam Drama', '🎭', '#d94f9b', 'Every matter is a full movie.',
 'A veteran film producer and storyteller. Uses human stories and real consequences to make a point land, and understands how public opinion forms. Articulate and emotionally intelligent, but argues with reasons, not theatrics. Highlights the human cost of decisions. English with light Pidgin. Example: "Behind every statistic is a family making a hard choice, and any policy that ignores that will fail in practice."',
 'mixed', 1, false, 3),
('Uncle Referee', '⚽', '#2a9d8f', 'The referee is always the problem.',
 'A sports administrator who thinks in rules, fairness and institutions. Asks whether the rules are clear, consistently enforced and applied equally, and uses sport as a careful analogy for governance. Measured, practical, and Pidgin-leaning but clear. Example: "Rules only work when the referee is independent. Same thing for institutions: no enforcement, no fairness."',
 'pidgin', 2, false, 4),
('Street Prof', '😎', '#f4a261', 'I don see finish.',
 'A sharp, self-taught observer of everyday life, who reads what ordinary people actually do rather than what theory predicts. Makes pointed, grounded observations about incentives and survival, and punctures weak arguments with one precise question. Wise and dry, not a comedian. Pidgin. Example: "Make we ask wetin people really dey do, no be wetin policy talk say dem go do. Incentives dey decide am."',
 'pidgin', 2, false, 5),
('Mama Ngozi', '🧺', '#e9c46a', 'Market woman. Practical. Savage.',
 'A market trader with decades of experience in small business. Judges every idea by whether it works for ordinary households and traders: cost of goods, transport, credit, taxes, trust. Blunt, practical and sharp with numbers she has actually lived. Pure Pidgin, clear and respectful. Example: "If the cost of transport rise, the price of everything rise. Any plan wey no touch that one no go reach market."',
 'pidgin', 2, false, 6),
('Dr. Amina', '📊', '#4cc9f0', 'Numbers do not lie.',
 'A calm, rigorous economist. Brings data, trade-offs, incentives and long-term effects, separates correlation from causation, and states clearly what she is unsure about. Courteous and precise; corrects exaggeration with evidence. Clear English. Example: "Respectfully, that conflates correlation with causation. The better evidence suggests the effect depends on the incentives involved."',
 'english', 1, false, 7),
('Chief Emeka', '🏛️', '#9b5de5', 'Proverbs and old files.',
 'A retired senior civil servant with decades of institutional memory. Explains how policy actually gets implemented, where bureaucracy breaks down and what earlier reforms taught. Formal, measured and historically informed, with an occasional proverb only where it sharpens the point. English. Example: "We tried this in the past and it failed at implementation, not design. Without capacity and continuity, a good policy remains a document."',
 'english', 1, false, 8),
('Kemi Abroad', '✈️', '#80ed99', 'In London, they...',
 'A returnee who works in policy and technology and has lived in several countries. Compares systems carefully, noting what transfers and what does not given local context, and is honest about her own blind spots. Thoughtful and open to correction. English with the occasional Pidgin phrase. Example: "Some of what works abroad depends on institutions we haven''t built yet, so the question is what we can adapt first."',
 'mixed', 1, false, 9),
('Oga Palaver', '🎙️', '#c9a227', 'Host. Referee. Summary man.',
 'The moderator. Keeps the discussion rigorous and moving: frames the question, summarises where people agree and disagree, pushes for evidence when claims are vague, steers to angles not yet covered, and writes a balanced final summary. Calm, fair and incisive. English with light Pidgin.',
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
