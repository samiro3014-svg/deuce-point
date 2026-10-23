-- =====================================================================
--  Deuce Point · Migración v3
--  Valoración inicial, generación automática, check-ins semanales,
--  ajustes del entrenador y fotos de progreso cifradas.
--  Ejecutar UNA vez en: Supabase > SQL Editor > New query > Run
--  (se puede ejecutar de nuevo sin causar errores)
-- =====================================================================

-- ---------- Columnas nuevas ----------
alter table public.profiles add column if not exists phone text;
revoke update on public.profiles from authenticated;
grant update (full_name, goal, phone) on public.profiles to authenticated;

alter table public.nutrition_plans add column if not exists review boolean not null default false;
alter table public.routines add column if not exists review boolean not null default false;

-- ---------- Ajustes del entrenador (una sola fila) ----------
create table if not exists public.app_settings (
  id          int primary key default 1 check (id = 1),
  data        jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);
insert into public.app_settings (id, data)
values (1, '{"auto_publish": false, "deficit_pct": 22, "surplus_pct": 12, "recomp_pct": 10, "protein_gkg": 2.0, "fat_gkg": 0.9}'::jsonb)
on conflict (id) do nothing;

-- ---------- Valoración inicial ----------
create table if not exists public.intakes (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null unique references public.profiles(id) on delete cascade,
  data         jsonb not null,
  calc         jsonb,
  flags        jsonb not null default '[]'::jsonb,
  status       text not null default 'pending' check (status in ('pending','approved')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);

-- ---------- Check-ins semanales ----------
create table if not exists public.checkins (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles(id) on delete cascade,
  check_date   date not null default current_date,
  weight_kg    numeric,
  waist_cm     numeric,
  adherence    int,
  energy       int,
  sleep        int,
  hunger       int,
  stress       int,
  performance  int,
  notes        text,
  coach_reply  text,
  status       text not null default 'pending' check (status in ('pending','reviewed')),
  created_at   timestamptz not null default now(),
  reviewed_at  timestamptz
);
create index if not exists idx_checkins_client on public.checkins(client_id, check_date desc);

-- ---------- Fotos de progreso (cifradas en el dispositivo) ----------
-- La llave de cada asesorado se guarda cifrada con su contraseña de fotos.
-- coach_key: la misma llave cifrada con la llave pública del entrenador (solo si el asesorado decide compartir).
create table if not exists public.photo_vaults (
  owner_id      uuid primary key references public.profiles(id) on delete cascade,
  kind          text not null default 'client' check (kind in ('client','coach')),
  salt          text not null,
  wrapped       text not null,
  iv            text not null,
  coach_key     text,
  coach_key_id  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.progress_photos (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  taken_on    date not null,
  pose        text,
  path        text not null,
  iv          text not null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_photos_client on public.progress_photos(client_id, taken_on desc);

-- =====================================================================
--  Seguridad
-- =====================================================================
alter table public.app_settings     enable row level security;
alter table public.intakes          enable row level security;
alter table public.checkins         enable row level security;
alter table public.photo_vaults     enable row level security;
alter table public.progress_photos  enable row level security;

drop policy if exists "ajustes_leer" on public.app_settings;
create policy "ajustes_leer" on public.app_settings for select to authenticated using (true);
drop policy if exists "ajustes_gestionar" on public.app_settings;
create policy "ajustes_gestionar" on public.app_settings for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "valoracion_leer" on public.intakes;
create policy "valoracion_leer" on public.intakes for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "valoracion_crear" on public.intakes;
create policy "valoracion_crear" on public.intakes for insert to authenticated
  with check (client_id = auth.uid() or public.is_coach());
drop policy if exists "valoracion_gestionar" on public.intakes;
create policy "valoracion_gestionar" on public.intakes for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "checkin_leer" on public.checkins;
create policy "checkin_leer" on public.checkins for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "checkin_crear" on public.checkins;
create policy "checkin_crear" on public.checkins for insert to authenticated
  with check (client_id = auth.uid());
drop policy if exists "checkin_gestionar" on public.checkins;
create policy "checkin_gestionar" on public.checkins for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Bóvedas: cada persona gestiona solo la suya. El entrenador puede leerlas (contenido cifrado).
drop policy if exists "boveda_leer" on public.photo_vaults;
create policy "boveda_leer" on public.photo_vaults for select to authenticated
  using (owner_id = auth.uid() or public.is_coach());
drop policy if exists "boveda_propia" on public.photo_vaults;
create policy "boveda_propia" on public.photo_vaults for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Fotos: solo el asesorado sube y borra. El entrenador solo lee archivos cifrados.
drop policy if exists "fotos_leer" on public.progress_photos;
create policy "fotos_leer" on public.progress_photos for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "fotos_propias" on public.progress_photos;
create policy "fotos_propias" on public.progress_photos for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());

-- Plantillas nutricionales legibles por todos (las usa la generación automática)
drop policy if exists "planes_leer" on public.nutrition_plans;
create policy "planes_leer" on public.nutrition_plans for select to authenticated
  using (client_id = auth.uid() or is_template or public.is_coach());

drop policy if exists "comidas_leer" on public.plan_meals;
create policy "comidas_leer" on public.plan_meals for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.nutrition_plans p where p.id = plan_meals.plan_id and (p.client_id = auth.uid() or p.is_template)));

