-- =====================================================================
--  Deuce Point · Esquema de base de datos para Supabase
--  Entrenamiento (rutinas, sesiones, series) + Nutrición (planes, diario, agua, peso)
--  Ejecutar UNA sola vez en: Supabase > SQL Editor > New query > Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Perfiles (uno por usuario) ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  role        text not null default 'client' check (role in ('coach','client')),
  goal        text,
  created_at  timestamptz not null default now()
);

create or replace function public.is_coach() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'coach');
$$;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================================
--  ENTRENAMIENTO
-- =====================================================================
create table if not exists public.exercises (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  muscle_group  text not null,
  family        text,
  equipment     text,
  instructions  text,
  video_url     text,
  created_at    timestamptz not null default now()
);

-- client_id vacío + is_template = plantilla del entrenador
create table if not exists public.routines (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.profiles(id) on delete cascade,
  is_template  boolean not null default false,
  name         text not null,
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.routine_days (
  id          uuid primary key default gen_random_uuid(),
  routine_id  uuid not null references public.routines(id) on delete cascade,
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.routine_exercises (
  id            uuid primary key default gen_random_uuid(),
  day_id        uuid not null references public.routine_days(id) on delete cascade,
  exercise_id   uuid not null references public.exercises(id),
  position      int not null default 0,
  sets          int,
  reps          text,
  rir           text,
  rest_seconds  int,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.workouts (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles(id) on delete cascade,
  routine_id    uuid references public.routines(id) on delete set null,
  day_id        uuid references public.routine_days(id) on delete set null,
  day_name      text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  total_volume  numeric,
  notes         text,
  created_at    timestamptz not null default now()
);

create table if not exists public.workout_sets (
  id                   uuid primary key default gen_random_uuid(),
  workout_id           uuid not null references public.workouts(id) on delete cascade,
  client_id            uuid not null references public.profiles(id) on delete cascade,
  exercise_id          uuid not null references public.exercises(id),
  routine_exercise_id  uuid,
  exercise_order       int not null default 0,
  set_number           int not null,
  weight_kg            numeric not null default 0,
  reps                 int not null default 0,
  rir                  numeric,
  created_at           timestamptz not null default now()
);

-- =====================================================================
--  NUTRICIÓN
-- =====================================================================
create table if not exists public.foods (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  category    text not null,
  kcal        numeric not null default 0,   -- por 100 g
  protein     numeric not null default 0,
  carbs       numeric not null default 0,
  fat         numeric not null default 0,
  fiber       numeric not null default 0,
  unit_name   text,                         -- medida casera
  unit_grams  numeric,
  created_at  timestamptz not null default now()
);

create table if not exists public.nutrition_plans (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid references public.profiles(id) on delete cascade,
  is_template  boolean not null default false,
  name         text not null,
  kcal         numeric,
  protein_g    numeric,
  carbs_g      numeric,
  fat_g        numeric,
  water_ml     int,
  notes        text,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create table if not exists public.plan_meals (
  id            uuid primary key default gen_random_uuid(),
  plan_id       uuid not null references public.nutrition_plans(id) on delete cascade,
  name          text not null,
  time_label    text,
  instructions  text,
  position      int not null default 0,
  created_at    timestamptz not null default now()
);

create table if not exists public.plan_options (
  id          uuid primary key default gen_random_uuid(),
  meal_id     uuid not null references public.plan_meals(id) on delete cascade,
  name        text not null,
  position    int not null default 0,
  created_at  timestamptz not null default now()
);

create table if not exists public.plan_items (
  id          uuid primary key default gen_random_uuid(),
  option_id   uuid not null references public.plan_options(id) on delete cascade,
  food_id     uuid not null references public.foods(id),
  grams       numeric not null default 100,
  position    int not null default 0,
  note        text,
  created_at  timestamptz not null default now()
);

-- Registro diario de alimentos (valores guardados en el momento del registro)
create table if not exists public.food_logs (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.profiles(id) on delete cascade,
  log_date      date not null,
  meal_id       uuid,
  meal_name     text,
  food_id       uuid references public.foods(id) on delete set null,
  plan_item_id  uuid,
  name          text not null,
  grams         numeric,
  kcal          numeric not null default 0,
  protein       numeric not null default 0,
  carbs         numeric not null default 0,
  fat           numeric not null default 0,
  created_at    timestamptz not null default now()
);

-- Agua y opción de menú elegida por día
create table if not exists public.daily_logs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  log_date    date not null,
  water_ml    int not null default 0,
  choices     jsonb not null default '{}'::jsonb,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (client_id, log_date)
);

-- Peso y medidas
create table if not exists public.body_logs (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.profiles(id) on delete cascade,
  log_date    date not null,
  weight_kg   numeric,
  waist_cm    numeric,
  body_fat    numeric,
  notes       text,
  created_at  timestamptz not null default now()
);

create index if not exists idx_routines_client   on public.routines(client_id);
create index if not exists idx_days_routine      on public.routine_days(routine_id);
create index if not exists idx_rex_day           on public.routine_exercises(day_id);
create index if not exists idx_workouts_client   on public.workouts(client_id, started_at desc);
create index if not exists idx_sets_workout      on public.workout_sets(workout_id);
create index if not exists idx_sets_client_ex    on public.workout_sets(client_id, exercise_id, created_at desc);
create index if not exists idx_plans_client      on public.nutrition_plans(client_id);
create index if not exists idx_meals_plan        on public.plan_meals(plan_id);
create index if not exists idx_options_meal      on public.plan_options(meal_id);
create index if not exists idx_items_option      on public.plan_items(option_id);
create index if not exists idx_foodlogs_day      on public.food_logs(client_id, log_date);
create index if not exists idx_body_client       on public.body_logs(client_id, log_date);

-- =====================================================================
--  Seguridad: cada asesorado solo ve lo suyo; el entrenador ve todo
-- =====================================================================
alter table public.profiles          enable row level security;
alter table public.exercises         enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_days      enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.workouts          enable row level security;
alter table public.workout_sets      enable row level security;
alter table public.foods             enable row level security;
alter table public.nutrition_plans   enable row level security;
alter table public.plan_meals        enable row level security;
alter table public.plan_options      enable row level security;
alter table public.plan_items        enable row level security;
alter table public.food_logs         enable row level security;
alter table public.daily_logs        enable row level security;
alter table public.body_logs         enable row level security;

-- Perfiles
drop policy if exists "perfil_leer" on public.profiles;
create policy "perfil_leer" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_coach());
drop policy if exists "perfil_actualizar" on public.profiles;
create policy "perfil_actualizar" on public.profiles for update to authenticated
  using (id = auth.uid() or public.is_coach())
  with check (id = auth.uid() or public.is_coach());
revoke update on public.profiles from authenticated;
grant update (full_name, goal) on public.profiles to authenticated;

-- Bibliotecas: todos leen, solo el entrenador gestiona
drop policy if exists "ejercicios_leer" on public.exercises;
create policy "ejercicios_leer" on public.exercises for select to authenticated using (true);
drop policy if exists "ejercicios_gestionar" on public.exercises;
create policy "ejercicios_gestionar" on public.exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "alimentos_leer" on public.foods;
create policy "alimentos_leer" on public.foods for select to authenticated using (true);
drop policy if exists "alimentos_gestionar" on public.foods;
create policy "alimentos_gestionar" on public.foods for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Rutinas (las plantillas solo las ve el entrenador)
drop policy if exists "rutinas_leer" on public.routines;
create policy "rutinas_leer" on public.routines for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "rutinas_gestionar" on public.routines;
create policy "rutinas_gestionar" on public.routines for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "dias_leer" on public.routine_days;
create policy "dias_leer" on public.routine_days for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.routines r where r.id = routine_days.routine_id and r.client_id = auth.uid()));
drop policy if exists "dias_gestionar" on public.routine_days;
create policy "dias_gestionar" on public.routine_days for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "rutina_ej_leer" on public.routine_exercises;
create policy "rutina_ej_leer" on public.routine_exercises for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.routine_days d join public.routines r on r.id = d.routine_id
    where d.id = routine_exercises.day_id and r.client_id = auth.uid()));
drop policy if exists "rutina_ej_gestionar" on public.routine_exercises;
create policy "rutina_ej_gestionar" on public.routine_exercises for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Planes nutricionales (las plantillas solo las ve el entrenador)
drop policy if exists "planes_leer" on public.nutrition_plans;
create policy "planes_leer" on public.nutrition_plans for select to authenticated
  using (client_id = auth.uid() or public.is_coach());
