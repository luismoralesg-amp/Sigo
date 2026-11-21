-- SIGO: esquema de solo agregado para Supabase / Postgres.
-- S-05 a S-08. El API de hoy sigue en memoria; esto es la red cuando se conecte.
-- No hay pacientes reales. S-09 (alcance por centro) y P-05 (fichas anteriores al DPI)
-- quedan pendientes y no se implementan aquí.

create table public.centros (
  id text primary key,
  nombre text not null,
  tipo text not null check (tipo in ('puesto', 'centro', 'hospital')),
  municipio text not null,
  departamento text not null
);

create table public.perfiles (
  user_id uuid primary key,
  rol text not null check (rol in ('enfermera', 'medico', 'paciente')),
  centro_id text references public.centros (id),
  paciente_id text,
  nombre text not null
);

create or replace function public.sigo_rol()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select rol from public.perfiles where user_id = auth.uid()
$$;

create table public.paciente_versiones (
  id bigint generated always as identity primary key,
  paciente_id text not null,
  version integer not null,
  dpi text not null,
  nombre text not null,
  fecha_nacimiento date,
  sexo text check (sexo in ('F', 'M')),
  comunidad text,
  alergias text[] not null default '{}',
  condiciones_cronicas text[] not null default '{}',
  origen_ficha_id text,
  editada_por text not null,
  editada_en timestamptz not null default now(),
  unique (paciente_id, version)
);

create table public.consulta_versiones (
  id bigint generated always as identity primary key,
  consulta_id text not null,
  paciente_id text not null,
  version integer not null,
  fecha date,
  centro_id text not null references public.centros (id),
  motivo text,
  diagnostico text,
  tratamiento text,
  vacunas text[] not null default '{}',
  original_url text not null,
  motivo_cambio text,
  editada_por text not null,
  editada_en timestamptz not null default now(),
  unique (consulta_id, version)
);

create table public.alergias (
  id bigint generated always as identity primary key,
  paciente_id text not null,
  version_paciente integer not null,
  sustancia text not null,
  creada_en timestamptz not null default now()
);

create table public.vacunas (
  id bigint generated always as identity primary key,
  paciente_id text not null,
  consulta_id text not null,
  version_consulta integer not null,
  nombre text not null,
  creada_en timestamptz not null default now()
);

create table public.fichas (
  id text primary key,
  paciente_id text not null,
  client_id text not null unique,
  creada_en timestamptz not null default now(),
  creada_por text not null
);

create table public.ficha_eventos (
  id bigint generated always as identity primary key,
  ficha_id text not null references public.fichas (id),
  estado text not null check (estado in ('procesando', 'lista', 'confirmada', 'error')),
  en timestamptz not null default now()
);

create table public.consentimientos (
  id text primary key,
  paciente_id text not null,
  codigo_hash text not null,
  estado text not null default 'vigente',
  medico_id text,
  vence_en timestamptz not null,
  expira_en timestamptz not null,
  canjeado_en timestamptz,
  creado_en timestamptz not null default now()
);

create table public.bitacora (
  id bigint generated always as identity primary key,
  paciente_id text,
  actor_id text not null,
  tipo text not null,
  detalle jsonb not null default '{}',
  en timestamptz not null default now()
);

-- S-08: la clave service_role se salta RLS. Vive solo en el servidor
-- (variable de entorno de FastAPI), nunca en el navegador. Mientras el
-- API la use, RLS no es una segunda capa: cubre accesos directos con la
-- anon key. El actor de la bitácora lo pone el backend desde el token,
-- nunca desde el cuerpo. Ni service_role reescribe historia: el trigger
-- bloquea update y delete.

create or replace function public.sigo_bloquear_mutacion()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'consentimientos'
     and tg_op = 'UPDATE'
     and current_setting('sigo.canje', true) = '1' then
    if new.paciente_id is distinct from old.paciente_id
       or new.codigo_hash is distinct from old.codigo_hash
       or new.vence_en is distinct from old.vence_en
       or new.expira_en is distinct from old.expira_en
       or new.creado_en is distinct from old.creado_en
       or new.id is distinct from old.id then
      raise exception 'el canje solo puede cambiar estado, medico_id y canjeado_en';
    end if;
    return new;
  end if;
  raise exception 'SIGO es de solo agregado: % prohibido en %', tg_op, tg_table_name;
end;
$$;

create or replace function public.sigo_dpi_inmutable()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1 from public.paciente_versiones
    where paciente_id = new.paciente_id and dpi <> new.dpi
  ) then
    raise exception 'el DPI no se corrige desde la app';
  end if;
  return new;
end;
$$;

