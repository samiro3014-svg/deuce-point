-- =====================================================================
--  Deuce Point · Migración v6
--  Rendimiento en tenis, nutrición avanzada, comunicación y adherencia,
--  negocio, asistente y notificaciones push.
--  Ejecutar UNA vez en: Supabase > SQL Editor > New query > Run
--  Requiere la migración v3. Incluye las migraciones v4 y v5 (si ya las ejecutaste, no pasa nada).
--  Se puede ejecutar de nuevo sin errores.
-- =====================================================================

-- #####################################################################
--  Parte A · Migraciones v4 y v5
-- #####################################################################
-- =====================================================================
--  Parte 1 · Contenido de la migración v4
-- =====================================================================
-- Ciclado de carbohidratos y comidas cercanas al entrenamiento
alter table public.nutrition_plans add column if not exists rest_carbs_g numeric;
alter table public.nutrition_plans add column if not exists train_days jsonb;
alter table public.nutrition_plans add column if not exists peri_meals jsonb;

-- Fases de entrenamiento (adaptación anatómica)
alter table public.routines add column if not exists phase int;
alter table public.routines add column if not exists phase_weeks int;

-- Parámetros de cálculo por defecto (conserva los valores que ya hayas configurado)
update public.app_settings
set data = '{"loss_rate_pct": 0.75, "deficit_min": 300, "deficit_max": 750, "recomp_deficit": 250, "surplus_beg": 500, "surplus_int": 350, "surplus_adv": 250, "protein_gkg": 2, "fat_gkg": 0.9, "rest_carb_cut": 125, "rest_carb_min_gkg": 2, "peri_carb_pct": 60, "cardio_z2": true, "adapt_weeks": 4}'::jsonb
         || (data - 'deficit_pct' - 'surplus_pct' - 'recomp_pct')
         || '{"schema_version": 4}'::jsonb,
    updated_at = now()
where id = 1;

-- Ejercicios de movilidad y cardio en Zona 2
insert into public.exercises (name, muscle_group, family, equipment) values
  ('Movilidad de tobillo en pared', 'Movilidad', 'Movilidad de tobillo', 'Peso corporal'),
  ('Estiramiento de gastrocnemio y sóleo', 'Movilidad', 'Movilidad de tobillo', 'Peso corporal'),
  ('Bisagra de cadera con palo', 'Movilidad', 'Patrón de bisagra', 'Peso corporal'),
  ('Estiramiento activo de isquiotibiales', 'Movilidad', 'Patrón de bisagra', 'Peso corporal'),
  ('Wall angels', 'Movilidad', 'Movilidad torácica y escapular', 'Peso corporal'),
  ('Movilidad torácica en cuadrupedia', 'Movilidad', 'Movilidad torácica y escapular', 'Peso corporal'),
  ('Dislocaciones de hombro con banda', 'Movilidad', 'Movilidad torácica y escapular', 'Banda'),
  ('Apertura de cadera 90/90', 'Movilidad', 'Movilidad de cadera', 'Peso corporal'),
  ('Sentadilla profunda asistida', 'Movilidad', 'Movilidad de cadera', 'Peso corporal'),
  ('Caminata inclinada en banda (Zona 2)', 'Cardio', 'Cardio Zona 2', 'Máquina'),
  ('Bicicleta estática (Zona 2)', 'Cardio', 'Cardio Zona 2', 'Máquina'),
  ('Elíptica (Zona 2)', 'Cardio', 'Cardio Zona 2', 'Máquina'),
  ('Remo ergómetro (Zona 2)', 'Cardio', 'Cardio Zona 2', 'Máquina'),
  ('Caminata al aire libre (Zona 2)', 'Cardio', 'Cardio Zona 2', 'Peso corporal')
on conflict (name) do nothing;

-- =====================================================================
--  Parte 2 · Novedades v5
-- =====================================================================
-- ---------- Alimentos: costo (1 económico · 2 moderado · 3 costoso) y comidas en que se usan ----------
alter table public.foods add column if not exists cost_tier smallint check (cost_tier between 1 and 3);
alter table public.foods add column if not exists meal_use jsonb;

