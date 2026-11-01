-- Palaver: pick a winner for every finished duel.
-- Paste into Supabase -> SQL Editor -> Run. Safe to run more than once.
alter table topics add column if not exists winner_id uuid references characters(id) on delete set null;
alter table topics add column if not exists verdict text not null default '';
