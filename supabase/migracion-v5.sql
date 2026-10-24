-- =====================================================================
--  Deuce Point · Migración v5
--  Generador de menús (costo y uso de cada alimento), membresías,
--  informes mensuales y eliminación de asesorados desde la app.
--  Ejecutar UNA vez en: Supabase > SQL Editor > New query > Run
--  Requiere la migración v3. Incluye la migración v4 (si ya la ejecutaste, no pasa nada).
--  Se puede ejecutar de nuevo sin errores.
-- =====================================================================

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
