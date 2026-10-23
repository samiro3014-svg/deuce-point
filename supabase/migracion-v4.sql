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