insert into public.foods (name, category, kcal, protein, carbs, fat, fiber, unit_name, unit_grams) values
  ('Tofu firme', 'Proteínas', 144, 17.3, 2.8, 8.7, 2.3, 'porción', 100),
  ('Proteína vegetal en polvo', 'Suplementos', 380, 75, 8, 6, 3, 'scoop', 30)
on conflict (name) do nothing;

-- ---------- Membresías (una fila por asesorado) ----------
create table if not exists public.memberships (
  client_id   uuid primary key references public.profiles(id) on delete cascade,
  plan_name   text,
  start_date  date,
  end_date    date,
  amount      numeric,
  notes       text,
  archived    boolean not null default false,
  updated_at  timestamptz not null default now()
);
alter table public.memberships enable row level security;
drop policy if exists "membresia_leer" on public.memberships;
create policy "membresia_leer" on public.memberships for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "membresia_gestionar" on public.memberships;
create policy "membresia_gestionar" on public.memberships for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------- Informes mensuales ----------
create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles(id) on delete cascade,
  period_start  date not null,
  period_end    date not null,
  comment       text,
  goals         text,
  created_at    timestamptz not null default now(),
  check (period_end >= period_start)
);
create index if not exists reports_client_idx on public.reports (client_id, period_end desc);
alter table public.reports enable row level security;
drop policy if exists "informe_leer" on public.reports;
create policy "informe_leer" on public.reports for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "informe_gestionar" on public.reports;
create policy "informe_gestionar" on public.reports for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- ---------- Eliminación definitiva de un asesorado (solo el entrenador) ----------
-- Borra la cuenta de acceso; todos sus datos se eliminan en cascada.
create or replace function public.delete_client(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then
    raise exception 'Solo el entrenador puede eliminar asesorados.' using errcode = '42501';
  end if;
  if target = auth.uid() or exists (select 1 from public.profiles where id = target and role = 'coach') then
    raise exception 'No se puede eliminar una cuenta de entrenador.' using errcode = '42501';
  end if;
  delete from auth.users where id = target;
  delete from public.profiles where id = target;
end;
$$;
revoke all on function public.delete_client(uuid) from public, anon;
grant execute on function public.delete_client(uuid) to authenticated;

-- El entrenador puede borrar los archivos cifrados de fotos (no puede abrirlos sin la llave del asesorado).
-- La app los borra antes de eliminar la cuenta.
drop policy if exists "fotos_archivos_borrar_entrenador" on storage.objects;
create policy "fotos_archivos_borrar_entrenador" on storage.objects for delete to authenticated
  using (bucket_id = 'progress-photos' and public.is_coach());

-- ---------- Ajustes por defecto (conserva los valores que ya tengas) ----------
update public.app_settings
set data = '{"menu_source": "generador", "menu_options": 3, "renew_days": 7}'::jsonb
         || data
         || '{"schema_version": 5}'::jsonb,
    updated_at = now()
where id = 1;

-- #####################################################################
--  Parte B · Novedades v6
-- #####################################################################

-- ---------- Roles: entrenador, asistente y asesorado ----------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('coach', 'client', 'assistant'));

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role in ('coach', 'assistant'));
$$;

-- ---------- Columnas nuevas ----------
alter table public.workouts add column if not exists rpe smallint check (rpe between 0 and 10);
alter table public.workouts add column if not exists load numeric;
alter table public.daily_logs add column if not exists steps int;
alter table public.foods add column if not exists price_kg numeric;
alter table public.plan_options add column if not exists recipe text;
alter table public.routine_exercises add column if not exists group_tag text;
alter table public.routine_exercises add column if not exists tempo text;
alter table public.memberships add column if not exists tier text not null default 'completo';

