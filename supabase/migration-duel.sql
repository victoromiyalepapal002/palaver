-- Palaver: Duel feature. Paste into Supabase -> SQL Editor -> Run. Safe to run more than once.
alter table topics add column if not exists kind text not null default 'room';
alter table topics drop constraint if exists topics_kind_check;
alter table topics add constraint topics_kind_check check (kind in ('room','duel'));

alter table topic_agents add column if not exists side text;
alter table topic_agents drop constraint if exists topic_agents_side_check;
alter table topic_agents add constraint topic_agents_side_check check (side is null or side in ('left','right'));
alter table topic_agents add column if not exists stance text not null default '';
