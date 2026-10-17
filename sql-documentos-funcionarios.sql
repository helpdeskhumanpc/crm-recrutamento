-- 1) Tabela que guarda os registros de cada documento enviado
create table documentos_funcionarios (
  id uuid primary key default gen_random_uuid(),
  telefone text not null,
  tipo text not null,
  storage_path text not null,
  nome_arquivo text,
  criado_em timestamptz not null default now(),
  candidate_id uuid references candidates(id),
  confirmado_em timestamptz
);

create index idx_documentos_funcionarios_telefone_tipo on documentos_funcionarios (telefone, tipo);

alter table documentos_funcionarios enable row level security;

-- qualquer pessoa (mesmo sem login) pode enviar um documento
create policy "insert publico" on documentos_funcionarios for insert with check (true);

-- só staff (admin/jimusho/tantousha) consegue ver os documentos enviados
create policy "select staff" on documentos_funcionarios for select using (
  exists (select 1 from profiles where profiles.id = auth.uid()
    and profiles.role in ('admin','jimusho','tantousha'))
);

-- só staff confirma (vincula a um candidato)
create policy "update staff" on documentos_funcionarios for update using (
  exists (select 1 from profiles where profiles.id = auth.uid()
    and profiles.role in ('admin','jimusho','tantousha'))
);


-- 2) Bucket de Storage
-- Vá em Storage -> New bucket -> nome: documentos-funcionarios -> Public: OFF (privado, por causa de My Number/Zairyu Card)

-- 3) Políticas do bucket (rode depois de criar o bucket acima)
create policy "upload publico documentos" on storage.objects for insert
  with check (bucket_id = 'documentos-funcionarios');

create policy "select staff documentos" on storage.objects for select using (
  bucket_id = 'documentos-funcionarios'
  and exists (select 1 from profiles where profiles.id = auth.uid()
    and profiles.role in ('admin','jimusho','tantousha'))
);