-- ---------- Tenis: sesiones, bienestar, torneos, sudoración, pruebas, molestias ----------
create table if not exists public.tennis_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null, kind text not null default 'Práctica', minutes int not null check (minutes between 1 and 600),
  surface text, rpe smallint not null check (rpe between 0 and 10), result text, notes text,
  created_at timestamptz not null default now());
create table if not exists public.wellness (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null,
  sleep smallint check (sleep between 1 and 5), fatigue smallint check (fatigue between 1 and 5), soreness smallint check (soreness between 1 and 5),
  stress smallint check (stress between 1 and 5), mood smallint check (mood between 1 and 5), notes text,
  created_at timestamptz not null default now(), unique (client_id, log_date));
create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, start_date date not null, end_date date, surface text, city text, category text, notes text,
  created_at timestamptz not null default now());
create table if not exists public.sweat_tests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  test_date date not null, minutes int not null, pre_kg numeric not null, post_kg numeric not null,
  fluid_ml int not null default 0, urine_ml int not null default 0, temp_c numeric, humidity numeric, salty boolean not null default false, notes text,
  created_at timestamptz not null default now());
create table if not exists public.fitness_tests (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  test_date date not null, results jsonb not null default '{}'::jsonb, notes text,
  created_at timestamptz not null default now());
create table if not exists public.pain_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  report_date date not null, zone text not null, side text, intensity smallint not null check (intensity between 0 and 10), notes text,
  resolved_at timestamptz, reviewed_at timestamptz, created_at timestamptz not null default now());

-- ---------- Nutrición: antropometría, suplementos, ciclo ----------
create table if not exists public.anthropometry (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  measure_date date not null, data jsonb not null default '{}'::jsonb, notes text,
  created_at timestamptz not null default now());
create table if not exists public.supplement_plans (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  items jsonb not null default '[]'::jsonb, notes text, updated_at timestamptz not null default now());
create table if not exists public.supplement_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  log_date date not null, supp_key text not null, created_at timestamptz not null default now(),
  unique (client_id, log_date, supp_key));
create table if not exists public.cycle_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  start_date date not null, created_at timestamptz not null default now(), unique (client_id, start_date));

-- ---------- Comunicación y adherencia ----------
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now(), read_at timestamptz, notified_at timestamptz);
create index if not exists messages_client_idx on public.messages (client_id, created_at);
create table if not exists public.lessons (
  id uuid primary key default gen_random_uuid(),
  week int not null default 1, audience text not null default 'todos', title text not null, body text not null, video_url text,
  published boolean not null default true, created_at timestamptz not null default now());
create table if not exists public.lesson_reads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  created_at timestamptz not null default now(), unique (client_id, lesson_id));
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null, metric text not null check (metric in ('pasos', 'agua', 'registro', 'sesiones')), goal numeric,
  start_date date not null, end_date date not null, ranking boolean not null default true, description text,
  created_at timestamptz not null default now());
create table if not exists public.challenge_members (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.challenges(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(), unique (challenge_id, client_id));

-- ---------- Negocio ----------
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.profiles(id) on delete cascade,
  pay_date date not null default current_date, amount numeric not null, concept text, method text,
  created_at timestamptz not null default now());
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text not null, email text, goal text, message text, ref text, calc jsonb, source text,
  status text not null default 'nuevo' check (status in ('nuevo', 'contactado', 'convertido', 'descartado')),
  created_at timestamptz not null default now());
create table if not exists public.surveys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  nps smallint not null check (nps between 0 and 10), items jsonb not null default '{}'::jsonb,
  comment text, testimonial text, consent boolean not null default false, show_name boolean not null default false,
  created_at timestamptz not null default now());

-- ---------- Notificaciones push ----------
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null, ua text,
  created_at timestamptz not null default now());
create table if not exists public.reminder_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  prefs jsonb not null default '{}'::jsonb, tz text not null default 'America/Bogota', updated_at timestamptz not null default now());
create table if not exists public.push_log (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null, sent_on date not null, created_at timestamptz not null default now(),
  unique (user_id, key, sent_on));

