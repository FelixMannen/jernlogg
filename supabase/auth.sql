-- Jernlogg: innlogging, tilgangsregler (RLS), grupper og gruppe-toppliste.
-- KUN additivt: ingen eksisterende rader endres eller slettes, og tabellen `docs` får bare en ny kolonne (synced_at)
-- og noen indekser. Trygt å kjøre flere ganger.
--
-- Rekkefølge ved utrulling:
--   1. Kjør denne fila (gamle app-versjoner uten innlogging fortsetter å virke via anon-reglene nederst).
--   2. Deploy appen med innlogging.
--   3. Når alle er logget inn: kjør supabase/lockdown.sql (fjerner anon-tilgangen helt).
--
-- Brukere: auth.users (Supabase Auth, e-postkode) -> docs 'account:<auth uid>' { userId } -> app-bruker-id
-- ('felix'/'david'/'erik' for de opprinnelige, 'u…' for nye). All eksisterende data bruker app-bruker-id,
-- så ingenting må skrives om.

-- ---------- kolonne for deltasynk ----------
alter table public.docs add column if not exists synced_at timestamptz not null default now();
create index if not exists docs_synced_idx on public.docs (synced_at);

create or replace function public.jl_touch() returns trigger language plpgsql as $$
begin
  new.synced_at := now();
  return new;
end $$;
drop trigger if exists docs_touch on public.docs;
create trigger docs_touch before insert or update on public.docs for each row execute function public.jl_touch();

-- ---------- interne hjelpefunksjoner (eget skjema, ikke eksponert som API) ----------
create schema if not exists jl;
grant usage on schema jl to authenticated, service_role;

-- Hvem eier et dokument (app-bruker-id)
create or replace function jl.owner(c text, i text, d jsonb) returns text language sql immutable as $$
  select case
    when c = 'profiles' then case when i like 'profile:%' then substr(i, 9) end
    when c in ('templates', 'exercises', 'routes') then d->>'createdBy'
    when c in ('groups', 'accounts', 'claims', 'push_log', 'feedback_review', 'healthcheck') then null
    else d->>'userId'
  end
$$;

create index if not exists docs_owner_idx on public.docs (jl.owner(collection, id, data));
create index if not exists docs_gm_group_idx on public.docs ((data->>'groupId')) where collection = 'group_members';
create index if not exists docs_workout_start_idx on public.docs ((data->>'startedAt')) where collection = 'workouts';
create unique index if not exists docs_group_invite_uq on public.docs (lower(data->>'inviteCode')) where collection = 'groups' and not deleted;

-- Innlogget brukers app-id
create or replace function jl.me() returns text language sql stable security definer set search_path = public as $$
  select data->>'userId' from public.docs
  where id = 'account:' || auth.uid()::text and collection = 'accounts' and not deleted
$$;

create or replace function jl.is_admin() returns boolean language sql stable as $$
  select coalesce(jl.me() = 'felix', false)
$$;

create or replace function jl.my_groups() returns setof text language sql stable security definer set search_path = public as $$
  select data->>'groupId' from public.docs
  where collection = 'group_members' and not deleted and data->>'userId' = jl.me()
$$;

-- Alle som deler minst én gruppe med meg (inkludert meg selv)
create or replace function jl.peers() returns setof text language sql stable security definer set search_path = public as $$
  select distinct data->>'userId' from public.docs
  where collection = 'group_members' and not deleted and data->>'groupId' in (select jl.my_groups())
$$;

create or replace function jl.is_member(gid text, uid text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.docs where id = 'gm:' || gid || ':' || uid and collection = 'group_members' and not deleted)
$$;

create or replace function jl.workout_visible(wid text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.docs w
    where w.id = wid and w.collection = 'workouts' and not w.deleted
      and (w.data->>'userId' = jl.me()
        or (w.data->>'userId' in (select jl.peers()) and coalesce(w.data->>'private', 'false') <> 'true'))
  )
$$;

create or replace function jl.workout_owner(wid text) returns text language sql stable security definer set search_path = public as $$
  select data->>'userId' from public.docs where id = wid and collection = 'workouts'
