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
--  Incluye las migraciones v3 y v4
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

-- Último paso (después de registrarte en la app con tu correo):
-- update public.profiles set role = 'coach' where email = 'TU_CORREO@ejemplo.com';