-- =====================================================================
--  Seguridad (RLS)
-- =====================================================================
alter table public.tennis_sessions enable row level security;
alter table public.wellness enable row level security;
alter table public.tournaments enable row level security;
alter table public.sweat_tests enable row level security;
alter table public.fitness_tests enable row level security;
alter table public.pain_reports enable row level security;
alter table public.anthropometry enable row level security;
alter table public.supplement_plans enable row level security;
alter table public.supplement_logs enable row level security;
alter table public.cycle_logs enable row level security;
alter table public.messages enable row level security;
alter table public.lessons enable row level security;
alter table public.lesson_reads enable row level security;
alter table public.challenges enable row level security;
alter table public.challenge_members enable row level security;
alter table public.payments enable row level security;
alter table public.leads enable row level security;
alter table public.surveys enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.reminder_prefs enable row level security;
alter table public.push_log enable row level security;   -- sin políticas: solo la función del servidor

-- Registros propios del asesorado (el entrenador gestiona todo, el asistente lee)
do $$
declare t text;
begin
  foreach t in array array['tennis_sessions', 'wellness', 'tournaments', 'sweat_tests', 'pain_reports', 'cycle_logs', 'supplement_logs', 'lesson_reads'] loop
    execute format('drop policy if exists %I on public.%I', t || '_propios', t);
    execute format('create policy %I on public.%I for all to authenticated using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach())', t || '_propios', t);
    execute format('drop policy if exists %I on public.%I', t || '_staff_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_leer', t);
  end loop;
  -- Mediciones que registra el equipo (entrenador o asistente); el asesorado las lee
  foreach t in array array['fitness_tests', 'anthropometry'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (client_id = auth.uid() or public.is_staff())', t || '_leer', t);
    execute format('drop policy if exists %I on public.%I', t || '_gestionar', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t || '_gestionar', t);
  end loop;
  -- Lectura del asistente en las tablas de datos de los asesorados
  foreach t in array array['profiles', 'routines', 'routine_days', 'routine_exercises', 'nutrition_plans', 'plan_meals', 'plan_options', 'plan_items', 'workouts', 'workout_sets', 'food_logs', 'daily_logs', 'body_logs', 'intakes', 'checkins', 'reports'] loop
    execute format('drop policy if exists %I on public.%I', t || '_staff_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.is_staff())', t || '_staff_leer', t);
  end loop;
end $$;

drop policy if exists "molestia_staff_revisar" on public.pain_reports;
create policy "molestia_staff_revisar" on public.pain_reports for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "checkin_staff_responder" on public.checkins;
create policy "checkin_staff_responder" on public.checkins for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists "suplementos_leer" on public.supplement_plans;
create policy "suplementos_leer" on public.supplement_plans for select to authenticated using (client_id = auth.uid() or public.is_staff());
drop policy if exists "suplementos_gestionar" on public.supplement_plans;
create policy "suplementos_gestionar" on public.supplement_plans for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Mensajes: cada asesorado ve su conversación; el equipo ve todas. Solo se puede modificar «read_at».
drop policy if exists "mensajes_leer" on public.messages;
create policy "mensajes_leer" on public.messages for select to authenticated using (client_id = auth.uid() or public.is_staff());
drop policy if exists "mensajes_enviar" on public.messages;
create policy "mensajes_enviar" on public.messages for insert to authenticated
  with check (sender_id = auth.uid() and (client_id = auth.uid() or public.is_staff()));
drop policy if exists "mensajes_leido" on public.messages;
create policy "mensajes_leido" on public.messages for update to authenticated
  using (client_id = auth.uid() or public.is_staff()) with check (client_id = auth.uid() or public.is_staff());
drop policy if exists "mensajes_borrar" on public.messages;
create policy "mensajes_borrar" on public.messages for delete to authenticated using (public.is_coach());
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

drop policy if exists "lecciones_leer" on public.lessons;
create policy "lecciones_leer" on public.lessons for select to authenticated using (published or public.is_staff());
drop policy if exists "lecciones_gestionar" on public.lessons;
create policy "lecciones_gestionar" on public.lessons for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "retos_leer" on public.challenges;
create policy "retos_leer" on public.challenges for select to authenticated using (true);
drop policy if exists "retos_gestionar" on public.challenges;
create policy "retos_gestionar" on public.challenges for all to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists "retos_participar" on public.challenge_members;
create policy "retos_participar" on public.challenge_members for all to authenticated using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach());
drop policy if exists "retos_staff_leer" on public.challenge_members;
create policy "retos_staff_leer" on public.challenge_members for select to authenticated using (public.is_staff());

