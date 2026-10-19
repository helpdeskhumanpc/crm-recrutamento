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
