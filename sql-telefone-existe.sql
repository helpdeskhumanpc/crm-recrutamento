-- Funcao auxiliar: normaliza telefone (remove tudo que nao for digito, troca prefixo 81 por 0)
create or replace function norm_tel(t text)
returns text
language sql
immutable
as $$
  select case
    when regexp_replace(coalesce(t,''), '\D', '', 'g') like '81%'
      then '0' || substring(regexp_replace(coalesce(t,''), '\D', '', 'g') from 3)
    else regexp_replace(coalesce(t,''), '\D', '', 'g')
  end;
$$;

-- Funcao que a pagina publica chama (via RPC): só diz se existe ou não, nunca expõe dados do candidato
create or replace function telefone_existe(tel text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from candidates
    where norm_tel(telefone) = norm_tel(tel)
      and is_deleted = false
  );
$$;

grant execute on function norm_tel(text) to anon, authenticated;
grant execute on function telefone_existe(text) to anon, authenticated;

-- Funcao que a pagina publica de foto 3x4 chama (via RPC): atualiza candidates.foto_url
-- pelo telefone, sem expor nem permitir alterar nenhum outro dado do candidato
create or replace function atualizar_foto_candidato(tel text, nova_foto_url text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  linhas int;
begin
  update candidates
  set foto_url = nova_foto_url
  where norm_tel(telefone) = norm_tel(tel)
    and is_deleted = false;
  get diagnostics linhas = row_count;
  return linhas > 0;
end;
$$;

grant execute on function atualizar_foto_candidato(text, text) to anon, authenticated;

-- Bucket "fotos-curriculos" ja existe e ja aceita upload publico (usado pelo form-curriculo.html).
-- Se o upload da foto 3x4 der erro de permissao, roda tambem:
-- drop policy if exists "authenticated upload fotos candidatos" on storage.objects;
-- create policy "authenticated upload fotos candidatos"
--   on storage.objects for insert to authenticated
--   with check (bucket_id = 'fotos-curriculos');