drop policy if exists "pagos_gestionar" on public.payments;
create policy "pagos_gestionar" on public.payments for all to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists "prospectos_gestionar" on public.leads;
create policy "prospectos_gestionar" on public.leads for all to authenticated using (public.is_coach()) with check (public.is_coach());

drop policy if exists "encuesta_crear" on public.surveys;
create policy "encuesta_crear" on public.surveys for insert to authenticated with check (client_id = auth.uid());
drop policy if exists "encuesta_leer" on public.surveys;
create policy "encuesta_leer" on public.surveys for select to authenticated using (client_id = auth.uid() or public.is_coach());
drop policy if exists "encuesta_gestionar" on public.surveys;
create policy "encuesta_gestionar" on public.surveys for delete to authenticated using (public.is_coach());

drop policy if exists "push_propias" on public.push_subscriptions;
create policy "push_propias" on public.push_subscriptions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "recordatorios_propios" on public.reminder_prefs;
create policy "recordatorios_propios" on public.reminder_prefs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =====================================================================
--  Funciones
-- =====================================================================
-- Última actividad por asesorado (también para el asistente)
create or replace function public.client_last_activity() returns table (client_id uuid, last_date date)
language sql stable security definer set search_path = public as $$
  select p.id, greatest(
    (select max(f.log_date) from public.food_logs f where f.client_id = p.id),
    (select max(w.started_at)::date from public.workouts w where w.client_id = p.id),
    (select max(c.check_date) from public.checkins c where c.client_id = p.id))
  from public.profiles p
  where p.role = 'client' and public.is_staff();
$$;

-- Tabla de posiciones de un reto (nombre y apellido abreviado; solo participantes y equipo)
create or replace function public.challenge_ranking(ch uuid) returns table (name text, score numeric, me boolean)
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  select * into c from public.challenges where id = ch;
  if not found then return; end if;
  if not (public.is_staff() or exists (select 1 from public.challenge_members m where m.challenge_id = ch and m.client_id = auth.uid())) then return; end if;
  return query
  select split_part(coalesce(p.full_name, ''), ' ', 1) || coalesce(nullif(' ' || left(split_part(coalesce(p.full_name, ''), ' ', 2), 1) || '.', ' .'), ''),
    (case c.metric
      when 'pasos' then (select coalesce(sum(d.steps), 0) from public.daily_logs d where d.client_id = m.client_id and d.log_date between c.start_date and c.end_date)
      when 'agua' then (select count(*) from public.daily_logs d where d.client_id = m.client_id and d.log_date between c.start_date and c.end_date
                          and d.water_ml >= coalesce((select n.water_ml from public.nutrition_plans n where n.client_id = m.client_id and n.active limit 1), 2000))
      when 'registro' then (select count(distinct f.log_date) from public.food_logs f where f.client_id = m.client_id and f.log_date between c.start_date and c.end_date)
      else (select count(*) from public.workouts w where w.client_id = m.client_id and w.started_at::date between c.start_date and c.end_date)
         + (select count(*) from public.tennis_sessions t where t.client_id = m.client_id and t.log_date between c.start_date and c.end_date)
    end)::numeric,
    m.client_id = auth.uid()
  from public.challenge_members m join public.profiles p on p.id = m.client_id
  where m.challenge_id = ch;
