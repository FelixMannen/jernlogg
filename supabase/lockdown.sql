-- Jernlogg: steng anon-tilgangen. Kjøres ETTER supabase/auth.sql og etter at appen med innlogging er deployet.
-- Etter dette må man være logget inn for å lese eller skrive noe. Ingen data endres.
drop policy if exists "anon read" on public.docs;
drop policy if exists "anon insert" on public.docs;
drop policy if exists "anon update" on public.docs;
revoke select, insert, update, delete on public.docs from anon;