drop policy if exists "planes_gestionar" on public.nutrition_plans;
create policy "planes_gestionar" on public.nutrition_plans for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "comidas_leer" on public.plan_meals;
create policy "comidas_leer" on public.plan_meals for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.nutrition_plans p where p.id = plan_meals.plan_id and p.client_id = auth.uid()));
drop policy if exists "comidas_gestionar" on public.plan_meals;
create policy "comidas_gestionar" on public.plan_meals for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "opciones_leer" on public.plan_options;
create policy "opciones_leer" on public.plan_options for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.plan_meals m join public.nutrition_plans p on p.id = m.plan_id
    where m.id = plan_options.meal_id and p.client_id = auth.uid()));
drop policy if exists "opciones_gestionar" on public.plan_options;
create policy "opciones_gestionar" on public.plan_options for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

drop policy if exists "items_leer" on public.plan_items;
create policy "items_leer" on public.plan_items for select to authenticated
  using (public.is_coach() or exists (
    select 1 from public.plan_options o join public.plan_meals m on m.id = o.meal_id
    join public.nutrition_plans p on p.id = m.plan_id
    where o.id = plan_items.option_id and p.client_id = auth.uid()));
drop policy if exists "items_gestionar" on public.plan_items;
create policy "items_gestionar" on public.plan_items for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Registros propios: el asesorado registra los suyos; el entrenador ve y corrige todos
drop policy if exists "sesiones_propias" on public.workouts;
create policy "sesiones_propias" on public.workouts for all to authenticated
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists "series_propias" on public.workout_sets;
create policy "series_propias" on public.workout_sets for all to authenticated
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists "comidas_propias" on public.food_logs;
create policy "comidas_propias" on public.food_logs for all to authenticated
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists "diario_propio" on public.daily_logs;
create policy "diario_propio" on public.daily_logs for all to authenticated
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

drop policy if exists "medidas_propias" on public.body_logs;
create policy "medidas_propias" on public.body_logs for all to authenticated
  using (client_id = auth.uid() or public.is_coach())
  with check (client_id = auth.uid() or public.is_coach());

