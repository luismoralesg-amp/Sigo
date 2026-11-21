-- Expediente Vivo · seguridad por filas (RLS)
-- puesto: digitaliza e importa (lee y escribe pacientes y consultas).
-- hospital: consulta expedientes (solo lectura) y deja huella en la bitácora.

alter table public.centro enable row level security;
alter table public.paciente enable row level security;
alter table public.consulta enable row level security;
alter table public.usuario_perfil enable row level security;
alter table public.acceso enable row level security;

-- centro: cualquier usuario con perfil puede leer
drop policy if exists centro_leer on public.centro;
create policy centro_leer on public.centro for select to authenticated
  using (public.mi_rol() is not null);

-- usuario_perfil: cada quien ve su perfil
drop policy if exists perfil_propio on public.usuario_perfil;
create policy perfil_propio on public.usuario_perfil for select to authenticated
  using (user_id = auth.uid());

-- paciente
drop policy if exists paciente_leer on public.paciente;
create policy paciente_leer on public.paciente for select to authenticated
  using (public.mi_rol() in ('puesto', 'hospital'));
drop policy if exists paciente_crear on public.paciente;
create policy paciente_crear on public.paciente for insert to authenticated
  with check (public.mi_rol() = 'puesto');
drop policy if exists paciente_actualizar on public.paciente;
create policy paciente_actualizar on public.paciente for update to authenticated
  using (public.mi_rol() = 'puesto') with check (public.mi_rol() = 'puesto');

-- consulta: el puesto solo registra consultas a nombre de su propio centro,
-- y siempre deja constancia de quién confirmó.
drop policy if exists consulta_leer on public.consulta;
create policy consulta_leer on public.consulta for select to authenticated
  using (public.mi_rol() in ('puesto', 'hospital'));
drop policy if exists consulta_crear on public.consulta;
create policy consulta_crear on public.consulta for insert to authenticated
  with check (public.mi_rol() = 'puesto' and centro_id = public.mi_centro() and confirmado_por = auth.uid());

-- acceso (bitácora): cada quien registra sus propias consultas; todos ven la bitácora
drop policy if exists acceso_registrar on public.acceso;
create policy acceso_registrar on public.acceso for insert to authenticated
  with check (usuario = auth.uid() and centro_id = public.mi_centro());
drop policy if exists acceso_leer on public.acceso;
create policy acceso_leer on public.acceso for select to authenticated
  using (public.mi_rol() in ('puesto', 'hospital'));

-- ---------- Storage: originales (privado) ----------
insert into storage.buckets (id, name, public)
values ('originales', 'originales', false)
on conflict (id) do nothing;

drop policy if exists originales_leer on storage.objects;
create policy originales_leer on storage.objects for select to authenticated
  using (bucket_id = 'originales' and public.mi_rol() in ('puesto', 'hospital'));
drop policy if exists originales_subir on storage.objects;
create policy originales_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'originales' and public.mi_rol() = 'puesto');