drop policy if exists "opciones_leer" on public.plan_options;
create policy "opciones_leer" on public.plan_options for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.plan_meals m join public.nutrition_plans p on p.id = m.plan_id
    where m.id = plan_options.meal_id and (p.client_id = auth.uid() or p.is_template)));

drop policy if exists "items_leer" on public.plan_items;
create policy "items_leer" on public.plan_items for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.plan_options o join public.plan_meals m on m.id = o.meal_id
    join public.nutrition_plans p on p.id = m.plan_id
    where o.id = plan_items.option_id and (p.client_id = auth.uid() or p.is_template)));

-- El asesorado puede crear SUS borradores generados por la valoración (quedan en revisión).
-- Solo se crean activos si el entrenador habilitó la publicación automática.
create or replace function public.auto_publish() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (data->>'auto_publish')::boolean from public.app_settings where id = 1), false);
$$;

drop policy if exists "plan_borrador_crear" on public.nutrition_plans;
create policy "plan_borrador_crear" on public.nutrition_plans for insert to authenticated
  with check (client_id = auth.uid() and review and not is_template and (not active or public.auto_publish()));

drop policy if exists "comidas_borrador_crear" on public.plan_meals;
create policy "comidas_borrador_crear" on public.plan_meals for insert to authenticated
  with check (exists (select 1 from public.nutrition_plans p where p.id = plan_meals.plan_id and p.client_id = auth.uid() and p.review));

drop policy if exists "opciones_borrador_crear" on public.plan_options;
create policy "opciones_borrador_crear" on public.plan_options for insert to authenticated
  with check (exists (select 1 from public.plan_meals m join public.nutrition_plans p on p.id = m.plan_id
    where m.id = plan_options.meal_id and p.client_id = auth.uid() and p.review));

drop policy if exists "items_borrador_crear" on public.plan_items;
create policy "items_borrador_crear" on public.plan_items for insert to authenticated
  with check (exists (select 1 from public.plan_options o join public.plan_meals m on m.id = o.meal_id
    join public.nutrition_plans p on p.id = m.plan_id
    where o.id = plan_items.option_id and p.client_id = auth.uid() and p.review));

drop policy if exists "rutina_borrador_crear" on public.routines;
create policy "rutina_borrador_crear" on public.routines for insert to authenticated
  with check (client_id = auth.uid() and review and not is_template and (not active or public.auto_publish()));

drop policy if exists "dias_borrador_crear" on public.routine_days;
create policy "dias_borrador_crear" on public.routine_days for insert to authenticated
  with check (exists (select 1 from public.routines r where r.id = routine_days.routine_id and r.client_id = auth.uid() and r.review));

drop policy if exists "rutina_ej_borrador_crear" on public.routine_exercises;
create policy "rutina_ej_borrador_crear" on public.routine_exercises for insert to authenticated
  with check (exists (select 1 from public.routine_days d join public.routines r on r.id = d.routine_id
    where d.id = routine_exercises.day_id and r.client_id = auth.uid() and r.review));

-- ---------- Almacenamiento privado de fotos (archivos cifrados) ----------
insert into storage.buckets (id, name, public) values ('progress-photos', 'progress-photos', false)
on conflict (id) do nothing;

drop policy if exists "fotos_archivos_leer" on storage.objects;
create policy "fotos_archivos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'progress-photos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
drop policy if exists "fotos_archivos_subir" on storage.objects;
create policy "fotos_archivos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "fotos_archivos_borrar" on storage.objects;
create policy "fotos_archivos_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------- Última actividad por asesorado (bandeja de pendientes del entrenador) ----------
create or replace function public.client_last_activity() returns table (client_id uuid, last_date date)
language sql stable security definer set search_path = public as $$
  select p.id, greatest(
    (select max(f.log_date) from public.food_logs f where f.client_id = p.id),
    (select max(w.started_at)::date from public.workouts w where w.client_id = p.id),
    (select max(c.check_date) from public.checkins c where c.client_id = p.id))
  from public.profiles p
  where p.role = 'client' and public.is_coach();
$$;