-- =====================================================================
--  Bibliotecas iniciales (se pueden ampliar desde la app)
-- =====================================================================
insert into public.exercises (name, muscle_group, family, equipment) values
  ('Press de banca con barra', 'Pecho', 'Press horizontal', 'Barra'),
  ('Press de banca con mancuernas', 'Pecho', 'Press horizontal', 'Mancuernas'),
  ('Press de pecho en máquina', 'Pecho', 'Press horizontal', 'Máquina'),
  ('Press de banca en Smith', 'Pecho', 'Press horizontal', 'Smith'),
  ('Press de pecho en polea', 'Pecho', 'Press horizontal', 'Polea'),
  ('Flexiones de pecho', 'Pecho', 'Press horizontal', 'Peso corporal'),
  ('Press inclinado con barra', 'Pecho', 'Press inclinado', 'Barra'),
  ('Press inclinado con mancuernas', 'Pecho', 'Press inclinado', 'Mancuernas'),
  ('Press inclinado en máquina', 'Pecho', 'Press inclinado', 'Máquina'),
  ('Press inclinado en Smith', 'Pecho', 'Press inclinado', 'Smith'),
  ('Aperturas con mancuernas', 'Pecho', 'Aperturas', 'Mancuernas'),
  ('Pec deck', 'Pecho', 'Aperturas', 'Máquina'),
  ('Cruce de poleas', 'Pecho', 'Aperturas', 'Polea'),
  ('Aperturas en polea baja', 'Pecho', 'Aperturas', 'Polea'),
  ('Fondos en paralelas', 'Pecho', 'Fondos y press declinado', 'Peso corporal'),
  ('Fondos asistidos en máquina', 'Pecho', 'Fondos y press declinado', 'Máquina'),
  ('Press declinado con barra', 'Pecho', 'Fondos y press declinado', 'Barra'),
  ('Dominadas', 'Espalda', 'Tracción vertical', 'Peso corporal'),
  ('Dominadas asistidas en máquina', 'Espalda', 'Tracción vertical', 'Máquina'),
  ('Jalón al pecho agarre abierto', 'Espalda', 'Tracción vertical', 'Polea'),
  ('Jalón al pecho agarre neutro', 'Espalda', 'Tracción vertical', 'Polea'),
  ('Jalón unilateral en polea', 'Espalda', 'Tracción vertical', 'Polea'),
  ('Remo con barra', 'Espalda', 'Remo horizontal', 'Barra'),
  ('Remo con mancuerna a una mano', 'Espalda', 'Remo horizontal', 'Mancuernas'),
  ('Remo sentado en polea', 'Espalda', 'Remo horizontal', 'Polea'),
  ('Remo en máquina con apoyo de pecho', 'Espalda', 'Remo horizontal', 'Máquina'),
  ('Remo en T', 'Espalda', 'Remo horizontal', 'Barra'),
  ('Remo invertido', 'Espalda', 'Remo horizontal', 'Peso corporal'),
  ('Pullover en polea alta', 'Espalda', 'Pullover', 'Polea'),
  ('Pullover con mancuerna', 'Espalda', 'Pullover', 'Mancuernas'),
  ('Press militar con barra', 'Hombros', 'Press vertical', 'Barra'),
  ('Press de hombro con mancuernas', 'Hombros', 'Press vertical', 'Mancuernas'),
  ('Press de hombro en máquina', 'Hombros', 'Press vertical', 'Máquina'),
  ('Press Arnold', 'Hombros', 'Press vertical', 'Mancuernas'),
  ('Press de hombro en Smith', 'Hombros', 'Press vertical', 'Smith'),
  ('Elevaciones laterales con mancuernas', 'Hombros', 'Elevaciones laterales', 'Mancuernas'),
  ('Elevaciones laterales en polea', 'Hombros', 'Elevaciones laterales', 'Polea'),
  ('Elevaciones laterales en máquina', 'Hombros', 'Elevaciones laterales', 'Máquina'),
  ('Face pull en polea', 'Hombros', 'Deltoide posterior', 'Polea'),
  ('Pájaros con mancuernas', 'Hombros', 'Deltoide posterior', 'Mancuernas'),
  ('Reverse pec deck', 'Hombros', 'Deltoide posterior', 'Máquina'),
  ('Encogimientos con barra', 'Hombros', 'Trapecio', 'Barra'),
  ('Encogimientos con mancuernas', 'Hombros', 'Trapecio', 'Mancuernas'),
  ('Encogimientos en Smith', 'Hombros', 'Trapecio', 'Smith'),
  ('Curl con barra', 'Bíceps', 'Curl de bíceps', 'Barra'),
  ('Curl con barra Z', 'Bíceps', 'Curl de bíceps', 'Barra Z'),
  ('Curl con mancuernas', 'Bíceps', 'Curl de bíceps', 'Mancuernas'),
  ('Curl martillo', 'Bíceps', 'Curl de bíceps', 'Mancuernas'),
  ('Curl en polea', 'Bíceps', 'Curl de bíceps', 'Polea'),
  ('Curl predicador en máquina', 'Bíceps', 'Curl de bíceps', 'Máquina'),
  ('Curl inclinado con mancuernas', 'Bíceps', 'Curl de bíceps', 'Mancuernas'),
  ('Extensión de tríceps en polea con cuerda', 'Tríceps', 'Extensión de tríceps', 'Polea'),
  ('Extensión de tríceps en polea con barra', 'Tríceps', 'Extensión de tríceps', 'Polea'),
  ('Press francés con barra Z', 'Tríceps', 'Extensión de tríceps', 'Barra Z'),
  ('Extensión sobre la cabeza con mancuerna', 'Tríceps', 'Extensión de tríceps', 'Mancuernas'),
  ('Extensión sobre la cabeza en polea', 'Tríceps', 'Extensión de tríceps', 'Polea'),
  ('Extensión de tríceps en máquina', 'Tríceps', 'Extensión de tríceps', 'Máquina'),
  ('Press de banca agarre cerrado', 'Tríceps', 'Press de tríceps', 'Barra'),
  ('Fondos en banco', 'Tríceps', 'Press de tríceps', 'Peso corporal'),
  ('Fondos de tríceps en máquina', 'Tríceps', 'Press de tríceps', 'Máquina'),
  ('Sentadilla trasera con barra', 'Cuádriceps', 'Sentadilla y prensa', 'Barra'),
  ('Sentadilla frontal con barra', 'Cuádriceps', 'Sentadilla y prensa', 'Barra'),
  ('Sentadilla en Smith', 'Cuádriceps', 'Sentadilla y prensa', 'Smith'),
  ('Sentadilla hack', 'Cuádriceps', 'Sentadilla y prensa', 'Máquina'),
  ('Prensa de piernas', 'Cuádriceps', 'Sentadilla y prensa', 'Máquina'),
  ('Sentadilla goblet', 'Cuádriceps', 'Sentadilla y prensa', 'Mancuernas'),
  ('Sentadilla péndulo', 'Cuádriceps', 'Sentadilla y prensa', 'Máquina'),
  ('Zancadas con mancuernas', 'Cuádriceps', 'Unilateral de pierna', 'Mancuernas'),
  ('Sentadilla búlgara', 'Cuádriceps', 'Unilateral de pierna', 'Mancuernas'),
  ('Step-up al cajón', 'Cuádriceps', 'Unilateral de pierna', 'Mancuernas'),
  ('Zancada en Smith', 'Cuádriceps', 'Unilateral de pierna', 'Smith'),
  ('Zancada inversa con barra', 'Cuádriceps', 'Unilateral de pierna', 'Barra'),
  ('Extensión de cuádriceps en máquina', 'Cuádriceps', 'Extensión de rodilla', 'Máquina'),
  ('Extensión de cuádriceps unilateral', 'Cuádriceps', 'Extensión de rodilla', 'Máquina'),
  ('Sissy squat', 'Cuádriceps', 'Extensión de rodilla', 'Peso corporal'),
  ('Peso muerto rumano con barra', 'Isquiotibiales', 'Bisagra de cadera', 'Barra'),
  ('Peso muerto rumano con mancuernas', 'Isquiotibiales', 'Bisagra de cadera', 'Mancuernas'),
  ('Peso muerto convencional', 'Isquiotibiales', 'Bisagra de cadera', 'Barra'),
  ('Peso muerto con barra hexagonal', 'Isquiotibiales', 'Bisagra de cadera', 'Barra hexagonal'),
  ('Buenos días con barra', 'Isquiotibiales', 'Bisagra de cadera', 'Barra'),
  ('Hiperextensiones a 45°', 'Isquiotibiales', 'Bisagra de cadera', 'Banco'),
  ('Curl femoral tumbado', 'Isquiotibiales', 'Curl femoral', 'Máquina'),
  ('Curl femoral sentado', 'Isquiotibiales', 'Curl femoral', 'Máquina'),
  ('Curl femoral de pie unilateral', 'Isquiotibiales', 'Curl femoral', 'Máquina'),
  ('Curl nórdico', 'Isquiotibiales', 'Curl femoral', 'Peso corporal'),
  ('Curl femoral con fitball', 'Isquiotibiales', 'Curl femoral', 'Fitball'),
  ('Hip thrust con barra', 'Glúteos', 'Empuje de cadera', 'Barra'),
  ('Hip thrust en máquina', 'Glúteos', 'Empuje de cadera', 'Máquina'),
  ('Hip thrust en Smith', 'Glúteos', 'Empuje de cadera', 'Smith'),
  ('Puente de glúteo', 'Glúteos', 'Empuje de cadera', 'Peso corporal'),
  ('Abducción de cadera en máquina', 'Glúteos', 'Abducción y extensión de cadera', 'Máquina'),
  ('Abducción de cadera en polea', 'Glúteos', 'Abducción y extensión de cadera', 'Polea'),
  ('Patada de glúteo en polea', 'Glúteos', 'Abducción y extensión de cadera', 'Polea'),
  ('Patada de glúteo en máquina', 'Glúteos', 'Abducción y extensión de cadera', 'Máquina'),
  ('Abducción con banda elástica', 'Glúteos', 'Abducción y extensión de cadera', 'Banda'),
  ('Elevación de talones de pie en máquina', 'Pantorrillas', 'Elevación de talones', 'Máquina'),
  ('Elevación de talones en prensa', 'Pantorrillas', 'Elevación de talones', 'Máquina'),
  ('Elevación de talones sentado', 'Pantorrillas', 'Elevación de talones', 'Máquina'),
  ('Elevación de talones en Smith', 'Pantorrillas', 'Elevación de talones', 'Smith'),
  ('Elevación de talones unilateral con mancuerna', 'Pantorrillas', 'Elevación de talones', 'Mancuernas'),
  ('Plancha frontal', 'Core', 'Anti-extensión', 'Peso corporal'),
  ('Rueda abdominal', 'Core', 'Anti-extensión', 'Rueda'),
  ('Dead bug', 'Core', 'Anti-extensión', 'Peso corporal'),
  ('Crunch en polea', 'Core', 'Flexión de tronco', 'Polea'),
  ('Elevación de piernas colgado', 'Core', 'Flexión de tronco', 'Peso corporal'),
  ('Crunch en máquina', 'Core', 'Flexión de tronco', 'Máquina'),
  ('Crunch abdominal', 'Core', 'Flexión de tronco', 'Peso corporal'),
  ('Pallof press', 'Core', 'Anti-rotación y rotación', 'Polea'),
  ('Plancha lateral', 'Core', 'Anti-rotación y rotación', 'Peso corporal'),
  ('Leñador en polea', 'Core', 'Anti-rotación y rotación', 'Polea'),
  ('Rotación rusa con disco', 'Core', 'Anti-rotación y rotación', 'Disco'),
  ('Curl de muñeca con mancuerna', 'Antebrazo', 'Muñeca y agarre', 'Mancuernas'),
  ('Extensión de muñeca con mancuerna', 'Antebrazo', 'Muñeca y agarre', 'Mancuernas'),
  ('Pronación-supinación con mancuerna', 'Antebrazo', 'Muñeca y agarre', 'Mancuernas'),
  ('Paseo del granjero', 'Antebrazo', 'Muñeca y agarre', 'Mancuernas'),
  ('Lanzamiento lateral con balón medicinal', 'Potencia', 'Lanzamientos con balón medicinal', 'Balón medicinal'),
  ('Lanzamiento sobre la cabeza con balón medicinal', 'Potencia', 'Lanzamientos con balón medicinal', 'Balón medicinal'),
  ('Lanzamiento de pecho con balón medicinal', 'Potencia', 'Lanzamientos con balón medicinal', 'Balón medicinal'),
  ('Slam con balón medicinal', 'Potencia', 'Lanzamientos con balón medicinal', 'Balón medicinal'),
  ('Salto al cajón', 'Potencia', 'Saltos', 'Cajón'),
  ('Salto vertical con contramovimiento', 'Potencia', 'Saltos', 'Peso corporal'),
  ('Salto lateral sobre valla', 'Potencia', 'Saltos', 'Vallas'),
  ('Saltos laterales patinador', 'Potencia', 'Saltos', 'Peso corporal'),
  ('Kettlebell swing', 'Potencia', 'Extensión explosiva de cadera', 'Kettlebell'),
  ('Cargada de potencia con barra', 'Potencia', 'Extensión explosiva de cadera', 'Barra'),
  ('Salto con barra hexagonal', 'Potencia', 'Extensión explosiva de cadera', 'Barra hexagonal'),
  ('Rotación externa en polea', 'Manguito rotador', 'Rotación de hombro', 'Polea'),
  ('Rotación interna en polea', 'Manguito rotador', 'Rotación de hombro', 'Polea'),
  ('Rotación externa con banda', 'Manguito rotador', 'Rotación de hombro', 'Banda'),
  ('Rotación externa tumbado con mancuerna', 'Manguito rotador', 'Rotación de hombro', 'Mancuernas'),
  ('Y-T-W en banco inclinado', 'Manguito rotador', 'Estabilidad escapular', 'Mancuernas'),
  ('Remo con banda y rotación externa', 'Manguito rotador', 'Estabilidad escapular', 'Banda'),
  ('Serrato en polea', 'Manguito rotador', 'Estabilidad escapular', 'Polea'),
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