-- S-05: ningún médico hace update directo. Solo esta función, y solo toca
-- estado, medico_id y canjeado_en.
create or replace function public.canjear_consentimiento(p_id text, p_medico_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform set_config('sigo.canje', '1', true);
  update public.consentimientos
     set estado = 'usado',
         medico_id = p_medico_id,
         canjeado_en = now()
   where id = p_id
     and estado = 'vigente'
     and vence_en > now();
end;
$$;

revoke all on function public.canjear_consentimiento(text, text) from public, anon, authenticated;
grant execute on function public.canjear_consentimiento(text, text) to service_role;

create or replace function public.sigo_medico_puede(p_paciente text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.consentimientos c
    join public.perfiles p on p.user_id = auth.uid()
    where c.paciente_id = p_paciente
      and c.medico_id = p.user_id::text
      and c.estado in ('usado', 'emergencia')
      and c.expira_en > now()
  )
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'paciente_versiones', 'consulta_versiones', 'alergias', 'vacunas',
    'fichas', 'ficha_eventos', 'consentimientos', 'bitacora'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.sigo_bloquear_mutacion()',
      t || '_solo_agregado', t
    );
  end loop;
end;
$$;

create trigger paciente_versiones_dpi_inmutable
  before insert on public.paciente_versiones
  for each row execute function public.sigo_dpi_inmutable();

revoke all on all tables in schema public from anon, authenticated;
revoke update, delete on
  public.paciente_versiones,
  public.consulta_versiones,
  public.alergias,
  public.vacunas,
  public.fichas,
  public.ficha_eventos,
  public.consentimientos,
  public.bitacora
from public, anon, authenticated;

grant select on public.paciente_versiones, public.consulta_versiones, public.alergias,
  public.vacunas, public.fichas, public.ficha_eventos, public.consentimientos, public.bitacora
  to authenticated;
grant insert on public.paciente_versiones, public.consulta_versiones, public.alergias,
  public.vacunas, public.fichas, public.ficha_eventos
  to authenticated;

-- S-07: el cliente autenticado no inserta bitácora.
revoke insert on public.bitacora from anon, authenticated;
grant insert on public.bitacora to service_role;

create policy bitacora_sin_insert_cliente on public.bitacora
  for insert to anon, authenticated
  with check (false);

create policy bitacora_lee_paciente on public.bitacora
  for select to authenticated
  using (
    public.sigo_rol() = 'paciente'
    and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid())
  );

-- S-06: no hay políticas de escritura destructiva. Corregir es insertar otra versión.

create policy paciente_versiones_lee on public.paciente_versiones
  for select to authenticated
  using (
    public.sigo_rol() = 'enfermera'
    or (public.sigo_rol() = 'paciente' and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid()))
    or (public.sigo_rol() = 'medico' and public.sigo_medico_puede(paciente_id))
  );

create policy paciente_versiones_inserta on public.paciente_versiones
  for insert to authenticated
  with check (public.sigo_rol() = 'enfermera');

create policy consulta_versiones_lee on public.consulta_versiones
  for select to authenticated
  using (
    public.sigo_rol() = 'enfermera'
    or (public.sigo_rol() = 'paciente' and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid()))
    or (public.sigo_rol() = 'medico' and public.sigo_medico_puede(paciente_id))
  );

create policy consulta_versiones_inserta on public.consulta_versiones
  for insert to authenticated
  with check (public.sigo_rol() = 'enfermera');

create policy alergias_lee on public.alergias
  for select to authenticated
  using (
    public.sigo_rol() = 'enfermera'
    or (public.sigo_rol() = 'paciente' and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid()))
    or (public.sigo_rol() = 'medico' and public.sigo_medico_puede(paciente_id))
  );

create policy alergias_inserta on public.alergias
  for insert to authenticated
  with check (public.sigo_rol() = 'enfermera');

create policy vacunas_lee on public.vacunas
  for select to authenticated
  using (
    public.sigo_rol() = 'enfermera'
    or (public.sigo_rol() = 'paciente' and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid()))
    or (public.sigo_rol() = 'medico' and public.sigo_medico_puede(paciente_id))
  );

create policy vacunas_inserta on public.vacunas
  for insert to authenticated
  with check (public.sigo_rol() = 'enfermera');

create policy fichas_lee on public.fichas
  for select to authenticated
  using (
    public.sigo_rol() = 'enfermera'
    or (public.sigo_rol() = 'paciente' and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid()))
  );

create policy fichas_inserta on public.fichas
  for insert to authenticated
  with check (public.sigo_rol() = 'enfermera');

create policy consentimientos_lee_paciente on public.consentimientos
  for select to authenticated
  using (
    public.sigo_rol() = 'paciente'
    and paciente_id = (select paciente_id from public.perfiles where user_id = auth.uid())
  );
