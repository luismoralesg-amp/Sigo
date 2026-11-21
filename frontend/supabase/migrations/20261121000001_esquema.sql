-- Expediente Vivo · esquema base
-- Conservamos el original (foto o archivo) junto a cada dato rescatado.

create extension if not exists pgcrypto;

-- ---------- centro ----------
create table if not exists public.centro (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo text not null check (tipo in ('puesto', 'centro', 'hospital')),
  municipio text not null,
  departamento text not null
);

-- ---------- paciente ----------
create table if not exists public.paciente (
  id uuid primary key default gen_random_uuid(),
  dpi_cui text unique check (dpi_cui is null or dpi_cui ~ '^[0-9]{13}$'),
  nombre text not null,
  fecha_nacimiento date,
  sexo text check (sexo is null or sexo in ('F', 'M')),
  comunidad text,
  alergias text[] not null default '{}',
  condiciones_cronicas text[] not null default '{}',
  creado_en timestamptz not null default now()
);
create index if not exists paciente_nombre_idx on public.paciente (lower(nombre));
create index if not exists paciente_fnac_idx on public.paciente (fecha_nacimiento);

-- ---------- consulta ----------
create table if not exists public.consulta (
  id uuid primary key default gen_random_uuid(),
  paciente_id uuid not null references public.paciente(id) on delete cascade,
  centro_id uuid references public.centro(id),
  fecha date not null,
  motivo text,
  diagnostico text,
  tratamiento text,
  vacunas text[] not null default '{}',
  medicamentos text[] not null default '{}',
  origen text not null check (origen in ('foto', 'sistema_antiguo', 'digital')),
  fuente_detalle text,                         -- "Ficha en papel · 2014", "Excel 2018"
  archivo_original_url text,                   -- ruta en Storage del original principal
  archivos_originales text[] not null default '{}', -- todas las páginas / archivos
  fila_original jsonb,                         -- fila tal como venía del sistema antiguo
  confirmado_por uuid references auth.users(id),
  creado_en timestamptz not null default now()
);
create index if not exists consulta_paciente_idx on public.consulta (paciente_id, fecha desc);
create index if not exists consulta_centro_creado_idx on public.consulta (centro_id, creado_en desc);

-- ---------- usuario_perfil ----------
create table if not exists public.usuario_perfil (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rol text not null check (rol in ('puesto', 'hospital')),
  centro_id uuid not null references public.centro(id),
  nombre_visible text
);

-- ---------- acceso (bitácora) ----------
create table if not exists public.acceso (
  id uuid primary key default gen_random_uuid(),
  usuario uuid not null references auth.users(id),
  rol text not null,
  paciente_id uuid not null references public.paciente(id) on delete cascade,
  centro_id uuid references public.centro(id),
  fecha_hora timestamptz not null default now()
);
create index if not exists acceso_paciente_idx on public.acceso (paciente_id, fecha_hora desc);

-- ---------- funciones de apoyo ----------
create or replace function public.mi_rol() returns text
language sql stable security definer set search_path = public as $$
  select rol from public.usuario_perfil where user_id = auth.uid()
$$;

create or replace function public.mi_centro() returns uuid
language sql stable security definer set search_path = public as $$
  select centro_id from public.usuario_perfil where user_id = auth.uid()
$$;