insert into public.foods (name, category, kcal, protein, carbs, fat, fiber, unit_name, unit_grams) values
  ('Pechuga de pollo cocida', 'Proteínas', 165, 31, 0, 3.6, 0, 'filete', 120),
  ('Muslo de pollo sin piel cocido', 'Proteínas', 209, 26, 0, 10.9, 0, 'unidad', 90),
  ('Carne de res magra cocida', 'Proteínas', 190, 30, 0, 7.5, 0, 'porción', 120),
  ('Carne molida de res magra cocida', 'Proteínas', 217, 26, 0, 11.8, 0, 'porción', 100),
  ('Lomo de cerdo cocido', 'Proteínas', 145, 26, 0, 4, 0, 'porción', 120),
  ('Tilapia cocida', 'Proteínas', 128, 26, 0, 2.7, 0, 'filete', 150),
  ('Salmón cocido', 'Proteínas', 206, 22, 0, 12.4, 0, 'filete', 150),
  ('Atún en agua escurrido', 'Proteínas', 116, 25.5, 0, 0.8, 0, 'lata', 120),
  ('Sardinas en aceite escurridas', 'Proteínas', 208, 24.6, 0, 11.5, 0, 'lata', 90),
  ('Camarón cocido', 'Proteínas', 99, 24, 0.2, 0.3, 0, 'porción', 100),
  ('Huevo entero', 'Proteínas', 143, 12.6, 0.7, 9.5, 0, 'unidad', 50),
  ('Clara de huevo', 'Proteínas', 52, 10.9, 0.7, 0.2, 0, 'unidad', 33),
  ('Jamón de pollo', 'Proteínas', 110, 16, 3, 3.5, 0, 'tajada', 20),
  ('Hígado de res cocido', 'Proteínas', 175, 27, 5, 4.7, 0, 'porción', 100),
  ('Leche entera', 'Lácteos', 61, 3.2, 4.8, 3.3, 0, 'vaso', 240),
  ('Leche descremada', 'Lácteos', 34, 3.4, 5, 0.1, 0, 'vaso', 240),
  ('Leche deslactosada semidescremada', 'Lácteos', 46, 3.2, 4.8, 1.5, 0, 'vaso', 240),
  ('Yogur griego natural sin azúcar', 'Lácteos', 59, 10.2, 3.6, 0.4, 0, 'pote', 150),
  ('Yogur natural entero', 'Lácteos', 61, 3.5, 4.7, 3.3, 0, 'vaso', 200),
  ('Kumis', 'Lácteos', 85, 3, 12, 2.8, 0, 'vaso', 200),
  ('Queso campesino', 'Lácteos', 260, 18, 3, 19.5, 0, 'tajada', 30),
  ('Queso costeño', 'Lácteos', 305, 21, 2, 24, 0, 'tajada', 30),
  ('Queso mozzarella', 'Lácteos', 300, 22, 2.2, 22, 0, 'tajada', 25),
  ('Cuajada', 'Lácteos', 155, 12, 3, 10.5, 0, 'porción', 60),
  ('Queso cottage', 'Lácteos', 98, 11, 3.4, 4.3, 0, 'cucharada', 30),
  ('Arroz blanco cocido', 'Cereales y tubérculos', 130, 2.7, 28, 0.3, 0.4, 'taza', 160),
  ('Arroz integral cocido', 'Cereales y tubérculos', 123, 2.7, 25.6, 1, 1.6, 'taza', 160),
  ('Arepa de maíz', 'Cereales y tubérculos', 190, 4.2, 40, 1.5, 2, 'unidad mediana', 80),
  ('Papa cocida', 'Cereales y tubérculos', 87, 1.9, 20, 0.1, 1.8, 'unidad mediana', 150),
  ('Papa criolla cocida', 'Cereales y tubérculos', 95, 2, 21, 0.2, 1.6, 'unidad', 25),
  ('Yuca cocida', 'Cereales y tubérculos', 125, 1, 30, 0.3, 1.8, 'trozo', 100),
  ('Plátano maduro cocido', 'Cereales y tubérculos', 116, 0.8, 31, 0.2, 2.3, 'unidad', 200),
  ('Plátano verde cocido', 'Cereales y tubérculos', 120, 1, 32, 0.2, 2.3, 'unidad', 200),
  ('Batata cocida', 'Cereales y tubérculos', 90, 2, 20.7, 0.2, 3.3, 'unidad', 150),
  ('Mazorca cocida', 'Cereales y tubérculos', 96, 3.4, 21, 1.5, 2.4, 'unidad', 150),
  ('Avena en hojuelas', 'Cereales y tubérculos', 379, 13, 68, 6.5, 10, 'cucharada', 10),
  ('Pan tajado integral', 'Cereales y tubérculos', 250, 12, 43, 3.5, 6, 'tajada', 25),
  ('Pan blanco', 'Cereales y tubérculos', 265, 9, 49, 3.2, 2.7, 'tajada', 25),
  ('Pasta cocida', 'Cereales y tubérculos', 158, 5.8, 31, 0.9, 1.8, 'taza', 140),
  ('Quinua cocida', 'Cereales y tubérculos', 120, 4.4, 21.3, 1.9, 2.8, 'taza', 185),
  ('Tortilla de trigo', 'Cereales y tubérculos', 306, 8, 50, 8, 3.5, 'unidad', 45),
  ('Galletas de arroz', 'Cereales y tubérculos', 387, 8, 81, 2.8, 4.2, 'unidad', 9),
  ('Cereal de maíz', 'Cereales y tubérculos', 357, 7.5, 84, 0.4, 3.3, 'taza', 30),
  ('Fríjol rojo cocido', 'Leguminosas', 127, 8.7, 22.8, 0.5, 6.4, 'taza', 170),
  ('Lenteja cocida', 'Leguminosas', 116, 9, 20, 0.4, 7.9, 'taza', 200),
  ('Garbanzo cocido', 'Leguminosas', 164, 8.9, 27.4, 2.6, 7.6, 'taza', 160),
  ('Arveja verde cocida', 'Leguminosas', 84, 5.4, 15.6, 0.2, 5.5, 'taza', 160),
  ('Banano', 'Frutas', 89, 1.1, 22.8, 0.3, 2.6, 'unidad mediana', 118),
  ('Manzana', 'Frutas', 52, 0.3, 13.8, 0.2, 2.4, 'unidad', 180),
  ('Papaya', 'Frutas', 43, 0.5, 10.8, 0.3, 1.7, 'taza', 145),
  ('Mango', 'Frutas', 60, 0.8, 15, 0.4, 1.6, 'taza', 165),
  ('Piña', 'Frutas', 50, 0.5, 13.1, 0.1, 1.4, 'taza', 165),
  ('Fresa', 'Frutas', 32, 0.7, 7.7, 0.3, 2, 'taza', 150),
  ('Guayaba', 'Frutas', 68, 2.6, 14.3, 1, 5.4, 'unidad', 55),
  ('Mora', 'Frutas', 43, 1.4, 9.6, 0.5, 5.3, 'taza', 145),
  ('Naranja', 'Frutas', 47, 0.9, 11.8, 0.1, 2.4, 'unidad', 130),
  ('Mandarina', 'Frutas', 53, 0.8, 13.3, 0.3, 1.8, 'unidad', 90),
  ('Uva', 'Frutas', 69, 0.7, 18.1, 0.2, 0.9, 'taza', 150),
  ('Pera', 'Frutas', 57, 0.4, 15.2, 0.1, 3.1, 'unidad', 180),
  ('Sandía', 'Frutas', 30, 0.6, 7.6, 0.2, 0.4, 'taza', 150),
  ('Melón', 'Frutas', 34, 0.8, 8.2, 0.2, 0.9, 'taza', 160),
  ('Maracuyá (pulpa)', 'Frutas', 97, 2.2, 23.4, 0.7, 10.4, 'unidad', 18),
  ('Uchuva', 'Frutas', 53, 1.9, 11.2, 0.7, 0, 'taza', 140),
  ('Kiwi', 'Frutas', 61, 1.1, 14.7, 0.5, 3, 'unidad', 70),
  ('Arándanos', 'Frutas', 57, 0.7, 14.5, 0.3, 2.4, 'taza', 148),
  ('Brócoli cocido', 'Verduras', 35, 2.4, 7.2, 0.4, 3.3, 'taza', 155),
  ('Espinaca', 'Verduras', 23, 2.9, 3.6, 0.4, 2.2, 'taza', 30),
  ('Tomate', 'Verduras', 18, 0.9, 3.9, 0.2, 1.2, 'unidad', 120),
  ('Zanahoria', 'Verduras', 41, 0.9, 9.6, 0.2, 2.8, 'unidad', 60),
  ('Lechuga', 'Verduras', 15, 1.4, 2.9, 0.2, 1.3, 'taza', 50),
  ('Pepino', 'Verduras', 15, 0.7, 3.6, 0.1, 0.5, 'unidad', 200),
  ('Cebolla cabezona', 'Verduras', 40, 1.1, 9.3, 0.1, 1.7, 'unidad', 110),
  ('Pimentón', 'Verduras', 31, 1, 6, 0.3, 2.1, 'unidad', 120),
  ('Ahuyama cocida', 'Verduras', 20, 0.7, 4.9, 0.1, 1.1, 'taza', 245),
  ('Habichuela cocida', 'Verduras', 35, 1.9, 7.9, 0.3, 3.2, 'taza', 125),
  ('Champiñones', 'Verduras', 22, 3.1, 3.3, 0.3, 1, 'taza', 70),
  ('Calabacín', 'Verduras', 17, 1.2, 3.1, 0.3, 1, 'unidad', 200),
  ('Coliflor cocida', 'Verduras', 23, 1.8, 4.1, 0.5, 2.3, 'taza', 125),
  ('Remolacha cocida', 'Verduras', 44, 1.7, 10, 0.2, 2, 'unidad', 80),
  ('Ensalada verde mixta', 'Verduras', 18, 1.2, 3.5, 0.2, 1.5, 'taza', 60),
  ('Aguacate', 'Grasas', 160, 2, 8.5, 14.7, 6.7, 'tajada', 30),
  ('Aceite de oliva', 'Grasas', 884, 0, 0, 100, 0, 'cucharada', 13),
  ('Aceite vegetal', 'Grasas', 884, 0, 0, 100, 0, 'cucharada', 13),
  ('Mantequilla', 'Grasas', 717, 0.9, 0.1, 81, 0, 'cucharadita', 5),
  ('Maní', 'Grasas', 567, 25.8, 16.1, 49.2, 8.5, 'puñado', 28),
  ('Almendras', 'Grasas', 579, 21.2, 21.6, 49.9, 12.5, 'unidad', 1.2),
  ('Nueces', 'Grasas', 654, 15.2, 13.7, 65.2, 6.7, 'unidad', 4),
  ('Mantequilla de maní', 'Grasas', 588, 25, 20, 50, 6, 'cucharada', 16),
  ('Semillas de chía', 'Grasas', 486, 16.5, 42.1, 30.7, 34.4, 'cucharada', 12),
  ('Proteína whey (polvo)', 'Suplementos', 390, 78, 8, 5, 0, 'scoop', 30),
  ('Creatina monohidratada', 'Suplementos', 0, 0, 0, 0, 0, 'cucharadita', 5),
  ('Jugo de naranja natural', 'Bebidas', 45, 0.7, 10.4, 0.2, 0.2, 'vaso', 240),
  ('Bebida hidratante deportiva', 'Bebidas', 24, 0, 6, 0, 0, 'botella', 500),
  ('Café negro', 'Bebidas', 2, 0.3, 0, 0, 0, 'pocillo', 150),
  ('Panela', 'Dulces y otros', 375, 0.4, 94, 0.1, 0, 'cucharada', 15),
  ('Miel de abejas', 'Dulces y otros', 304, 0.3, 82.4, 0, 0.2, 'cucharada', 21),
  ('Azúcar', 'Dulces y otros', 387, 0, 100, 0, 0, 'cucharadita', 5),
  ('Chocolate amargo 70%', 'Dulces y otros', 598, 7.8, 45.9, 42.6, 10.9, 'onza', 10),
  ('Bocadillo de guayaba', 'Dulces y otros', 290, 0.5, 72, 0.1, 2, 'unidad', 30)