end;
$$;
revoke all on function public.challenge_ranking(uuid) from public, anon;
grant execute on function public.challenge_ranking(uuid) to authenticated;

-- Información pública para la página de captación (sin datos de asesorados)
create or replace function public.public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('whatsapp', data->>'whatsapp', 'title', data->>'landing_title', 'intro', data->>'landing_intro', 'services', data->>'landing_services')
  from public.app_settings where id = 1;
$$;
grant execute on function public.public_info() to anon, authenticated;

-- Registro de prospectos desde la página pública (validado; un registro por número cada 24 h)
create or replace function public.submit_lead(p_name text, p_phone text, p_goal text, p_message text, p_ref text, p_calc jsonb, p_source text)
returns void language plpgsql security definer set search_path = public as $$
declare v_phone text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
begin
  if length(trim(coalesce(p_name, ''))) < 3 or length(v_phone) < 7 or length(v_phone) > 15 then raise exception 'Datos incompletos'; end if;
  if exists (select 1 from public.leads where phone = v_phone and created_at > now() - interval '24 hours') then
    update public.leads set goal = left(p_goal, 120), message = left(p_message, 1000), calc = p_calc where phone = v_phone and created_at > now() - interval '24 hours';
    return;
  end if;
  if (select count(*) from public.leads where created_at > now() - interval '1 hour') > 60 then raise exception 'Intenta más tarde'; end if;
  insert into public.leads (name, phone, goal, message, ref, calc, source)
  values (left(trim(p_name), 120), v_phone, left(p_goal, 120), left(p_message, 1000), upper(left(p_ref, 20)), p_calc, left(coalesce(p_source, 'pagina'), 40));
end;
$$;
grant execute on function public.submit_lead(text, text, text, text, text, jsonb, text) to anon, authenticated;

-- =====================================================================
--  Ejercicios de prevención para tenis
-- =====================================================================
insert into public.exercises (name, muscle_group, family, equipment) values
  ('Rotación externa a 90° con banda', 'Prevención', 'Prevención de hombro', 'Banda'),
  ('Estiramiento posterior de hombro (sleeper)', 'Prevención', 'Prevención de hombro', 'Peso corporal'),
  ('Excéntrico de extensión de muñeca', 'Prevención', 'Prevención de codo y muñeca', 'Mancuernas'),
  ('Torsión inversa con barra flexible', 'Prevención', 'Prevención de codo y muñeca', 'Barra flexible'),
  ('Desviación radial y cubital con martillo', 'Prevención', 'Prevención de codo y muñeca', 'Mancuernas'),
  ('Apretón de pelota', 'Prevención', 'Prevención de codo y muñeca', 'Pelota'),
  ('Equilibrio monopodal', 'Prevención', 'Prevención de tobillo', 'Peso corporal'),
  ('Elevación de talones excéntrica en escalón', 'Prevención', 'Prevención de tobillo', 'Peso corporal'),
  ('Saltos de tobillo (pogo)', 'Prevención', 'Prevención de tobillo', 'Peso corporal'),
  ('Alcance en Y monopodal', 'Prevención', 'Prevención de tobillo', 'Peso corporal'),
  ('Plancha de Copenhague', 'Prevención', 'Prevención de aductores', 'Peso corporal'),
  ('Aducción de cadera en polea', 'Prevención', 'Prevención de aductores', 'Polea')
on conflict (name) do nothing;

-- ---------- Ajustes por defecto (conserva los valores que ya tengas) ----------
update public.app_settings
set data = '{"match_carb_gkg": 7, "pre_carb_gkg": 6, "taper_days": 7, "taper_pct": 60, "sweat_na_mgl": 900, "sweat_na_salty": 1500, "referral_pct": 10}'::jsonb
         || data
         || '{"schema_version": 6}'::jsonb,
    updated_at = now()
where id = 1;

-- Para crear una cuenta de asistente (después de que la persona se registre en la app):
-- update public.profiles set role = 'assistant' where email = 'CORREO_DEL_ASISTENTE';