$$;

-- Kan innlogget bruker skrive dette dokumentet (ny versjon av raden)?
create or replace function jl.can_write(c text, i text, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when c in ('workouts', 'profiles', 'templates', 'routes', 'exercises', 'bodyweight', 'supplements', 'supplement_logs',
               'push_subscriptions', 'feedback', 'feedback_complaints')
      then jl.owner(c, i, d) is not null and jl.owner(c, i, d) = jl.me()
    when c in ('reactions', 'comments')
      then jl.owner(c, i, d) is not null and jl.owner(c, i, d) = jl.me() and jl.workout_visible(d->>'workoutId')
    when c = 'feedback_review' then jl.is_admin()
    else false
  end
$$;

-- Kan innlogget bruker endre denne eksisterende raden?
create or replace function jl.can_update(c text, i text, d jsonb) returns boolean language sql stable security definer set search_path = public as $$
  select case
    when c in ('workouts', 'profiles', 'templates', 'routes', 'exercises', 'bodyweight', 'supplements', 'supplement_logs',
               'push_subscriptions', 'feedback', 'feedback_complaints', 'reactions', 'comments')
      then (jl.owner(c, i, d) is not null and jl.owner(c, i, d) = jl.me()) or (c = 'feedback' and jl.is_admin())
    when c = 'groups' then d->>'adminId' = jl.me()
    when c = 'feedback_review' then jl.is_admin()
    else false
  end
$$;

grant execute on all functions in schema jl to authenticated, service_role;

-- ---------- tilgangsregler for innloggede ----------
alter table public.docs enable row level security;

drop policy if exists "jl read" on public.docs;
create policy "jl read" on public.docs for select to authenticated using (
  case
    when collection = 'accounts' then id = 'account:' || (select auth.uid())::text
    when collection = 'workouts' then
      jl.owner(collection, id, data) = (select jl.me())
      or (jl.owner(collection, id, data) in (select jl.peers()) and coalesce(data->>'private', 'false') <> 'true')
    when collection in ('profiles', 'templates', 'routes') then
      jl.owner(collection, id, data) = (select jl.me()) or jl.owner(collection, id, data) in (select jl.peers())
    when collection in ('reactions', 'comments') then
      jl.owner(collection, id, data) = (select jl.me())
      or jl.owner(collection, id, data) in (select jl.peers())
      or jl.workout_owner(data->>'workoutId') = (select jl.me())
    when collection in ('exercises', 'feedback', 'feedback_complaints', 'feedback_review') then true
    when collection = 'groups' then id in (select jl.my_groups())
    when collection = 'group_members' then data->>'groupId' in (select jl.my_groups())
    when collection in ('bodyweight', 'supplements', 'supplement_logs', 'push_subscriptions') then
      jl.owner(collection, id, data) = (select jl.me())
    else false
  end
);

drop policy if exists "jl insert" on public.docs;
create policy "jl insert" on public.docs for insert to authenticated with check (jl.can_write(collection, id, data));

drop policy if exists "jl update" on public.docs;
create policy "jl update" on public.docs for update to authenticated
  using (jl.can_update(collection, id, data))
  with check (
    jl.can_write(collection, id, data)
    or (collection = 'groups' and jl.is_member(id, data->>'adminId'))
    or (collection = 'feedback' and jl.is_admin())
  );

grant select, insert, update on public.docs to authenticated;

-- Overgang: gamle app-versjoner (anon) får fortsatt jobbe med treningsdata, men ALDRI med kontoer/grupper/koder.
drop policy if exists "anon read" on public.docs;
drop policy if exists "anon insert" on public.docs;
drop policy if exists "anon update" on public.docs;
create policy "anon read" on public.docs for select to anon
  using (collection not in ('accounts', 'claims', 'groups', 'group_members', 'feedback_review'));
create policy "anon insert" on public.docs for insert to anon
  with check (collection not in ('accounts', 'claims', 'groups', 'group_members', 'feedback_review'));
create policy "anon update" on public.docs for update to anon
  using (collection not in ('accounts', 'claims', 'groups', 'group_members', 'feedback_review'))
  with check (collection not in ('accounts', 'claims', 'groups', 'group_members', 'feedback_review'));

-- ---------- hjelpere for RPC ----------
create or replace function jl.rand(n int) returns text language sql volatile as $$
  select substr(replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 1, n)
$$;

create or replace function jl.put(p_id text, p_collection text, p_data jsonb) returns void language sql volatile security definer set search_path = public as $$
  insert into public.docs (id, collection, data, created_at, updated_at, deleted)
  values (p_id, p_collection, p_data, now(), now(), false)
  on conflict (id) do update set collection = excluded.collection, data = excluded.data, updated_at = now(), deleted = false
$$;

-- Admin forlater/sletter konto: gi admin videre til eldste medlem, eller legg ned gruppa om den blir tom.
create or replace function jl.handover(gid text, leaving text) returns void language plpgsql security definer set search_path = public as $$
declare
  next_admin text;
begin
  select data->>'userId' into next_admin from public.docs
  where collection = 'group_members' and not deleted and data->>'groupId' = gid and data->>'userId' <> leaving
  order by data->>'joinedAt' asc, created_at asc limit 1;
  if next_admin is null then
    update public.docs set deleted = true, updated_at = now() where id = gid and collection = 'groups';
  else
    update public.docs set data = jsonb_set(data, '{adminId}', to_jsonb(next_admin)), updated_at = now()
    where id = gid and collection = 'groups' and data->>'adminId' = leaving;
  end if;
end $$;

-- ---------- RPC: konto ----------
-- Hvem er jeg? Kobler automatisk Felix sin e-post til den opprinnelige 'felix'-brukeren (kun hash i koden).
create or replace function public.jl_whoami() returns text language plpgsql security definer set search_path = public as $$
declare
  me text := jl.me();
  email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if auth.uid() is null then return null; end if;
  if me is not null then return me; end if;
  if encode(sha256(convert_to(email, 'UTF8')), 'hex') = '004fe6bc5328ddd57dd1489281efcd685960761178c92ffa8f35b36ea6b4e9c4'
     and not exists (select 1 from public.docs where collection = 'accounts' and not deleted and data->>'userId' = 'felix') then
    perform jl.put('account:' || auth.uid()::text, 'accounts', jsonb_build_object('userId', 'felix', 'linkedAt', now()));
    return 'felix';
  end if;
  return null;
end $$;

-- Ny bruker: lag app-id og profil.
create or replace function public.jl_register(p_name text, p_color text default null, p_emoji text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me text := public.jl_whoami();
  nm text := btrim(coalesce(p_name, ''));
  prof jsonb;
begin
  if auth.uid() is null then raise exception 'Ikke logget inn'; end if;
  if length(nm) < 1 or length(nm) > 30 then raise exception 'Navnet må være 1–30 tegn'; end if;
  if me is null then
    me := 'u' || jl.rand(11);
    perform jl.put('account:' || auth.uid()::text, 'accounts', jsonb_build_object('userId', me, 'createdAt', now()));
  end if;
  select data into prof from public.docs where id = 'profile:' || me;
  perform jl.put('profile:' || me, 'profiles',
    coalesce(prof, '{}'::jsonb) || jsonb_strip_nulls(jsonb_build_object('name', nm, 'color', p_color, 'emoji', p_emoji)));
  return me;
end $$;

-- Koble til en opprinnelig bruker (David/Erik/Felix) med en kode Felix har laget i appen.
create or replace function public.jl_claim(p_legacy text, p_code text) returns text language plpgsql security definer set search_path = public as $$
declare
  c jsonb;
begin
  if auth.uid() is null then raise exception 'Ikke logget inn'; end if;
  if p_legacy not in ('felix', 'david', 'erik') then raise exception 'Ugyldig bruker'; end if;
  select data into c from public.docs where id = 'claim:' || p_legacy and collection = 'claims' and not deleted;
  if c is null or c->>'code' is distinct from p_code or coalesce((c->>'used')::boolean, false) then
    raise exception 'Koblingslenken er ugyldig eller allerede brukt';
  end if;
  if exists (select 1 from public.docs where collection = 'accounts' and not deleted and data->>'userId' = p_legacy
             and id <> 'account:' || auth.uid()::text) then
    raise exception 'Den brukeren er allerede koblet til en annen konto';
  end if;
  perform jl.put('account:' || auth.uid()::text, 'accounts', jsonb_build_object('userId', p_legacy, 'linkedAt', now()));
  update public.docs set data = c || jsonb_build_object('used', true, 'usedAt', now()), updated_at = now() where id = 'claim:' || p_legacy;
  return p_legacy;
end $$;

-- Felix lager koblingskode for en opprinnelig bruker.
create or replace function public.jl_create_claim(p_legacy text) returns text language plpgsql security definer set search_path = public as $$
declare
  code text := jl.rand(10);
begin
  if not jl.is_admin() then raise exception 'Bare Felix kan lage koblingslenker'; end if;
  if p_legacy not in ('felix', 'david', 'erik') then raise exception 'Ugyldig bruker'; end if;
  perform jl.put('claim:' || p_legacy, 'claims', jsonb_build_object('code', code, 'createdAt', now(), 'used', false));
  return code;
end $$;

-- Hvilke opprinnelige brukere er koblet? (for Felix sin adminvisning)
create or replace function public.jl_legacy_status() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(u, exists (select 1 from public.docs where collection = 'accounts' and not deleted and data->>'userId' = u))
  from unnest(array['felix', 'david', 'erik']) u
$$;

-- Slett kontoen min og ALT jeg eier (GDPR). Admin-roller gis videre.
create or replace function public.jl_delete_account() returns boolean language plpgsql security definer set search_path = public as $$
declare
  me text := jl.me();
  g record;
begin
  if auth.uid() is null or me is null then raise exception 'Ingen konto'; end if;
  for g in select id from public.docs where collection = 'groups' and not deleted and data->>'adminId' = me loop
    perform jl.handover(g.id, me);
  end loop;
  delete from public.docs where jl.owner(collection, id, data) = me;
  delete from public.docs where id = 'account:' || auth.uid()::text;
  begin
    delete from auth.users where id = auth.uid();
  exception when others then
    null; -- data er uansett borte; innloggingen alene gir ingen tilgang uten konto
  end;
  return true;
end $$;

-- ---------- RPC: grupper ----------
create or replace function public.jl_create_group(p_name text, p_emoji text default null, p_public boolean default false, p_description text default null)
returns text language plpgsql security definer set search_path = public as $$
declare
  me text := jl.me();
  gid text := 'g' || jl.rand(12);
  nm text := btrim(coalesce(p_name, ''));
begin
  if me is null then raise exception 'Ikke logget inn'; end if;
  if length(nm) < 1 or length(nm) > 40 then raise exception 'Gruppenavnet må være 1–40 tegn'; end if;
  perform jl.put(gid, 'groups', jsonb_strip_nulls(jsonb_build_object(
    'name', nm, 'emoji', nullif(btrim(coalesce(p_emoji, '')), ''), 'description', nullif(btrim(coalesce(p_description, '')), ''),
    'adminId', me, 'public', coalesce(p_public, false), 'inviteCode', jl.rand(8), 'inviteEnabled', true,
    'createdAt', now(), 'createdBy', me)));
  perform jl.put('gm:' || gid || ':' || me, 'group_members', jsonb_build_object('groupId', gid, 'userId', me, 'joinedAt', now()));
  return gid;
end $$;

-- Se en gruppe før man blir med (via invitasjonskode, eller id for offentlige grupper).
create or replace function public.jl_group_preview(p_code text default null, p_id text default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  g record;
begin
  if auth.uid() is null then raise exception 'Ikke logget inn'; end if;
  if p_code is not null then
    select id, data into g from public.docs where collection = 'groups' and not deleted
      and lower(data->>'inviteCode') = lower(p_code) and coalesce((data->>'inviteEnabled')::boolean, true);
  else
    select id, data into g from public.docs where collection = 'groups' and not deleted and id = p_id
      and coalesce((data->>'public')::boolean, false);
  end if;
  if g.id is null then return null; end if;
  return jsonb_build_object('id', g.id, 'name', g.data->>'name', 'emoji', g.data->>'emoji', 'description', g.data->>'description',
    'public', coalesce((g.data->>'public')::boolean, false),
    'members', (select count(*) from public.docs where collection = 'group_members' and not deleted and data->>'groupId' = g.id),
    'isMember', jl.is_member(g.id, jl.me()));
end $$;

create or replace function public.jl_join_group(p_code text default null, p_id text default null) returns text
language plpgsql security definer set search_path = public as $$
declare
  me text := jl.me();
  gid text;
begin
  if me is null then raise exception 'Ikke logget inn'; end if;
  if p_code is not null then
    select id into gid from public.docs where collection = 'groups' and not deleted
      and lower(data->>'inviteCode') = lower(p_code) and coalesce((data->>'inviteEnabled')::boolean, true);
  else
    select id into gid from public.docs where collection = 'groups' and not deleted and id = p_id
      and coalesce((data->>'public')::boolean, false);
  end if;
  if gid is null then raise exception 'Fant ingen gruppe – lenken kan være utløpt'; end if;
  if not jl.is_member(gid, me) then
    perform jl.put('gm:' || gid || ':' || me, 'group_members', jsonb_build_object('groupId', gid, 'userId', me, 'joinedAt', now()));
  end if;
  return gid;
end $$;

create or replace function public.jl_leave_group(p_group text) returns boolean language plpgsql security definer set search_path = public as $$
declare
  me text := jl.me();
begin
  if me is null or not jl.is_member(p_group, me) then raise exception 'Du er ikke med i gruppa'; end if;
  update public.docs set deleted = true, updated_at = now() where id = 'gm:' || p_group || ':' || me;
  perform jl.handover(p_group, me);
  return true;
end $$;

create or replace function public.jl_kick(p_group text, p_user text) returns boolean language plpgsql security definer set search_path = public as $$
declare
  me text := jl.me();
begin
  if me is null or not exists (select 1 from public.docs where id = p_group and collection = 'groups' and not deleted and data->>'adminId' = me) then
    raise exception 'Bare admin kan fjerne medlemmer';
  end if;
  if p_user = me then raise exception 'Bruk «Forlat gruppa» for å gå ut selv'; end if;
  update public.docs set deleted = true, updated_at = now() where id = 'gm:' || p_group || ':' || p_user and not deleted;
  return found;
end $$;

-- Offentlige grupper (for «Finn grupper»)
create or replace function public.jl_public_groups() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x order by (x->>'members')::int desc, x->>'name'), '[]'::jsonb) from (
    select jsonb_build_object('id', g.id, 'name', g.data->>'name', 'emoji', g.data->>'emoji', 'description', g.data->>'description',
      'members', (select count(*) from public.docs m where m.collection = 'group_members' and not m.deleted and m.data->>'groupId' = g.id),
      'isMember', jl.is_member(g.id, jl.me())) as x
    from public.docs g
    where g.collection = 'groups' and not g.deleted and coalesce((g.data->>'public')::boolean, false)
  ) s
$$;

-- Gruppe-toppliste: kg løftet (sum vekt × reps i fullførte arbeidssett) og km løpt for offentlige grupper i en periode.
-- Private økter teller ikke. p_from/p_to er ISO-tidsstempler (UTC), p_to eksklusiv.
create or replace function public.jl_group_board(p_from text, p_to text) returns jsonb language sql stable security definer set search_path = public as $$
  with pub as (
    select id, data from public.docs
    where collection = 'groups' and not deleted and coalesce((data->>'public')::boolean, false)
  ),
  mem as (
    select m.data->>'groupId' as gid, m.data->>'userId' as uid from public.docs m
    where m.collection = 'group_members' and not m.deleted and m.data->>'groupId' in (select id from pub)
  ),
  w as (
    select d.data->>'userId' as uid,
      case when d.data->>'kind' = 'run' then 0 else coalesce((
        select sum(coalesce((s->>'weight')::numeric, 0) * coalesce((s->>'reps')::numeric, 0))
        from jsonb_array_elements(case when jsonb_typeof(d.data->'exercises') = 'array' then d.data->'exercises' else '[]'::jsonb end) e,
             jsonb_array_elements(case when jsonb_typeof(e->'sets') = 'array' then e->'sets' else '[]'::jsonb end) s
        where coalesce((s->>'done')::boolean, false) and not coalesce((s->>'warmup')::boolean, false)
      ), 0) end as kg,
      case when d.data->>'kind' = 'run' then coalesce((d.data->'run'->>'distanceKm')::numeric, 0) else 0 end as km
    from public.docs d
    where d.collection = 'workouts' and not d.deleted and d.data->>'status' = 'done'
      and coalesce(d.data->>'private', 'false') <> 'true'
      and d.data->>'startedAt' >= p_from and d.data->>'startedAt' < p_to
      and d.data->>'userId' in (select uid from mem)
  ),
  per_user as (select uid, sum(kg) as kg, sum(km) as km, count(*) as n from w group by uid)
  select coalesce(jsonb_agg(row order by (row->>'kg')::numeric desc), '[]'::jsonb) from (
    select jsonb_build_object(
      'id', p.id, 'name', p.data->>'name', 'emoji', p.data->>'emoji',
      'members', count(mem.uid),
      'kg', round(coalesce(sum(pu.kg), 0)),
      'km', round(coalesce(sum(pu.km), 0), 1),
      'sessions', coalesce(sum(pu.n), 0),
      'isMember', jl.is_member(p.id, jl.me())
    ) as row
    from pub p
    join mem on mem.gid = p.id
    left join per_user pu on pu.uid = mem.uid
    group by p.id, p.data
  ) s
$$;

-- Interne skrivehjelpere skal bare brukes av RPC-ene over
revoke execute on function jl.put(text, text, jsonb), jl.handover(text, text), jl.rand(int) from public, anon, authenticated;

-- Bare innloggede kan kalle RPC-ene
revoke execute on function public.jl_whoami(), public.jl_register(text, text, text), public.jl_claim(text, text), public.jl_create_claim(text),
  public.jl_legacy_status(), public.jl_delete_account(), public.jl_create_group(text, text, boolean, text), public.jl_group_preview(text, text),
  public.jl_join_group(text, text), public.jl_leave_group(text), public.jl_kick(text, text), public.jl_public_groups(),
  public.jl_group_board(text, text)
  from public, anon;
grant execute on function public.jl_whoami(), public.jl_register(text, text, text), public.jl_claim(text, text), public.jl_create_claim(text),
  public.jl_legacy_status(), public.jl_delete_account(), public.jl_create_group(text, text, boolean, text), public.jl_group_preview(text, text),
  public.jl_join_group(text, text), public.jl_leave_group(text), public.jl_kick(text, text), public.jl_public_groups(),
  public.jl_group_board(text, text)
  to authenticated;

-- ---------- startdata: den opprinnelige gjengen blir første gruppe ----------
insert into public.docs (id, collection, data)
select 'g_jernlogg', 'groups', jsonb_build_object('name', 'Jernlogg-gjengen', 'emoji', '🏋️', 'adminId', 'felix', 'public', false,
  'inviteCode', jl.rand(8), 'inviteEnabled', true, 'createdAt', now(), 'createdBy', 'felix')
where not exists (select 1 from public.docs where id = 'g_jernlogg');

insert into public.docs (id, collection, data)
select 'gm:g_jernlogg:' || u, 'group_members', jsonb_build_object('groupId', 'g_jernlogg', 'userId', u, 'joinedAt', now())
from unnest(array['felix', 'david', 'erik']) u
where not exists (select 1 from public.docs where id = 'gm:g_jernlogg:' || u);