on conflict (name) do nothing;


-- =====================================================================
--  Incluye las migraciones v3, v4, v5 y v6
-- =====================================================================
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

-- =====================================================================
--  Deuce Point · Migración v4
--  Fórmulas de valoración (Katch-McArdle / Cunningham / Mifflin-St Jeor),
--  ciclado de carbohidratos, fases de entrenamiento, movilidad y cardio Zona 2.
--  Ejecutar UNA vez en: Supabase > SQL Editor > New query > Run
--  Requiere haber ejecutado antes migracion-v3.sql. Se puede ejecutar de nuevo sin errores.
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
--  Deuce Point · Migración v5
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

-- =====================================================================
--  Deuce Point · Migración v6
-- =====================================================================

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


-- #####################################################################
--  Parte C · v7 · Tipos de día, importación del plan individual y expediente
-- #####################################################################

-- ---------- Tipos de día: cada tipo es un plan hijo (variant_of) con metas y menú propios ----------
alter table public.nutrition_plans add column if not exists variant_of uuid references public.nutrition_plans(id) on delete cascade;
alter table public.nutrition_plans add column if not exists day_code text;
alter table public.nutrition_plans add column if not exists day_name text;
alter table public.nutrition_plans add column if not exists day_notes text;
alter table public.nutrition_plans add column if not exists weekdays jsonb not null default '[]'::jsonb;
alter table public.nutrition_plans add column if not exists day_overrides jsonb not null default '{}'::jsonb;
create index if not exists nutrition_plans_variant_idx on public.nutrition_plans (variant_of);
-- Opciones asignadas a días de la semana (rotaciones)
alter table public.plan_options add column if not exists weekdays jsonb not null default '[]'::jsonb;

-- ---------- Expediente del asesorado (resultado del análisis individual) ----------
create table if not exists public.case_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Plan integral',
  report_date date not null default current_date,
  summary text,
  data jsonb not null default '{}'::jsonb,
  pending jsonb not null default '[]'::jsonb,
  plan_id uuid references public.nutrition_plans(id) on delete set null,
  visible boolean not null default true,
  doc_path text, doc_type text check (doc_type is null or doc_type in ('pdf', 'html')), doc_name text,
  created_by uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now());
create index if not exists case_reports_client_idx on public.case_reports (client_id, created_at desc);
alter table public.case_reports enable row level security;
drop policy if exists "expediente_leer" on public.case_reports;
create policy "expediente_leer" on public.case_reports for select to authenticated
  using (public.is_staff() or (client_id = auth.uid() and visible));
drop policy if exists "expediente_gestionar" on public.case_reports;
create policy "expediente_gestionar" on public.case_reports for all to authenticated
  using (public.is_coach()) with check (public.is_coach());

-- Respuestas del asesorado a las preguntas pendientes
create table if not exists public.case_answers (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.case_reports(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  answers jsonb not null default '[]'::jsonb,
  seen boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (report_id));
create index if not exists case_answers_seen_idx on public.case_answers (seen) where not seen;
alter table public.case_answers enable row level security;
drop policy if exists "respuestas_leer" on public.case_answers;
create policy "respuestas_leer" on public.case_answers for select to authenticated
  using (client_id = auth.uid() or public.is_staff());
drop policy if exists "respuestas_crear" on public.case_answers;
create policy "respuestas_crear" on public.case_answers for insert to authenticated
  with check (client_id = auth.uid() and exists (select 1 from public.case_reports r where r.id = report_id and r.client_id = auth.uid() and r.visible));
drop policy if exists "respuestas_editar" on public.case_answers;
create policy "respuestas_editar" on public.case_answers for update to authenticated
  using (client_id = auth.uid() or public.is_staff())
  with check ((client_id = auth.uid() and exists (select 1 from public.case_reports r where r.id = report_id and r.client_id = auth.uid() and r.visible)) or public.is_staff());
drop policy if exists "respuestas_borrar" on public.case_answers;
create policy "respuestas_borrar" on public.case_answers for delete to authenticated using (public.is_coach());

-- ---------- Documentos privados del expediente (PDF o HTML) ----------
-- Ruta: <id del asesorado>/<id del expediente>.pdf|.html. El asesorado solo lee el documento de un expediente visible.
insert into storage.buckets (id, name, public) values ('documents', 'documents', false)
on conflict (id) do nothing;
drop policy if exists "documentos_leer" on storage.objects;
create policy "documentos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (public.is_staff() or exists (select 1 from public.case_reports r where r.doc_path = storage.objects.name and r.client_id = auth.uid() and r.visible)));
drop policy if exists "documentos_gestionar" on storage.objects;
create policy "documentos_gestionar" on storage.objects for all to authenticated
  using (bucket_id = 'documents' and public.is_coach()) with check (bucket_id = 'documents' and public.is_coach());

-- ---------- Versión del esquema ----------
update public.app_settings
set data = data || '{"schema_version": 7}'::jsonb, updated_at = now()
where id = 1;

-- #####################################################################
--  Parte D · v9 · Registro rápido, seguimiento, cuestionarios, videos y acudientes
-- #####################################################################

-- ---------- Comidas guardadas por el asesorado ----------
create table if not exists public.saved_meals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 80),
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now());
create index if not exists saved_meals_client_idx on public.saved_meals (client_id);
alter table public.saved_meals enable row level security;
drop policy if exists "comidas_guardadas_propias" on public.saved_meals;
create policy "comidas_guardadas_propias" on public.saved_meals for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "comidas_guardadas_staff" on public.saved_meals;
create policy "comidas_guardadas_staff" on public.saved_meals for select to authenticated using (public.is_staff());

-- ---------- Notas privadas del entrenador (el asesorado no las ve) ----------
create table if not exists public.coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  author_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now());
create index if not exists coach_notes_client_idx on public.coach_notes (client_id, created_at desc);
alter table public.coach_notes enable row level security;
drop policy if exists "notas_staff" on public.coach_notes;
create policy "notas_staff" on public.coach_notes for select to authenticated using (public.is_staff());
drop policy if exists "notas_crear" on public.coach_notes;
create policy "notas_crear" on public.coach_notes for insert to authenticated with check (public.is_staff());
drop policy if exists "notas_borrar" on public.coach_notes;
create policy "notas_borrar" on public.coach_notes for delete to authenticated using (public.is_coach());

-- ---------- Cuestionarios enviados al asesorado ----------
create table if not exists public.questionnaires (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  template jsonb not null,
  answers jsonb not null default '{}'::jsonb,
  score numeric, result text,
  status text not null default 'pendiente' check (status in ('pendiente', 'respondido')),
  created_at timestamptz not null default now(), answered_at timestamptz);
