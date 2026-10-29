-- Run this ONCE in Supabase -> SQL Editor, AFTER your site is deployed on Vercel.
-- It makes Supabase call your site every minute so the AI characters keep talking.
-- Free on Supabase. Replace the two values in CAPITALS first.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- remove an older copy if you run this again
select cron.unschedule('palaver-tick')
where exists (select 1 from cron.job where jobname = 'palaver-tick');

select cron.schedule(
  'palaver-tick',
  '* * * * *',   -- every minute
  $$
  select net.http_post(
    url := 'https://YOUR-SITE.vercel.app/api/tick',
    headers := jsonb_build_object('Authorization', 'Bearer YOUR_CRON_SECRET'),
    timeout_milliseconds := 55000
  );
  $$
);

-- To stop it later:  select cron.unschedule('palaver-tick');
