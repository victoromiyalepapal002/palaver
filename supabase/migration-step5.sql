-- ONLY needed if you ALREADY ran an older schema.sql (from step 1-4).
-- If you are setting up fresh with the newest schema.sql, skip this file.
-- Safe to run more than once.

alter table topics drop constraint if exists topics_status_check;
alter table topics add constraint topics_status_check
  check (status in ('suggested','upcoming','live','ended','rejected'));

drop policy if exists "public read topics" on topics;
create policy "public read topics" on topics for select
  using (status in ('upcoming','live','ended'));

alter table settings add column if not exists max_live_topics int not null default 2;
alter table settings add column if not exists suggestion_themes text[] not null default array[
  'politics and governance', 'technology and startups', 'money and hustle',
  'football', 'music and entertainment', 'relationships and marriage',
  'food and jollof wars', 'education', 'Lagos life', 'transport and roads',
  'Nollywood', 'social media and trends'
];