create index if not exists questionnaires_client_idx on public.questionnaires (client_id, created_at desc);
alter table public.questionnaires enable row level security;
drop policy if exists "cuestionarios_leer" on public.questionnaires;
create policy "cuestionarios_leer" on public.questionnaires for select to authenticated using (client_id = auth.uid() or public.is_staff());
drop policy if exists "cuestionarios_crear" on public.questionnaires;
create policy "cuestionarios_crear" on public.questionnaires for insert to authenticated with check (public.is_coach());
drop policy if exists "cuestionarios_responder" on public.questionnaires;
create policy "cuestionarios_responder" on public.questionnaires for update to authenticated
  using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach());
drop policy if exists "cuestionarios_borrar" on public.questionnaires;
create policy "cuestionarios_borrar" on public.questionnaires for delete to authenticated using (public.is_coach());

-- ---------- Videos de técnica del asesorado (archivo privado) ----------
create table if not exists public.technique_videos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  exercise_id uuid references public.exercises(id) on delete set null,
  path text not null, note text, coach_reply text, replied_at timestamptz,
  created_at timestamptz not null default now());
create index if not exists technique_videos_client_idx on public.technique_videos (client_id, created_at desc);
alter table public.technique_videos enable row level security;
drop policy if exists "videos_tecnica_leer" on public.technique_videos;
create policy "videos_tecnica_leer" on public.technique_videos for select to authenticated using (client_id = auth.uid() or public.is_staff());
drop policy if exists "videos_tecnica_crear" on public.technique_videos;
create policy "videos_tecnica_crear" on public.technique_videos for insert to authenticated with check (client_id = auth.uid());
drop policy if exists "videos_tecnica_editar" on public.technique_videos;
create policy "videos_tecnica_editar" on public.technique_videos for update to authenticated
  using (client_id = auth.uid() or public.is_staff()) with check (client_id = auth.uid() or public.is_staff());
drop policy if exists "videos_tecnica_borrar" on public.technique_videos;
create policy "videos_tecnica_borrar" on public.technique_videos for delete to authenticated using (client_id = auth.uid() or public.is_coach());
insert into storage.buckets (id, name, public) values ('client-videos', 'client-videos', false)
on conflict (id) do nothing;
drop policy if exists "videos_archivos_leer" on storage.objects;
create policy "videos_archivos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'client-videos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_staff()));
drop policy if exists "videos_archivos_subir" on storage.objects;
create policy "videos_archivos_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-videos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "videos_archivos_borrar" on storage.objects;
create policy "videos_archivos_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'client-videos' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));

-- ---------- Datos del seguimiento que define el entrenador (próximo control) ----------
create table if not exists public.client_meta (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  next_review date, review_note text,
  updated_at timestamptz not null default now());
alter table public.client_meta enable row level security;
drop policy if exists "meta_leer" on public.client_meta;
create policy "meta_leer" on public.client_meta for select to authenticated using (client_id = auth.uid() or public.is_staff());
drop policy if exists "meta_gestionar" on public.client_meta;
create policy "meta_gestionar" on public.client_meta for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- ---------- Preferencias y autorizaciones del asesorado ----------
create table if not exists public.client_prefs (
  client_id uuid primary key references public.profiles(id) on delete cascade,
  share_results boolean not null default false,
  hide_face boolean not null default true,
  updated_at timestamptz not null default now());
alter table public.client_prefs enable row level security;
drop policy if exists "prefs_propias" on public.client_prefs;
create policy "prefs_propias" on public.client_prefs for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "prefs_staff" on public.client_prefs;
create policy "prefs_staff" on public.client_prefs for select to authenticated using (public.is_staff());

-- ---------- Acceso de solo lectura para acudientes (enlace revocable) ----------
create table if not exists public.guardian_links (
  token text primary key default encode(gen_random_bytes(18), 'hex'),
  client_id uuid not null references public.profiles(id) on delete cascade,
  label text, revoked boolean not null default false,
  created_at timestamptz not null default now());
alter table public.guardian_links enable row level security;
drop policy if exists "acudientes_propios" on public.guardian_links;
create policy "acudientes_propios" on public.guardian_links for all to authenticated
  using (client_id = auth.uid()) with check (client_id = auth.uid());
drop policy if exists "acudientes_staff" on public.guardian_links;
create policy "acudientes_staff" on public.guardian_links for select to authenticated using (public.is_staff());

-- Resumen para el acudiente: solo datos generales, sin fotos, valoración ni mensajes
create or replace function public.guardian_view(t text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare cid uuid; r jsonb;
begin
  select client_id into cid from public.guardian_links where token = t and not revoked;
  if cid is null then return null; end if;
  select jsonb_build_object(
    'nombre', (select split_part(coalesce(full_name, ''), ' ', 1) from public.profiles where id = cid),
    'objetivo', (select goal from public.profiles where id = cid),
    'plan', (select jsonb_build_object('nombre', p.name, 'tipos', (
        select coalesce(jsonb_agg(jsonb_build_object('codigo', v.day_code, 'nombre', v.day_name, 'dias', v.weekdays, 'kcal', v.kcal, 'proteina', v.protein_g, 'carbohidratos', v.carbs_g, 'grasa', v.fat_g, 'agua', v.water_ml) order by v.day_code), '[]'::jsonb)
        from public.nutrition_plans v where v.id = p.id or v.variant_of = p.id))
      from public.nutrition_plans p where p.client_id = cid and p.active and p.variant_of is null order by p.created_at desc limit 1),
    'dias', (select coalesce(jsonb_agg(jsonb_build_object('fecha', d::date,
        'alimentos', (select count(*) from public.food_logs f where f.client_id = cid and f.log_date = d::date),
        'agua', (select water_ml from public.daily_logs x where x.client_id = cid and x.log_date = d::date),
        'pasos', (select steps from public.daily_logs x where x.client_id = cid and x.log_date = d::date),
        'habitos', (select (select count(*) from jsonb_object_keys(coalesce(x.choices -> '__h', '{}'::jsonb))) from public.daily_logs x where x.client_id = cid and x.log_date = d::date),
        'entreno', (select count(*) from public.workouts w where w.client_id = cid and w.started_at::date = d::date)) order by d), '[]'::jsonb)
      from generate_series(current_date - 13, current_date, interval '1 day') d),
    'habitos', (select r2.data -> 'habits' from public.case_reports r2 where r2.client_id = cid and r2.visible and jsonb_array_length(coalesce(r2.data -> 'habits', '[]'::jsonb)) > 0 order by r2.created_at desc limit 1),
    'proximo_control', (select next_review from public.client_meta where client_id = cid),
    'competencias', (select coalesce(jsonb_agg(jsonb_build_object('nombre', name, 'fecha', start_date) order by start_date), '[]'::jsonb) from public.tournaments where client_id = cid and coalesce(end_date, start_date) >= current_date)
  ) into r;
  return r;
end $$;
revoke all on function public.guardian_view(text) from public;
grant execute on function public.guardian_view(text) to anon, authenticated;

-- ---------- Versión del esquema ----------
update public.app_settings
set data = data || '{"schema_version": 9}'::jsonb, updated_at = now()
where id = 1;

-- Último paso (después de registrarte en la app con tu correo):
-- update public.profiles set role = 'coach' where email = 'TU_CORREO@ejemplo.com';


-- #####################################################################
--  Parte E · v10 · Alimentación, entrenamiento, seguimiento y negocio
-- #####################################################################

-- #####################################################################
--  Alimentación
-- #####################################################################
-- Precio por kg en cada supermercado ({"D1": 12000, "Éxito": 14500}), sodio y azúcar por 100 g
alter table public.foods add column if not exists prices jsonb not null default '{}'::jsonb;
alter table public.foods add column if not exists sodium_mg numeric;
alter table public.foods add column if not exists sugar_g numeric;
-- Video de la receta de cada opción del menú
alter table public.plan_options add column if not exists video_url text;
-- Carga de carbohidratos en las 48 h previas a una competencia
alter table public.tournaments add column if not exists carb_load boolean not null default false;

-- #####################################################################
--  Entrenamiento
-- #####################################################################
-- Bloques de periodización con fechas y rutina asociada
create table if not exists public.training_blocks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null, focus text, start_date date not null, end_date date not null,
  routine_id uuid references public.routines(id) on delete set null,
  notes text, activated_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date));
create index if not exists training_blocks_client_idx on public.training_blocks (client_id, start_date);
-- Variabilidad de la frecuencia cardiaca, frecuencia en reposo y horas de sueño
alter table public.wellness add column if not exists hrv_ms numeric;
alter table public.wellness add column if not exists rhr smallint;
alter table public.wellness add column if not exists sleep_h numeric;
-- Golpes y saques por sesión de tenis
alter table public.tennis_sessions add column if not exists serves int;
alter table public.tennis_sessions add column if not exists strokes int;
-- Video propio del ejercicio (archivo privado para usuarios de la app)
alter table public.exercises add column if not exists video_path text;

