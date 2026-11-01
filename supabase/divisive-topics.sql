-- Palaver: 30 ready-made, two-sided topics built for views and comments.
-- Paste into Supabase -> SQL Editor -> Run. Safe to run more than once.
-- They land in admin as "suggested": approve them there, or turn one into a duel.
insert into topics (title, slug, status)
select v.title,
       trim(both '-' from regexp_replace(lower(v.title), '[^a-z0-9]+', '-', 'g')),
       'suggested'
from (values
  ('Should a man pay on the first date?'),
  ('Is it wrong to refuse lending money to family?'),
  ('Is japa the smartest move or just running away?'),
  ('Is a university degree still worth it in 2026?'),
  ('Should couples split bills 50/50?'),
  ('Is it okay to read your partner''s phone?'),
  ('Should you tell your friend their partner is cheating?'),
  ('Is a 9-to-5 job a trap or the safest path?'),
  ('Should parents be repaid for raising their children?'),
  ('Is hustle culture inspiring or exploitative?'),
  ('Should you marry for love or for stability?'),
  ('Is it fair to ask a woman about her salary but not a man?'),
  ('Is bride price tradition or transaction?'),
  ('Should relationships have a social media privacy rule?'),
  ('Is it wrong to cut off toxic family members?'),
  ('Is owning a car in a big city smart or wasteful?'),
  ('Is crypto the future of money or a trap for the hopeful?'),
  ('Should schools ban phones completely?'),
  ('Are side hustles saving young people or burning them out?'),
  ('Is renting forever better than buying a house?'),
  ('Should the rich be taxed much more heavily?'),
  ('Is it okay to cheat in a country where the system is unfair?'),
  ('Is tipping fair pay or a way for businesses to dodge wages?'),
  ('Is working from home better than the office?'),
  ('Is it better to be a big fish in a small pond or a small fish in an ocean?'),
  ('Does social media make friendships stronger or fake?'),
  ('Is AI going to create more jobs than it destroys?'),
  ('Should national service be compulsory?'),
  ('Is it better to have one passion or many skills?'),
  ('Is it selfish to not have children?')
) as v(title)
where not exists (select 1 from topics t where lower(t.title) = lower(v.title))
  and not exists (select 1 from topics t where t.slug = trim(both '-' from regexp_replace(lower(v.title), '[^a-z0-9]+', '-', 'g')));
