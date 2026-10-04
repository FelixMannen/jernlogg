-- Hourly call to the reminder endpoint. Additive only: touches no app data.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('jernlogg-reminders') where exists (select 1 from cron.job where jobname = 'jernlogg-reminders');

select cron.schedule(
  'jernlogg-reminders',
  '5 * * * *',
  $$ select net.http_get(url := 'https://jernlogg.vercel.app/api/cron', timeout_milliseconds := 20000); $$
);