-- #####################################################################
--  Experiencia del asesorado
-- #####################################################################
-- Foto o audio en los mensajes
alter table public.messages add column if not exists media_path text;
alter table public.messages add column if not exists media_type text;
alter table public.messages drop constraint if exists messages_media_type_check;
alter table public.messages add constraint messages_media_type_check check (media_type is null or media_type in ('foto', 'audio'));
-- Metas semanales que propone el asesorado
create table if not exists public.weekly_goals (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null, body text not null check (length(body) between 3 and 300),
  status text not null default 'propuesta' check (status in ('propuesta', 'aprobada', 'ajustada', 'rechazada')),
  coach_note text, done boolean,
  created_at timestamptz not null default now(), reviewed_at timestamptz);
create index if not exists weekly_goals_client_idx on public.weekly_goals (client_id, week_start desc);

-- #####################################################################
--  Seguimiento y análisis
-- #####################################################################
create table if not exists public.lab_results (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  test_date date not null, marker text not null, value numeric not null, unit text,
  ref_low numeric, ref_high numeric, notes text,
  created_at timestamptz not null default now());
create index if not exists lab_results_client_idx on public.lab_results (client_id, marker, test_date);
create table if not exists public.bia_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  measure_date date not null, device text,
  weight_kg numeric, fat_pct numeric, muscle_kg numeric, water_pct numeric, visceral numeric, bmr numeric,
  conditions jsonb not null default '{}'::jsonb, notes text,
  created_at timestamptz not null default now());
create index if not exists bia_logs_client_idx on public.bia_logs (client_id, measure_date);
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  starts_at timestamptz not null, minutes int not null default 30 check (minutes between 10 and 240),
  kind text not null default 'Control', notes text,
  status text not null default 'solicitada' check (status in ('solicitada', 'confirmada', 'cancelada', 'realizada')),
  created_at timestamptz not null default now());
create index if not exists appointments_time_idx on public.appointments (starts_at);
alter table public.client_meta add column if not exists report_type text;
alter table public.client_meta add column if not exists assigned_to uuid references public.profiles(id) on delete set null;

-- #####################################################################
--  Negocio
-- #####################################################################
create table if not exists public.payment_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  amount numeric not null check (amount > 0), method text, reference text, proof_path text, coupon text,
  status text not null default 'pendiente' check (status in ('pendiente', 'confirmado', 'rechazado')),
  payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(), reviewed_at timestamptz);
alter table public.payments add column if not exists coupon text;
alter table public.payments add column if not exists receipt_no int;
alter table public.challenges add column if not exists price numeric;
alter table public.challenges add column if not exists pay_link text;
alter table public.challenge_members add column if not exists paid boolean not null default false;
alter table public.surveys add column if not exists published boolean not null default false;
create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  doc_kind text not null default 'contrato', doc_version text not null, doc_text text not null,
  signed_name text not null, signature_png text, user_agent text,
  signed_at timestamptz not null default now(),
  unique (client_id, doc_kind, doc_version));

-- #####################################################################
--  Asistentes con asesorados asignados
-- #####################################################################
-- El entrenador ve todo. Un asistente sin asignaciones ve a todos (como en la v9);
-- si tiene asesorados asignados en client_meta.assigned_to, solo ve a esos.
create or replace function public.staff_sees(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and (
    p.role = 'coach' or (p.role = 'assistant' and (
      not exists (select 1 from public.client_meta m where m.assigned_to = auth.uid())
      or exists (select 1 from public.client_meta m where m.client_id = cid and m.assigned_to = auth.uid())))));
