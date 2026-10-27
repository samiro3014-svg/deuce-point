-- =====================================================================
--  Deuce Point · Migración v10
--  Requiere la v9. Ejecutar completo en Supabase › SQL Editor › Run.
--  Se puede ejecutar varias veces sin duplicar nada.
-- =====================================================================

do $$ begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'guardian_links') then
    raise exception 'Primero ejecuta supabase/migracion-v9.sql';
  end if;
end $$;

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