$$;
create or replace function public.staff_sees_path(folder text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when folder ~ '^[0-9a-fA-F-]{36}$' then public.staff_sees(folder::uuid) else public.is_coach() end;
$$;
grant execute on function public.staff_sees(uuid) to authenticated;
grant execute on function public.staff_sees_path(text) to authenticated;

-- ---------- Tablas nuevas: seguridad ----------
alter table public.training_blocks enable row level security;
alter table public.weekly_goals enable row level security;
alter table public.lab_results enable row level security;
alter table public.bia_logs enable row level security;
alter table public.appointments enable row level security;
alter table public.payment_reports enable row level security;
alter table public.signatures enable row level security;

-- Bloques: el entrenador los gestiona; el asesorado y el asistente los leen
drop policy if exists "bloques_leer" on public.training_blocks;
create policy "bloques_leer" on public.training_blocks for select to authenticated using (client_id = auth.uid() or public.staff_sees(client_id));
drop policy if exists "bloques_gestionar" on public.training_blocks;
create policy "bloques_gestionar" on public.training_blocks for all to authenticated using (public.is_coach()) with check (public.is_coach());

-- Metas semanales: el asesorado propone y marca cumplida; el equipo revisa
drop policy if exists "metas_leer" on public.weekly_goals;
create policy "metas_leer" on public.weekly_goals for select to authenticated using (client_id = auth.uid() or public.staff_sees(client_id));
drop policy if exists "metas_proponer" on public.weekly_goals;
create policy "metas_proponer" on public.weekly_goals for insert to authenticated with check (client_id = auth.uid() and status = 'propuesta');
drop policy if exists "metas_editar" on public.weekly_goals;
create policy "metas_editar" on public.weekly_goals for update to authenticated
  using (client_id = auth.uid() or public.staff_sees(client_id)) with check (client_id = auth.uid() or public.staff_sees(client_id));
drop policy if exists "metas_borrar" on public.weekly_goals;
create policy "metas_borrar" on public.weekly_goals for delete to authenticated using ((client_id = auth.uid() and status = 'propuesta') or public.is_coach());
-- El asesorado no puede aprobar su propia meta
create or replace function public.weekly_goal_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.client_id = auth.uid() and not public.is_staff() then
    if (new.status is distinct from old.status) or (new.coach_note is distinct from old.coach_note) or (new.body is distinct from old.body and old.status <> 'propuesta') then
      raise exception 'Solo el entrenador revisa las metas';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists weekly_goal_guard on public.weekly_goals;
create trigger weekly_goal_guard before update on public.weekly_goals for each row execute function public.weekly_goal_guard();

-- Laboratorios y bioimpedancia: el asesorado y el equipo registran; el asesorado borra lo suyo
do $$
declare t text;
begin
  foreach t in array array['lab_results', 'bia_logs'] loop
    execute format('drop policy if exists %I on public.%I', t || '_leer', t);
    execute format('create policy %I on public.%I for select to authenticated using (client_id = auth.uid() or public.staff_sees(client_id))', t || '_leer', t);
    execute format('drop policy if exists %I on public.%I', t || '_crear', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (client_id = auth.uid() or public.staff_sees(client_id))', t || '_crear', t);
    execute format('drop policy if exists %I on public.%I', t || '_editar', t);
    execute format('create policy %I on public.%I for update to authenticated using (client_id = auth.uid() or public.is_coach()) with check (client_id = auth.uid() or public.is_coach())', t || '_editar', t);
    execute format('drop policy if exists %I on public.%I', t || '_borrar', t);
    execute format('create policy %I on public.%I for delete to authenticated using (client_id = auth.uid() or public.is_coach())', t || '_borrar', t);
  end loop;
end $$;

-- Citas: el asesorado solicita y cancela las suyas; el equipo gestiona
drop policy if exists "citas_leer" on public.appointments;
create policy "citas_leer" on public.appointments for select to authenticated using (client_id = auth.uid() or public.staff_sees(client_id));
drop policy if exists "citas_solicitar" on public.appointments;
create policy "citas_solicitar" on public.appointments for insert to authenticated
  with check ((client_id = auth.uid() and status = 'solicitada') or public.staff_sees(client_id));
drop policy if exists "citas_editar" on public.appointments;
create policy "citas_editar" on public.appointments for update to authenticated
  using (client_id = auth.uid() or public.staff_sees(client_id))
  with check ((client_id = auth.uid() and status in ('solicitada', 'cancelada')) or public.staff_sees(client_id));
drop policy if exists "citas_borrar" on public.appointments;
create policy "citas_borrar" on public.appointments for delete to authenticated using (public.is_coach());
-- Horarios ocupados (sin datos de otros asesorados) para pedir una cita
create or replace function public.busy_slots(p_from timestamptz, p_to timestamptz) returns table (starts_at timestamptz, minutes int)
language sql stable security definer set search_path = public as $$
  select a.starts_at, a.minutes from public.appointments a
  where a.status in ('solicitada', 'confirmada') and a.starts_at >= p_from and a.starts_at < p_to and auth.uid() is not null;
$$;
revoke all on function public.busy_slots(timestamptz, timestamptz) from public, anon;
grant execute on function public.busy_slots(timestamptz, timestamptz) to authenticated;

-- Pagos reportados por el asesorado (el entrenador confirma)
drop policy if exists "pagos_rep_leer" on public.payment_reports;
create policy "pagos_rep_leer" on public.payment_reports for select to authenticated using (client_id = auth.uid() or public.is_coach());
drop policy if exists "pagos_rep_crear" on public.payment_reports;
create policy "pagos_rep_crear" on public.payment_reports for insert to authenticated with check (client_id = auth.uid() and status = 'pendiente');
drop policy if exists "pagos_rep_gestionar" on public.payment_reports;
create policy "pagos_rep_gestionar" on public.payment_reports for update to authenticated using (public.is_coach()) with check (public.is_coach());
drop policy if exists "pagos_rep_borrar" on public.payment_reports;
create policy "pagos_rep_borrar" on public.payment_reports for delete to authenticated using (public.is_coach() or (client_id = auth.uid() and status = 'pendiente'));

-- Firmas: el asesorado firma (no se modifican); el equipo las lee
drop policy if exists "firmas_leer" on public.signatures;
create policy "firmas_leer" on public.signatures for select to authenticated using (client_id = auth.uid() or public.staff_sees(client_id));
drop policy if exists "firmas_crear" on public.signatures;
create policy "firmas_crear" on public.signatures for insert to authenticated with check (client_id = auth.uid());
drop policy if exists "firmas_borrar" on public.signatures;
create policy "firmas_borrar" on public.signatures for delete to authenticated using (public.is_coach());

-- Retos pagos: solo el entrenador marca el pago de la inscripción
create or replace function public.challenge_paid_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.paid and not public.is_coach() and (tg_op = 'INSERT' or not old.paid) then new.paid := false; end if;
  return new;
end $$;
drop trigger if exists challenge_paid_guard on public.challenge_members;
create trigger challenge_paid_guard before insert or update on public.challenge_members for each row execute function public.challenge_paid_guard();

-- Encuestas: el entrenador publica testimonios autorizados
drop policy if exists "encuesta_publicar" on public.surveys;
create policy "encuesta_publicar" on public.surveys for update to authenticated using (public.is_coach()) with check (public.is_coach());

-- ---------- Archivos privados ----------
insert into storage.buckets (id, name, public) values ('chat-media', 'chat-media', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('exercise-videos', 'exercise-videos', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('brand', 'brand', true) on conflict (id) do nothing;

-- Fotos y audios del chat: <id del asesorado>/<archivo>
drop policy if exists "chat_media_leer" on storage.objects;
create policy "chat_media_leer" on storage.objects for select to authenticated
  using (bucket_id = 'chat-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_sees_path((storage.foldername(name))[1])));
drop policy if exists "chat_media_subir" on storage.objects;
create policy "chat_media_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_sees_path((storage.foldername(name))[1])));
drop policy if exists "chat_media_borrar" on storage.objects;
create policy "chat_media_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'chat-media' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
-- Comprobantes de pago: el asesorado sube los suyos; solo el entrenador los ve
drop policy if exists "comprobantes_leer" on storage.objects;
create policy "comprobantes_leer" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_coach()));
drop policy if exists "comprobantes_subir" on storage.objects;
create policy "comprobantes_subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "comprobantes_borrar" on storage.objects;
create policy "comprobantes_borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'payment-proofs' and public.is_coach());
-- Videos propios de los ejercicios: los ve cualquier usuario de la app; los sube el entrenador
drop policy if exists "videos_ejercicio_leer" on storage.objects;
create policy "videos_ejercicio_leer" on storage.objects for select to authenticated using (bucket_id = 'exercise-videos');
drop policy if exists "videos_ejercicio_gestionar" on storage.objects;
create policy "videos_ejercicio_gestionar" on storage.objects for all to authenticated
  using (bucket_id = 'exercise-videos' and public.is_coach()) with check (bucket_id = 'exercise-videos' and public.is_coach());
-- Logo de la marca (público)
drop policy if exists "marca_gestionar" on storage.objects;
create policy "marca_gestionar" on storage.objects for all to authenticated
  using (bucket_id = 'brand' and public.is_coach()) with check (bucket_id = 'brand' and public.is_coach());

-- ---------- Funciones públicas: testimonios publicados y marca ----------
create or replace function public.public_testimonials() returns table (texto text, nombre text, fecha date)
language sql stable security definer set search_path = public as $$
  select s.testimonial,
    case when s.show_name then split_part(coalesce(p.full_name, ''), ' ', 1) || coalesce(nullif(' ' || left(split_part(coalesce(p.full_name, ''), ' ', 2), 1) || '.', ' .'), '') else 'Asesorado' end,
    s.created_at::date
  from public.surveys s join public.profiles p on p.id = s.client_id
  where s.consent and s.published and coalesce(s.testimonial, '') <> ''
  order by s.created_at desc limit 30;
$$;
grant execute on function public.public_testimonials() to anon, authenticated;

create or replace function public.public_info() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('whatsapp', data->>'whatsapp', 'title', data->>'landing_title', 'intro', data->>'landing_intro', 'services', data->>'landing_services',
    'brand', data->'brand', 'promo', data->>'season_promo')
  from public.app_settings where id = 1;
$$;
grant execute on function public.public_info() to anon, authenticated;

-- Última actividad por asesorado (solo los asesorados que el usuario puede ver)
create or replace function public.client_last_activity() returns table (client_id uuid, last_date date)
language sql stable security definer set search_path = public as $$
  select p.id, greatest(
    (select max(f.log_date) from public.food_logs f where f.client_id = p.id),
    (select max(w.started_at)::date from public.workouts w where w.client_id = p.id),
    (select max(c.check_date) from public.checkins c where c.client_id = p.id))
  from public.profiles p
  where p.role = 'client' and public.staff_sees(p.id);
$$;

-- ---------- Políticas existentes: lectura del asistente limitada a sus asesorados ----------
-- Cambia «is_staff()» por «staff_sees(client_id)» en todas las tablas con columna client_id
-- (y «staff_sees(id)» en profiles para las filas de asesorados).
do $$
declare r record; q text; c text; col text;
begin
  for r in select p.tablename, p.policyname, p.qual, p.with_check
           from pg_policies p where p.schemaname = 'public' and (p.qual ~ 'is_staff\(\)' or p.with_check ~ 'is_staff\(\)') loop
    col := null;
    if r.tablename = 'profiles' then col := 'id';
    elsif exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tablename and column_name = 'client_id') then col := 'client_id';
    end if;
    if col is null then continue; end if;
    if r.qual ~ 'is_staff\(\)' then
      q := regexp_replace(r.qual, '(public\.)?is_staff\(\)', 'public.staff_sees(' || col || ')', 'g');
      execute format('alter policy %I on public.%I using (%s)', r.policyname, r.tablename, q);
    end if;
    if r.with_check ~ 'is_staff\(\)' then
      c := regexp_replace(r.with_check, '(public\.)?is_staff\(\)', 'public.staff_sees(' || col || ')', 'g');
      execute format('alter policy %I on public.%I with check (%s)', r.policyname, r.tablename, c);
    end if;
  end loop;
end $$;
-- Documentos del expediente y videos de técnica: el asistente solo ve los de sus asesorados
drop policy if exists "documentos_leer" on storage.objects;
create policy "documentos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (public.staff_sees_path((storage.foldername(name))[1]) or exists (select 1 from public.case_reports r where r.doc_path = storage.objects.name and r.client_id = auth.uid() and r.visible)));
drop policy if exists "videos_archivos_leer" on storage.objects;
create policy "videos_archivos_leer" on storage.objects for select to authenticated
  using (bucket_id = 'client-videos' and ((storage.foldername(name))[1] = auth.uid()::text or public.staff_sees_path((storage.foldername(name))[1])));
-- En profiles, el equipo debe seguir viendo su propio perfil y el de los demás miembros del equipo
drop policy if exists "perfiles_equipo" on public.profiles;
create policy "perfiles_equipo" on public.profiles for select to authenticated using (public.is_staff() and role in ('coach', 'assistant'));

-- Rol de asistente: solo el entrenador lo asigna o lo retira
create or replace function public.set_team_role(target uuid, new_role text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_coach() then raise exception 'Solo el entrenador puede cambiar roles'; end if;
  if new_role not in ('assistant', 'client') then raise exception 'Rol no válido'; end if;
  if target = auth.uid() then raise exception 'No puedes cambiar tu propio rol'; end if;
  if (select role from public.profiles where id = target) = 'coach' then raise exception 'No se puede cambiar el rol de un entrenador'; end if;
  update public.profiles set role = new_role where id = target;
  if new_role = 'client' then update public.client_meta set assigned_to = null where assigned_to = target; end if;
end $$;
revoke all on function public.set_team_role(uuid, text) from public, anon;
grant execute on function public.set_team_role(uuid, text) to authenticated;

-- ---------- Ajustes por defecto y versión ----------
update public.app_settings
set data = '{"stores": "D1\nÉxito\nAra", "event_max_pct": 15, "load_carb_gkg": 8}'::jsonb || data || '{"schema_version": 10}'::jsonb,
    updated_at = now()
where id = 1;
