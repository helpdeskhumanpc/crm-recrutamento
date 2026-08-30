# Cérebro — CRM Recrutamento Japão

> Documento de referência do projeto. Reflete o estado atual construído.
> Última atualização: 2026-08-25

---

## Regra de Colaboração com o Assistente

**Sempre que o Eder pedir qualquer alteração ou tarefa:** o assistente deve primeiro explicar o que entendeu do pedido e aguardar confirmação antes de executar. Nunca executar direto sem confirmar o entendimento.

**Sempre que fizer alguma alteração no projeto:** atualizar este arquivo (`cerebro.md`) refletindo a mudança, no mesmo fluxo — não deixar acumular pra depois.

---

## Visão do Produto

Sistema interno de gestão de recrutamento para o mercado japonês.
Elimina o caos de planilhas e WhatsApp no processo seletivo por fábrica.

**Site público:** https://jobs-human.com/ (WordPress + Elementor)
**CRM (dashboard):** https://crm-recrutamento-production.up.railway.app
**Login:** email + senha individual por usuário (Supabase Auth)
**Repositório GitHub:** https://github.com/helpdeskhumanpc/crm-recrutamento

---

## Sistema de Autenticação (em implementação)

### Substituição do sistema atual
- **Antes:** senha única `0246` no Express → acesso total para todos
- **Depois:** Supabase Auth (email + senha individual) → acesso filtrado por cargo

### Tabelas envolvidas
- `auth.users` (Supabase Auth) → gerencia email + senha. Visível em **Authentication → Users** no painel
- `profiles` (nova) → dados extras: cargo, fábricas, escritório
- `shokaisha` → **mantida** (formulário lê dela para dropdown)
- `tantoushas` → **remover** após migração (substituída por `profiles`)

### Tabela `profiles`

```sql
id          uuid PK references auth.users(id)
nome        text
jimusho     text        -- escritório (ex: 刈谷事務所)
fabricas    text[]      -- fábricas que gerencia (pode ter várias)
role        text        -- admin | jimusho | tantousha | shokaisha
shokai_nome text        -- para role=shokaisha: nome na tabela shokaisha
created_at  timestamp
```

### Cargos e regras de acesso

| Cargo | Vê no dashboard |
|-------|----------------|
| `admin` | Todos os candidatos de todas as fábricas |
| `jimusho` | Todos os candidatos das fábricas do seu escritório (fabricas[]) |
| `tantousha` | Candidatos das suas fábricas (fabricas[]) + todos que ele indicou (shokai = shokai_nome) |
| `shokaisha` | Apenas candidatos que ele indicou (shokai = shokai_nome) |

### Regras especiais
- Um usuário pode gerenciar **múltiplas fábricas** — campo `fabricas` é um array
- A diferença entre `jimusho` e `tantousha` é só a quantidade de fábricas no array — o admin define
- `shokaisha` não precisa de fábrica — filtra só pelo nome no campo `shokai` dos candidatos
- Formulário público (WordPress) **não muda** — continua lendo `shokaisha` table para o dropdown

### Fluxo de criação de usuário
1. Admin cria em **Supabase → Authentication → Users → Add user** (email + senha)
2. Trigger `on_auth_user_created` cria automaticamente uma linha em `profiles` com `role = tantousha`
3. Admin edita em **Table Editor → profiles**: nome, role, jimusho, fabricas

### Trigger automático (já criado)
```sql
-- Cria perfil automaticamente ao criar usuário no Auth
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.criar_perfil_automatico();
```

### Como preencher fabricas no Table Editor
Campo `fabricas` é um array — formato JSON:
```
["アラコ","FTS"]
```

### jimusho nas locations
- Tabela `locations` tem coluna `jimusho` para vincular cada fábrica ao seu escritório
- Role `jimusho` filtra candidatos automaticamente por todas as fábricas do seu escritório
- Preencher em **Table Editor → locations → coluna jimusho**

### Recuperação de senha (adicionado 2026-08-19)

- Tela de login tem link "パスワードをお忘れですか？" → campo de e-mail → chama `sb.auth.resetPasswordForEmail(email, { redirectTo })`
- Ao clicar no link recebido por e-mail, o Supabase dispara o evento `PASSWORD_RECOVERY` (`onAuthStateChange`) — o dashboard detecta isso e mostra uma tela separada (`resetScreen`) pra definir a nova senha, **sem** abrir o dashboard direto (havia risco de corrida com o `getSession()` inicial; corrigido checando `location.hash.includes('type=recovery')`)
- **Depende de configuração manual no Supabase** (Authentication → URL Configuration): `Site URL` = `https://crm-recrutamento-production.up.railway.app` (estava com resquício de `localhost:3000` do setup local, já corrigido) e `Redirect URLs` incluindo essa mesma URL com `/*`
- Envio de e-mail usa o serviço padrão do Supabase (free tier) — **limite baixo de e-mails/hora**, já esbarrado em teste (`email rate limit exceeded`). Se isso virar recorrente (84 shokaisha ganhando login aos poucos), considerar SMTP próprio (Resend, Gmail SMTP) em Authentication → Settings → SMTP Settings

### Políticas RLS ativas
- `insert publico` — anon pode inserir (formulário público)
- `select por cargo` — filtro por role (admin/jimusho/tantousha/shokaisha) — quem cada cargo **vê**
- `update por cargo` — desde 2026-08-08: `shokaisha` não tem UPDATE por essa policy; `tantousha` só edita candidatos cuja `fabrica`/`fabrica2` esteja no seu array `fabricas` (perdeu o bypass de editar por indicação/`shokai`)
- `admin update all` — admin sempre edita tudo
- **`tantousha update proprios indicados`** (nova, 2026-08-19) — policy adicional (permissiva, soma com as acima via OR): tantousha pode dar UPDATE em qualquer candidato onde `shokai = profiles.shokai_nome`, **independente da fábrica** — cobre o caso de ela processar (担当者紹介 etc.) um lead que ela mesma trouxe via link de afiliado, mesmo que a fábrica não seja uma das dela
- **`shokaisha update proprios leads`** (nova, 2026-08-19) — mesma lógica, mas pra `role = 'shokaisha'`, e só enquanto `origem in ('web','web_indicado','web_stock')` (ou seja, enquanto o candidato ainda está no universo de "Leads do Site")
- **`jimusho select proprios indicados`** e **`jimusho update proprios indicados`** (novas, 2026-08-25) — mesma lógica das duas de cima, mas pra `role = 'jimusho'`, sem restrição de `origem`. Corrige um gap: `jimusho` nunca teve cláusula de `shokai` na `select por cargo` original (só `fabrica`), então mesmo com `shokai_nome` idêntico em `profiles`/`shokaisha`/`candidates` (confirmado por hash, não era erro de digitação), o Supabase nunca entregava esses candidatos pro navegador — afetava tanto Leads do Site quanto o "全体" documentado abaixo em `<escritório>`まとめ, que já assumia (incorretamente, até aqui) que esse match funcionava
- `anon select temp` — anon pode ler tudo (temporário, remover quando todos migrarem para login)

### Ver vs Editar (importante, não confundir)
- **Ver (select):** `shokaisha` vê o que indicou; `tantousha` vê suas fábricas + o que indicou; `jimusho` vê as fábricas do escritório + o que indicou pessoalmente via `shokai` (esse último só a partir de 2026-08-25 — antes não funcionava, ver policy acima)
- **Editar (update) — regra desde 2026-08-25:**
  - `admin`: tudo, sempre
  - `jimusho`: candidatos das fábricas do escritório (edição completa) **OU** candidatos que ele mesmo indicou, independente da fábrica (edição completa, via a nova policy — igual ao padrão de `tantousha`)
  - `tantousha`: candidatos das próprias fábricas (edição completa) **OU** candidatos que ele mesmo indicou, independente da fábrica (edição completa, via a nova policy)
  - `shokaisha`: **edição parcial** dos próprios indicados enquanto estiverem em Leads do Site (`origem` web/web_indicado/web_stock) — dados pessoais (基本情報/仕事情報/スキル) **e** `工場`/`工場２` (liberado em 2026-08-19); só ficam travados `紹介者`, todas as datas de パイプライン日付, ブラックリスト e notas internas (アラート, 担当者コメント)
- Reforçado no frontend (`dashboard.js`):
  - `podeEditar(c)` → edição completa (admin/jimusho/tantousha por fábrica)
  - `podeEditarInfo(c)` → edição parcial (quem tem `shokai_nome` batendo com o candidato, respeitando `CAMPOS_BLOQUEADOS_INFO`)
  - Sem nenhuma das duas: modal todo desabilitado, botões 保存/削除 somem, aparece "🔒 閲覧のみ（編集不可）"

---

## Usuários

| Perfil | Vê | Edita |
|--------|-----|-------|
| `admin` | Todos os candidatos, todas as fábricas | Tudo |
| `jimusho` | Todas as fábricas do seu escritório + indicados (via `shokai`, desde 2026-08-25) + área agregada 事務所まとめ (ver abaixo) | Tudo do seu escritório + os que ele mesmo indicou, qualquer fábrica (completo) |
| `tantousha` | Suas fábricas + indicados | Suas fábricas (completo) + os que ele mesmo indicou, qualquer fábrica (completo) |
| `shokaisha` | Só quem indicou | Dados pessoais dos próprios indicados, enquanto em Leads do Site (não edita 紹介者/工場/datas de pipeline) |

---

## Stack Tecnológica (atual)

| Camada | Tecnologia |
|--------|-----------|
| Site público | WordPress + Elementor (jobs-human.com) |
| Formulário de cadastro | HTML puro com Supabase JS SDK |
| Banco de dados | Supabase (PostgreSQL) — free tier |
| Dashboard CRM | HTML + CSS + JS vanilla (dashboard.html) |
| Autenticação | Supabase Auth (email + senha individual por usuário) |
| Servidor | Express.js — serve arquivos estáticos + endpoint `/api/google-contact` (server.js) |
| Google Contacts | Google People API via OAuth 2.0 — cria contato automático ao receber lead do site |
| Telegram | Bot API — envia notificação formatada ao receber lead do site |
| Deploy | Railway (auto-deploy via GitHub push) |

---

## Arquivos do Projeto

| Arquivo | Função |
|---------|--------|
| `dashboard.html` | CRM completo — pipeline, leads, stock pool, calendário, gráficos, link de indicação |
| `form-candidato.html` | Formulário interno de cadastro (japonês) — origem `indicado` |
| `form-vaga.html` | Formulário público (português) no WordPress — origem `web` — **colado manualmente via Elementor HTML widget, não é servido dinamicamente do Railway** |
| `form-vaga-ig.html` | Variante do form-vaga.html (labels em inglês) — status de onde está embutido no site ainda não confirmado com o Eder |
| `link-afiliado.html` | Página standalone com senha compartilhada (`0246`) pra gerar link de indicação — **criada em 2026-08-19 e hoje sem uso**: decisão foi usar só a aba 紹介リンク do dashboard (exige login individual), esse arquivo ficou como transição pra quem ainda não tinha conta |
| `server.js` | Express: serve estáticos + POST `/api/google-contact` (Google + Telegram) |
| `package.json` | Dependências: express, cookie-parser |
| `.gitignore` | Ignora node_modules |

---

## Supabase — Credenciais

- **Project URL:** https://xzxfwrbebkwagnropgfb.supabase.co
- **Publishable key:** sb_publishable_rPu8_l2pdy3XtOTAus6Mxw_rp2HO_XE

---

## Supabase — Tabelas

### `candidates` — tabela principal

```sql
id                    uuid PK default gen_random_uuid()
numero_cadastro       integer NOT NULL UNIQUE default nextval('candidates_numero_cadastro_seq')  -- 番号, sequencial, gerado automaticamente (adicionado 2026-08-08)
shokai                text          -- 紹介者
shimei                text NOT NULL -- 氏名
telefone              text          -- 電話番号
postal_code           text          -- 〒
prefecture            text          -- 都道府県
city                  text          -- 市区町村
data_nascimento       date          -- 生年月日
idade                 integer       -- 年齢
sexo                  text          -- 性別
nacionalidade         text          -- 国籍
visa                  text          -- ビザ
nivel_japones         text          -- 日本語力
fala_ingles           boolean       -- 英語会話
hiragana              text          -- ひらがな
katakana              text          -- カタカナ
habilitacao           text[]        -- 免許・資格 (array)
tem_carro             boolean       -- 車の所有
experiencia           text[]        -- 工場経験 (array)
turnos_possiveis      text[]        -- 可能な直 (array)
precisa_apartamento   boolean       -- アパート必要
pode_mudar            boolean       -- 引越し可能か
esta_empregado        text          -- 現在仕事中
fabrica               text          -- 工場
fabrica2              text          -- 工場２（segunda opção）
comentario            text          -- コメント
tantousha_comentario  text          -- 担当者コメント
is_blacklisted        boolean default false  -- ブラック flag
blacklist_motivo      text
alerta_data           timestamp     -- data/hora do alerta
alerta_nota           text          -- instrução do alerta
is_deleted            boolean default false  -- soft delete
origem                text          -- 'indicado' | 'web' | 'web_indicado' | 'web_stock'
-- Pipeline dates
dt_oubo               date          -- 応募日 (não usado; dashboard usa created_at, somente leitura)
dt_taiochu            date          -- 対応中
dt_mensetsu           date          -- 面接日
mensetsu_hora         time          -- 面接時間
dt_kengaku            date          -- 見学日
dt_naitei             date          -- 内定
dt_nyusha             date          -- 入社
dt_zaiseki            date          -- 在籍 (adicionado 2026-08-25). Opcional — se vazio, 在籍 continua sendo
                                     -- calculado automaticamente por mês (dt_nyusha em mês anterior ao atual).
                                     -- Preenchido manualmente = marca 在籍 na hora, sem esperar o mês virar.
dt_stock              date          -- 工場ストック
dt_stock_geral        date          -- 全体ストック (libera candidato p/ pool 全体ストック, qualquer fábrica pode assumir)
dt_ng                 date          -- NG
dt_shokai              date         -- 紹介日 (adicionado 2026-08-19). NÃO entra no cálculo de etapa (igual dt_oubo).
                                     -- Preenchido: no cadastro interno (form-candidato.html) = data do cadastro;
                                     -- via link de afiliado = data em que 担当者紹介 foi clicado (não a do form original)
created_at            timestamp with time zone default now()
```

### `locations` — fábricas e escritórios

```sql
id          uuid PK
nome        text NOT NULL
tipo        text default '工場'
cidade      text
estado      text          -- adicionado depois
jimusho     text          -- escritório responsável
ativo       boolean default true  -- false = não aparece nos dropdowns
link_divulgacao text     -- link da página de vaga no site (adicionado 2026-08-19). Alimenta a aba 紹介リンク
                          -- no dashboard; fábrica só aparece lá se esse campo estiver preenchido.
order_atual     integer default 0  -- オーダー atual (adicionado 2026-08-21). MANUAL, não calculado.
naitei_atual    integer default 0  -- 内定 conseguidos pra essa オーダー (adicionado 2026-08-21). MANUAL —
                                     -- de propósito: um 内定 recente pode ser de uma オーダー anterior,
                                     -- contar automático dos candidatos distorceria o número.
created_at  timestamp with time zone default now()
```

**Fábricas cadastradas (exemplos):** アラコ, FTS, FTS田原, イビデン, コベルク富士松, コベルクいなべ, マルヤス, 三菱, 三菱重工, TBKいなべ, TBSK高浜, タチエス安城, 豊臣本社, 豊臣いなべ, ビューテック, アルバイト名古屋 (lista cresce conforme novas vagas são publicadas)

> Os dropdowns de 工場 no dashboard e no form-candidato.html mostram apenas `ativo = true`.

### `profiles` — perfis de acesso ao CRM

```sql
id          uuid PK references auth.users(id)  -- vincula ao Supabase Auth
nome        text
jimusho     text        -- escritório (ex: 刈谷事務所)
fabricas    text[]      -- fábricas que gerencia ex: ["アラコ","FTS"]
role        text        -- admin | jimusho | tantousha | shokaisha
shokai_nome text        -- para role=shokaisha: nome na tabela shokaisha
created_at  timestamp
```

> Criada automaticamente via trigger quando usuário é criado no Auth. Role padrão: `tantousha`.

### `hiaringu` — ficha de ヒアリング por candidato

```sql
id                  uuid PK default gen_random_uuid()
candidate_id        uuid references candidates(id)
-- 面談情報
hiaringu_bi         date          -- ヒアリング日 (reflete em dt_kengaku)
nyusha_yotei_bi     date
mensadan_bi         date
mensadan_sha        text
-- 日本語力
jp_kaiwa            text          -- '4.0' | '3.0' | '2.5' | '2.0'
kanji_yomi          text          -- 読み書き | 読み | 読めない
hiragana_yomi       text
katakana_yomi       text
jp_comment          text
jp_hantei           text
-- 身体・健康
shiryoku_migi       text
shiryoku_hidari     text
megane_migi         text
megane_hidari       text
kikite              text          -- 右 | 左
kiourekki           text
shintai_hantei      text
-- タトゥー
tattoo_umu          text          -- あり | なし
tattoo_basho        text
tattoo_taiou        text
tattoo_hantei       text
-- 家族
doukyo_kazoku       text
doukyo_hantei       text
bekkyo_kazoku       text
bekkyo_hantei       text
-- 入社歴
nyusha_umu          text
nyusha_kigyo        text
nyusha_jiki         text
taisha_jiki         text
taisha_riyu         text
nyusha_hantei       text
-- 現職
genshoku_umu        text          -- あり | なし
genshoku_status     text
genshoku_taishoku   text
kyogo_status        text
-- 勤務条件
kotai_kinmu         text          -- 可 | 不可
kotai_keiken        text          -- あり | なし
zangyou_taiou       text
zangyou_jikan       text
kyujitsu_shukkin    text
kinmu_hantei        text
kinmu_comment       text
zangyou_mondai      text
hayai_shukkin       text
-- 住所・通勤
genzai_jusho        text          -- 現在住所
tsukin_houhou       text
tsukin_maker        text
tsukin_kyori        text
tsukin_jikan        text
mae_kyori           text
tsukin_hantei       text
-- 住居
jutaku_shurui       text
kyoju_nensu         text
genzai_yachin       integer
hikkoshi            text          -- 可 | 不可
-- 給与・動機
kyuyo_kibou_riyu    text
kyuyo_kokyo         text
obo_douki           text
-- 職歴①②③ (prefixo s1_, s2_, s3_)
s1_kaishi           text  -- yyyy-MM (input month)
s1_shuryo           text
s1_sha              text
s1_kinmuchi         text
s1_jikyu            integer
s1_sosshikyu        integer
s1_tedori           integer
s1_taisha           text
s1_naiyou           text
s1_taihen           text
s1_douki            text
s1_jutaku           text
s1_yachin           integer
-- (idem s2_* e s3_*)
created_at          timestamp with time zone default now()
```

> Uma linha por candidato. `hiaringu_bi` reflete automaticamente em `candidates.dt_kengaku` ao salvar (**não** marca mais `dt_naitei` automaticamente — 内定 passa a ser decisão manual do responsável, via modal ou botão 内定 na etapa 見学・ヒアリング済み do pipeline). `nyusha_yotei_bi` continua refletindo em `candidates.dt_nyusha`.

### `tantoushas` — DEPRECIADA

Será removida após todos os usuários migrarem para `profiles`.

### `shokaisha` — lista de 紹介者 por escritório

```sql
id          uuid PK
jimusho     text NOT NULL
nome        text NOT NULL
created_at  timestamp with time zone default now()
```

**Escritórios:** 刈谷事務所, 三重事務所, 豊橋事務所, 浜松事務所, 小牧事務所, 埼玉事務所

---

## Supabase — Políticas RLS

```sql
-- candidates
create policy "insert publico"   on candidates for insert with check (true);
create policy "select por cargo" on candidates for select using (...); -- filtro por role (admin/jimusho/tantousha/shokaisha)
create policy "update por cargo" on candidates for update using (
  admin
  OR (is_deleted = false AND (
    jimusho com fabrica no seu escritorio
    OR tantousha com fabrica/fabrica2 no seu array fabricas
  ))
); -- shokaisha SEM update; tantousha sem bypass por indicacao (mudou em 2026-08-08)
create policy "admin update all" on candidates for update using (...); -- admin

-- 2026-08-19: duas policies novas, ADITIVAS (Postgres combina policies permissivas com OR,
-- entao essas so ampliam o que ja existia, sem tocar nas de cima):
create policy "tantousha update proprios indicados" on candidates for update
  using (
    is_deleted = false
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'tantousha' and profiles.shokai_nome = candidates.shokai)
  )
  with check ( -- mesma condicao
    is_deleted = false
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'tantousha' and profiles.shokai_nome = candidates.shokai)
  );

create policy "shokaisha update proprios leads" on candidates for update
  using (
    is_deleted = false
    and origem in ('web','web_indicado','web_stock')
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'shokaisha' and profiles.shokai_nome = candidates.shokai)
  )
  with check ( -- mesma condicao
    is_deleted = false
    and origem in ('web','web_indicado','web_stock')
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'shokaisha' and profiles.shokai_nome = candidates.shokai)
  );

-- 2026-08-25: mesmo padrao das duas de cima, mas pra jimusho (SELECT + UPDATE, sem
-- restricao de origem). "select por cargo" original NUNCA teve clausula de shokai
-- pro bloco jimusho (so fabrica) — bug estrutural, nao erro de dado (nome bate
-- hash-a-hash em profiles/shokaisha/candidates). Sem a de SELECT, o navegador nem
-- recebia essas linhas do Supabase pra comecar, entao o filtro do frontend nunca
-- tinha o que mostrar.
create policy "jimusho select proprios indicados" on candidates for select
  using (
    is_deleted = false
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'jimusho' and profiles.shokai_nome = candidates.shokai)
  );

create policy "jimusho update proprios indicados" on candidates for update
  using (
    is_deleted = false
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'jimusho' and profiles.shokai_nome = candidates.shokai)
  )
  with check ( -- mesma condicao
    is_deleted = false
    and exists (select 1 from profiles where profiles.id = auth.uid()
      and profiles.role = 'jimusho' and profiles.shokai_nome = candidates.shokai)
  );

-- 2026-07-02: acesso anônimo (auth.uid() is null) REMOVIDO do select — só logados leem candidates
-- 2026-07-02: bug do filtro jimusho corrigido (era p.jimusho = p.jimusho, sempre true;
--             agora locations.jimusho = p.jimusho) no select e no update
-- 2026-08-08: "update por cargo" alterada — shokaisha perdeu UPDATE; tantousha perdeu o
--             bypass "OR shokai = p.shokai_nome" (só edita pela fabrica agora)
-- 2026-08-19: bypass por shokai VOLTA a existir, mas como policies aditivas separadas
--             (nao mexendo em "update por cargo") — ver acima. RLS nao restringe por
--             coluna, so por linha: a restricao de "shokaisha nao edita shokai/fabrica/
--             datas de pipeline" e garantida so no frontend (campos desabilitados no
--             modal), nao no banco. Alguem manipulando a API direto poderia mudar
--             qualquer coluna do proprio lead — risco aceito dado o contexto de baixo
--             volume e parceiros de confianca.

-- app_settings (persistência do server.js)
-- RLS ativado SEM políticas — só o service role (SUPABASE_SERVICE_KEY) acessa

-- profiles
create policy "ver proprio perfil" on profiles for select using (auth.uid() = id);

-- shokaisha
create policy "leitura publica" on shokaisha for select using (true);

-- locations
create policy "leitura publica" on locations for select using (true);
-- 2026-08-21: duas policies de UPDATE adicionadas (antes so tinha select).
-- Necessarias pra barra #fabricaOrderBar (steppers de order_atual/naitei_atual por fabrica).
create policy "jimusho admin update locations" on locations for update
  using (exists (select 1 from profiles where profiles.id = auth.uid()
    and (profiles.role = 'admin' or (profiles.role = 'jimusho' and profiles.jimusho = locations.jimusho))))
  with check (exists (select 1 from profiles where profiles.id = auth.uid()
    and (profiles.role = 'admin' or (profiles.role = 'jimusho' and profiles.jimusho = locations.jimusho))));

create policy "tantousha update propria fabrica locations" on locations for update
  using (exists (select 1 from profiles where profiles.id = auth.uid()
    and profiles.role = 'tantousha' and locations.nome = any(profiles.fabricas)))
  with check (exists (select 1 from profiles where profiles.id = auth.uid()
    and profiles.role = 'tantousha' and locations.nome = any(profiles.fabricas)));

-- hiaringu
create policy "authenticated insert" on hiaringu for insert to authenticated with check (true);
create policy "authenticated update" on hiaringu for update to authenticated using (true);
create policy "authenticated select" on hiaringu for select to authenticated using (true);
```

---

## Pipeline de Recrutamento

### Fluxo principal

```
応募日 → 対応中 → 面接日 → 見学日 → 内定 → 入社
```

### Etapas laterais

| Etapa | Tipo | Descrição |
|-------|------|-----------|
| ストック | Espera | Aprovado, sem vaga. Retorna quando abrir vaga. |
| NG | Saída negativa | Reprovado ou desistiu |
| ブラック | Flag booleana | Candidato problemático — NÃO é etapa, é marcação permanente |

### Lógica de etapa atual (JavaScript)

A etapa atual é determinada pela última data preenchida:
```
is_blacklisted → black
dt_ng          → ng
dt_stock       → stock
dt_nyusha (mês anterior ao atual) → zaiseki
dt_nyusha (mês atual ou anterior, ≤ hoje) → nyusha
dt_naitei      → naitei
dt_kengaku     → kengaku
dt_mensetsu    → mensetsu
dt_taiochu     → taiochu
(nenhuma)      → renrakumae
```

**在籍 (zaiseki):** calculado automaticamente — quando `dt_nyusha` cai em um mês anterior ao mês corrente, o candidato deixa de aparecer em 入社 e passa a aparecer em 在籍 (sem precisar de ação manual, basta o mês virar). Cada linha de 在籍 tem um botão **退社** que seta `dt_stock_geral = hoje`, movendo o candidato para 全体ストック.

### Soft Delete

Candidatos não são apagados — `is_deleted = true` os oculta do dashboard. Dados preservados no Supabase.

O delete usa a função RPC `deletar_candidato` (SECURITY DEFINER) para contornar limitações de RLS:
```sql
-- Já criada no Supabase
select deletar_candidato('uuid-do-candidato');
```

### Campo `origem` — separação de fluxos

| Valor | Origem | Aparece em |
|-------|--------|-----------|
| `indicado` | form-candidato.html (interno) | Pipeline principal |
| `web` | form-vaga.html (WordPress) | Leads do Site (admin) |
| `web_indicado` | Lead promovido pelo admin | Pipeline principal |
| `web_stock` | Lead movido para stock pool | ストック Pool |

### Etapa 見学

Renomeada para **見学・ヒアリング済み** em toda a interface (pipeline, filtros, calendário, funil).

---

## Formulário Público (`form-vaga.html`)

Formulário em **português** embutido no WordPress via Elementor HTML widget — o **código é colado manualmente** no widget, não é carregado dinamicamente do Railway. Toda vez que o arquivo muda no repositório, alguém precisa copiar o conteúdo atualizado e colar de novo no Elementor (viu-se na prática em 2026-08-19 que só editar um "template dinâmico" no Elementor não bastou — cada post de vaga acabou precisando da colagem individual).
Ao submeter, grava no Supabase com `origem = 'web'` e **em seguida** chama `POST https://crm-recrutamento-production.up.railway.app/api/google-contact`.

### Detecção automática de fábrica

1. Campo oculto WPForms `form_fields[pagina]` (preenche automaticamente no post dinâmico da vaga)
2. Body class WordPress `fabrica-xxx` (taxonomy)
3. URL param `?fabrica=`

### Link de afiliado por shokaisha (`?ref=`) — adicionado 2026-08-19

- Se a URL da página tiver `?ref=<nome-do-shokaisha>` (nome precisa bater **exatamente** com `shokaisha.nome`/`profiles.shokai_nome`), o formulário usa esse valor como `shokai` no cadastro, em vez do padrão fixo `ヒューマンシステム（西留）`.
- O valor também é salvo num **cookie** (`shokai_ref`, 90 dias, `path=/`) assim que a página carrega — cobre o caso de alguém compartilhar um link geral (ex: a home) e a pessoa navegar até uma vaga específica sem `?ref=` na URL daquela página.
- Atribuição é **last-touch**: se a pessoa clicar em outro link de afiliado depois, o `ref` mais recente sobrescreve o cookie (decisão consciente do Eder, não first-touch).
- Mesma lógica implementada em `form-vaga-ig.html`.
- **Página com senha (`link-afiliado.html`)**: gera esse link pra quem ainda não tem login no CRM — mas a decisão atual é só usar isso como transição; o caminho oficial é a aba 紹介リンク do dashboard (ver abaixo), pra forçar a criação de login individual de todos.

### Endpoint `/api/google-contact` (server.js)

Recebe o payload do candidato e executa **em paralelo**:
1. **Google Contacts** — cria contato via People API com nome, telefone, nascimento, endereço e demais campos nas observações
2. **Telegram** — envia mensagem formatada em japonês para o grupo configurado

### Mensagem Telegram

```
お疲れ様です。
{fabrica}向け

紹介：ヒューマンシステム（西留）
氏名：{nome}
電話番号：{telefone}
〒：{cep}
住所：{prefecture} / {city}
生年月日：{YYYY年M月D日}
年齢：{idade}
性別：Man/Woman
国籍：{nacionalidade}
ビザ：{visa em inglês}
日本語力：{nivel}
ひらがな：Reading and Writing / Reading only / Cannot
カタカナ：...
免許：{habilitações em inglês}
経験：{experiência em inglês}
アパート必要：Yes/No
現在仕事中：Yes/No/Part-time

よろしくお願いします。
```

---

## Formulário de Cadastro (`form-candidato.html`)

### Campos obrigatórios (\*)

事務所, 紹介者, 工場, 氏名, 電話番号, 都道府県, 市区町村, 年齢, 性別, 国籍, ビザ

### Todos os campos

| Campo | Tipo | Observação |
|-------|------|-----------|
| 事務所 | Select dinâmico | Carrega de `shokaisha` table |
| 紹介者 | Select dinâmico | Filtrado por 事務所 selecionada |
| 工場 | Select dinâmico | Carrega de `locations` table |
| 面接日 | Date | Opcional |
| 面接時間 | Time | Opcional |
| 氏名 | Text | Obrigatório |
| 電話番号 | Tel | Obrigatório |
| 〒 | Text | Opcional |
| 都道府県 | Text | Obrigatório |
| 市区町村 | Text | Obrigatório |
| 年齢 | Number | Obrigatório |
| 性別 | Select | 男性/女性/その他 |
| 生年月日 | Date | Opcional |
| 国籍 | Text | Obrigatório |
| ビザ | Select | 7 opções |
| アパート必要 | Select | 必要/不要 |
| 引越し可能か | Select | 可能/不可 |
| 車の所有 | Select | あり/なし |
| 現在仕事中 | Select | 在職中/離職中/アルバイト中/退職予定 |
| 可能な直 | Checkbox múltiplo | 二交代/早番遅番/二直三班/昼勤のみ |
| 免許・資格 | Checkbox múltiplo | 7 opções |
| 工場経験 | Checkbox múltiplo | 17 opções |
| 日本語力 | Select | 0%〜N1 (6 opções) |
| ひらがな | Select | 3 níveis |
| カタカナ | Select | 3 níveis |
| 英語会話 | Select | できる/できない |
| コメント | Textarea | Opcional |

### Mensagem sucesso após envio

```
✅ 登録が完了しました。
ありがとうございます！
候補者情報が正常に登録されました。
```

---

## Dashboard (`dashboard.html`)

### Abas

| Aba | Visível para | Função |
|-----|-------------|--------|
| 状況 | Todos | Pipeline principal de candidatos (origem `indicado` + `web_indicado`) |
| カレンダー | Todos | Grid mensal (desktop) / Agenda lista (mobile) |
| グラフ | Todos | Gráficos Tier 1 |
| Leads do Site | `admin` (só `shokai='ヒューマンシステム（西留）'`) + qualquer perfil com `shokai_nome` (só os próprios) | Mini-pipeline de leads do formulário WordPress — ver seção própria abaixo |
| 🔗 紹介リンク | Qualquer perfil com `shokai_nome` preenchido | Gera o link de afiliado de cada vaga (`locations.link_divulgacao + ?ref=<nome>`), com botões Copiar/Compartilhar (adicionado 2026-08-19) |
| ストック Pool | Todos | Candidatos em ストック disponíveis para tantoushas reivindicarem |
| `<escritório>`まとめ | `role = jimusho` (o próprio) e `role = admin` (escolhe qualquer um, um de cada vez) | Área agregada de todas as fábricas do escritório — ver seção própria abaixo |
| オーダー状況 | `role = jimusho` (próprio escritório) e `role = admin` (todos, separados) | **Aba no topbar** (junto de 状況/カレンダー/グラフ, não na sidebar) — visão só-leitura de オーダー/内定 por fábrica + stats + funil + agenda — ver seção própria abaixo |

Também na sidebar: link direto **候補者登録** (sem ícone) apontando pra `https://jobs-human.com/cadastro/` (abre em nova aba, visível pra todos) — adicionado 2026-08-19.

### Sidebar

- Lista de fábricas com contagem
- Clicar filtra **todas as abas** simultaneamente (状況 + カレンダー + グラフ)
- Mobile: escondida, abre via botão ☰
- **Admin:** vê TODAS as fábricas cadastradas em `locations` (inclusive `ativo = false` e com 0 candidatos) — usa `todasFabricas` direto, sem derivar dos candidatos
- **Demais perfis (jimusho/tantousha/shokaisha):** veem só as fábricas que têm pelo menos 1 candidato (lista derivada de `todosOsCandidatos`)
- Mesma regra de admin vale para os dropdowns de seleção de fábrica no modal/filtros — `carregarDados()` só aplica `.eq('ativo', true)` na query de `locations` quando o perfil NÃO é admin
- `carregarDados()` desde 2026-08-19 também traz `jimusho` junto do nome de cada `locations` (`todasLocations`, não só `todasFabricas`), necessário pro escopo do 事務所まとめ

### `<escritório>`まとめ — adicionado 2026-08-19

- Botão na sidebar pra `role = jimusho`, rotulado dinamicamente com `profiles.jimusho` (ex: "小牧事務所まとめ") — chama `filtrarJimushoMatome(null, this)`, que usa o próprio escritório do perfil
- **Admin (2026-08-21)**: lista `#sidebarJimushos` com um item por escritório distinto (derivado de `todasLocations`), cada um chamando `filtrarJimushoMatome('<nome>', this)` — vê um de cada vez, igual clicar numa fábrica específica
- Diferente do "全体": o "全体" de uma conta jimusho não é limpo só pro escritório dela — também traz candidatos que ela indicou pessoalmente (`shokai` batendo) mesmo que a fábrica seja de outro escritório. O まとめ filtra estritamente por fábrica pertencente ao escritório escolhido, via `jimushoAtivo` + `jimushoAtivoNome` (variáveis globais — `jimushoAtivoNome` guarda QUAL escritório, necessário desde que admin passou a poder escolher entre vários) + `fabricasDoMeuJimusho()`
- Funciona como os outros filtros de sidebar (fábrica, マイ紹介): define o escopo e as abas 状況/カレンダー/グラフ existentes passam a refletir — não é uma tela nova
- `getFiltrados()` (pipeline/stats/gráficos) e `renderCalendar()` (que tinha sua própria filtragem separada, não usava `getFiltrados()`) foram ajustados pra respeitar esse escopo
- Rótulos de PDF/Excel exportado e o dropdown de fábrica do calendário/gráfico mostram o nome do escritório (ex: "小牧事務所（全工場）") em vez do genérico "全工場"/"全体" nesse modo (`labelFiltroAtivo()`, `atualizarLabelFiltroFabrica()`)
- Por enquanto sem quebra por fábrica dentro da visão (é um total consolidado do escritório) — quebra fica pra decidir depois

### Barra de stats

総候補者 | 連絡前 | 対応中 | 面接 | 見学・ヒアリング済み | 内定 | 入社 | 在籍 | ストック | NG

### Painel 状況

- Candidatos agrupados por etapa com cores
- Colunas: 氏名 | 紹介者 | 電話番号 | 工場 | 国籍 | 性別 | 日本語 | 経過
- 経過 = dias na etapa atual (vermelho após 7 dias)
- Paginação: 5 por etapa + "Ver mais"
- Botão ステージ ▾ para mostrar/esconder etapas específicas (inclui 在籍)
- Botão 詳細フィルター → painel slide-in com filtros avançados (inclui 在籍)
- Botão PDF印刷 → abre nova aba com lista para imprimir

**Colunas extras por etapa:**
| Etapa | Colunas extras | Ações inline |
|-------|----------------|---------------|
| 内定 / 入社 | 入社日 | — |
| 見学・ヒアリング済み | 見学日, 入社日 (se já preenchido via ヒアリング) | botões **NG** e **内定** (setam `dt_ng`/`dt_naitei = hoje`, sem abrir modal) |
| 在籍 | 入社日 | botão **退社** (seta `dt_stock_geral = hoje`, move p/ 全体ストック) |

Ordenação especial: 見学・ヒアリング済み por `dt_kengaku` decrescente (mais recente em cima); 内定/入社/在籍 por `dt_nyusha` crescente.

### Filtros disponíveis

**Topbar (duas linhas desde 2026-08-25):** linha 1 = título/versão, abas (状況/カレンダー/グラフ/オーダー状況), 登録日/性別/年齢上限/日本語, ステージ▾, 詳細フィルター, usuário/logout; linha 2 = busca + PDF印刷/項目選択印刷/Excel出力/更新

Busca (氏名/電話/**番号**, desde 2026-08-25 — antes só nome e telefone), 性別, 年齢上限, 日本語レベル. Campo de busca com estilo destacado (borda laranja, placeholder com 🔍) pra ser fácil de achar.

**詳細フィルター (painel):**
日本語レベル, 年齢上限, 状況, 住居, 就業状況, 性別, 国籍, 都道府県, 可能な直, 引越し, 免許・資格, 工場経験

### Modal de candidato

- Abre ao clicar em qualquer candidato
- Título: `氏名 (電話番号)`
- Seções: 基本情報, 仕事情報, スキル, パイプライン日付 (com botão 今日, inclui 紹介日 desde 2026-08-19), アラート・メモ, ブラックリスト
- Botão 保存 → salva no Supabase
- Botão 削除 → soft delete (oculta, não apaga) — só aparece em modo de edição completa (`podeEditar`), não no modo parcial
- **Edição parcial (2026-08-19)**: quem tem `shokai_nome` batendo com o candidato (e ele ainda em Leads do Site) vê o modal parcialmente editável — 保存 aparece, mas 削除 não, e os campos travados (mesmo com o modal "editável") são: `紹介者`, `工場`, `工場２`, todas as datas de `パイプライン日付`, ブラックリスト, `アラート`, `担当者コメント`

### Leads do Site

Pipeline separado para candidatos com `origem` em `web`/`web_indicado`/`web_stock`. Etapas:

| Etapa | Chave | Descrição |
|-------|-------|-----------|
| 連絡前 | renrakumae | Recém cadastrado, ainda não contactado |
| 担当者紹介 | indicado | Enviado para fábrica (`origem = 'web_indicado'`) |
| ストック | stock | Movido para pool (`origem = 'web_stock'`) |
| NG | ng | `dt_ng` preenchido |
| ブラック | black | `is_blacklisted = true` |

**Visibilidade (mudou em 2026-08-19)**:
- `admin`: vê só os leads onde `shokai = 'ヒューマンシステム（西留）'` (o valor genérico, sem shokaisha específico atribuído) — cada shokaisha/tantousha já acompanha os próprios leads na própria tela, então o admin fica só com o "pool geral"
- Qualquer perfil com `shokai_nome`: vê só os leads onde `shokai` bate com o próprio nome
- Função `shokaiFiltroLeads()` centraliza essa regra (admin → valor fixo; outros → `currentProfile.shokai_nome`)
- **`jimusho` só funcionou de verdade a partir de 2026-08-25** — a lógica do frontend já existia desde 2026-08-19, mas faltava a policy de SELECT no banco pro cargo `jimusho` considerar `shokai` (só considerava `fabrica`); o usuário via a aba normalmente, sem erro, só que sempre vazia (ver Políticas RLS acima)

**Ações (`podeAgirLeads()`, admin/tantousha/jimusho — `jimusho` incluído em 2026-08-21)**: **担当者紹介** (`enviarParaFabrica`) → move pro pipeline principal, mantendo a fábrica já detectada do site (sem popup de escolha — tentativa anterior de deixar escolher a fábrica foi revertida no mesmo dia por ser redundante) e grava `dt_shokai = hoje` | **ストック** → move pro pool | **NG** | **ブラック**. `shokaisha` não vê esses botões — só o status.

Colunas da tabela: 氏名 | 電話番号 | 工場 | 都道府県 (Estado) | 市区町村 (Cidade) | 性別 | 年齢 | 日本語 | Ações — **Visto removido**, substituído por Estado e Cidade.

### 🔗 紹介リンク (Link de Vagas) — adicionado 2026-08-19

- Aparece na sidebar pra qualquer perfil com `shokai_nome` preenchido (`btnVagasLinkTab`)
- Lista as fábricas de `locations` com `link_divulgacao` preenchido e `ativo = true`; as sem link não aparecem
- Cada card tem botões **Copiar** e **Compartilhar** (Web Share API quando disponível) gerando `link_divulgacao + ?ref=<shokai_nome do usuário logado>` — sem select, sem digitar nada, o nome já vem do login
- Não mostra imagem no card: decisão foi confiar no `og:image` que as páginas de vaga já têm — WhatsApp/LINE geram o preview com foto sozinhos ao compartilhar o link puro, sem precisar guardar imagem no Supabase (nota: a página encontrada em 2026-08-19 tinha **duas tags og:image conflitantes** — vale confirmar se o site foi corrigido)
- Clicar numa fábrica ou em マイ紹介 enquanto nessa aba volta sozinho pro painel 状況 (helper `voltarParaPipelineSeNecessario()`, usado também pelas abas Leads do Site e 全体ストック)

### ストック Pool (aba todos)

Lista de candidatos com `origem = 'web_stock'`. Tantoushas podem clicar em **Atribuir para fábrica** → seleciona a fábrica → move para pipeline principal com `origem = 'indicado'`.

### Calendário

- **Desktop:** grade mensal tradicional
- **Mobile:** vista agenda cronológica (só dias com eventos), e **desde 2026-08-21 só a partir de ontem em diante** (dias já passados do mês ficam escondidos, pra não precisar rolar por eventos antigos) — grade do desktop continua mostrando o mês inteiro
- Filtro por fábrica (sincronizado com sidebar)
- Toggle de tipos: ● 面接 ● 見学・ヒアリング済み ● 入社 ● アラート
- Clicar em evento abre modal do candidato
- Card de 面接 na agenda mobile mostra o **horário** junto do chip (ex: "面接 14:00") — adicionado 2026-08-21
- Nova aba **オーダー状況** (2026-08-21), no **topbar** (junto de 状況/カレンダー/グラフ — não é item de sidebar), pra `role = jimusho` (só o próprio escritório) e `role = admin` (todos os escritórios, separados por seção): mostra `locations.order_atual`/`naitei_atual` (colunas novas, **ambas manuais** — decisão consciente do Eder, um 内定 recente pode ser de uma オーダー anterior, então contagem automática ia distorcer o número) por fábrica, com anel de progresso (conic-gradient). **Só leitura aqui** — só mostra fábrica com `order_atual > 0`, ordenado por quem está mais longe de bater a meta
  - Também traz: stats do escritório (稼働中, アラート pendente, candidatos parados há 7+ dias, taxas de conversão), funil consolidado (barras por etapa) e agenda dos próximos 14 dias (2 colunas no desktop, 1 no mobile) — tudo calculado a partir de `candidates`, escopado às fábricas do escritório (`candidatosDoEscritorio()`)
  - Suporta claro e escuro (`--ordst-*` custom properties no `body`, trocam de valor em `body.dark-mode`) — inspirado numa referência visual que o Eder trouxe (dashboard tipo "sala de controle", anéis e barras de progresso)
  - **Edição fica em outro lugar**: barra `#fabricaOrderBar` (abaixo do topbar, estilo parecido com `#alertBar`) aparece quando o **工場別** da sidebar filtra pra **uma fábrica específica**, com steppers +/− pra オーダー e 内定 daquela fábrica. Só aparece pra quem gerencia aquela fábrica (`podeEditarOrderFabrica()`): admin sempre, jimusho se a fábrica é do próprio escritório, tantousha se a fábrica está no próprio `profiles.fabricas`
  - Depende de duas policies de UPDATE em `locations` (antes só tinha select): `jimusho admin update locations` e `tantousha update propria fabrica locations` (2026-08-21, tantousha só a(s) própria(s) fábrica(s))
- Fábrica na agenda mobile também vira chip colorido (mesmo estilo dos chips de tipo de evento) — cor varia entre fábricas do **mesmo escritório**, pode repetir entre escritórios diferentes. Cores atribuídas automaticamente (`corDaFabrica()`, paleta fixa de 10 cores, sem precisar cadastrar nada) — adicionado 2026-08-21
- Botão 更新 (`carregarDados()`) volta a aparecer no mobile — estava escondido de propósito antes (regra pré-existente ao trabalho recente), removido a pedido do Eder em 2026-08-21

### Gráficos (aba グラフ)

- Filtro por fábrica no topo
- 4 cards de taxa de conversão: total, 応募→面接, 面接→内定, 内定→入社
- Funil de recrutamento (barras horizontais por etapa, 10 etapas incluindo 在籍)
- Candidatos por fábrica (barras verticais — some ao filtrar por fábrica)
- Entradas por mês (linha)
- Ranking 紹介者 (barras horizontais **empilhadas**, redesenhado em 2026-08-21): em vez das 10 etapas soltas do funil, agrupa em **4 categorias** — 🔵進行中 (連絡前+対応中+面接+見学ヒアリング), 🟢成約 (内定+入社+在籍), 🟡ストック, 🔴NG・ブラック (NG+ブラック). Objetivo: menos poluído visualmente, mais direto pra avaliar qualidade de indicação de cada shokaisha

### PDF印刷

Colunas: 氏名 | 電話番号 | 工場 | 紹介者 | 日本語 | 都道府県 | 市区町村
Agrupado por etapa. Respeita filtros ativos.

### Layout Mobile (≤768px)

- Sidebar: drawer via botão ☰
- Topbar: busca + botão フィルター
- Lista: 3 colunas (氏名, 電話, 経過) — agrupamento por etapa mantido
- Navegação: bottom nav (状況 | カレンダー | グラフ | フィルター)
- Modal: sobe da parte inferior, ocupa 92vh
- Calendário: vista agenda (lista cronológica)
- **PDF印刷 / 項目選択印刷 / Excel出力 ficam escondidos** (classe `.btn-print-export`) — não fazem sentido no layout compacto (2026-08-21)
- **Botões de ação embutidos no pipeline** (対応中/面接/NG/ストック etc., variantes `showActions4`/`showActions3`) e **os de "Leads do Site"** (対応中/担当者紹介/ストック/NG/Bloquear): linha empilha (nome em cima, telefone/fábrica do lado, ações ocupando a largura toda embaixo) em vez de espremer tudo na grade fixa de colunas do desktop — sem isso os botões ficavam fora da tela ou empilhados verticalmente numa coluna estreita (2026-08-21)

### Modo escuro e visualização mobile forçada — adicionados 2026-08-21

Dois toggles novos na sidebar, seção "表示設定":

- **ダークモード**: alterna `body.dark-mode`, salvo em `localStorage` (`theme`). Cobre fundo, textos, tabelas, cards, modal, filtros, calendário e as cores do Chart.js (`Chart.defaults.color`/`borderColor` setados no início de `renderCharts()`). **Impressão em PDF continua sempre clara**, de propósito. Sidebar já era escura e não muda com o toggle.
- **モバイル表示**: só aparece em tela de PC (`window.innerWidth > 768`). Alterna `body.force-mobile`, salvo em `localStorage` (`layout`) — aplica as mesmas regras do breakpoint automático `@media(max-width:768px)`, mas via classe, então funciona em qualquer largura de tela.
  - `#main` fica com **420px centralizado** (fundo neutro `#2b2b38` nas laterais), simulando uma tela de celular de verdade em vez de esticar o layout mobile na largura toda do navegador
  - Drawer da sidebar, painel de 詳細フィルター e o bottom nav são `position:fixed` relativos à **borda real do navegador**, não à tela centralizada — todos precisaram de `left`/`right: calc(50% - 210px)` pra se alinharem com a "tela de celular" em vez de ficarem esticados/desalinhados
  - Botão **"PC表示に戻る"** aparece no topbar (do lado do ☰) só nesse modo, pra não precisar abrir o drawer só pra voltar
  - `filtrarFabrica` (fechamento automático do drawer ao escolher fábrica) precisou considerar `force-mobile` além da largura real da tela (`window.innerWidth <= 768`)

---

## Deploy — Railway

**Auto-deploy:** push para `main` no GitHub → Railway rebuilda automaticamente

**Para atualizar o CRM:**
```bash
cd c:\projetos\xquads\crm-recrutamento
git add .
git commit -m "descrição da mudança"
git push
```

**Variáveis de ambiente no Railway:**

| Variável | Descrição |
|----------|-----------|
| `GOOGLE_CLIENT_ID` | OAuth client ID do projeto "Human Piotnet integration" |
| `GOOGLE_CLIENT_SECRET` | OAuth client secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token com escopo `auth/contacts` |
| `TELEGRAM_BOT_TOKEN` | Token do bot Telegram para notificações |
| `TELEGRAM_CHAT_ID` | ID do grupo/canal que recebe as notificações (valor em `chaves-locais.md`) |
| `SUPABASE_SERVICE_KEY` | Service role key do Supabase — usada pelo server.js para ler/gravar `app_settings` |

**Tabela `app_settings` (Supabase):** guarda o refresh token do Google renovado via `/reauth` e o timestamp do lembrete, para sobreviver a redeploys. RLS ativado SEM políticas — só o service role acessa. Chaves usadas: `google_refresh_token`, `token_renewed_at`.

**Para testar localmente:**
```bash
cd c:\projetos\xquads\crm-recrutamento
npm install
node server.js
# acessa http://localhost:4000
```

---

## Tarefa Pendente — Notificação LINE (9h e 13h JST)

**Status:** Planejado, aguardando execução. Setup do canal LINE já concluído.

### Objetivo
Enviar notificação automática às **9:00 e 13:00 JST** (00:00 e 04:00 UTC) com o resumo de candidatos cadastrados via `form-candidato.html` (`origem = 'indicado'`), agrupados por `fabrica`.

### Regras
- Considerar apenas candidatos com `origem = 'indicado'` criados **desde a última notificação**:
  - Disparo das 9:00 JST → candidatos criados desde as 13:00 JST do dia anterior
  - Disparo das 13:00 JST → candidatos criados desde as 9:00 JST do mesmo dia
- Agrupar por `fabrica`, contar quantos por fábrica
- **Se não houver nenhum candidato novo, não enviar mensagem**
- Formato da mensagem:
```
新情報が入りました。

三菱: 2名
フジトランス: 3名
アラコ: 1名

各担当者はご確認ください。
```

### Credenciais já obtidas (canal "通知" no provider "Eder")
- Salvas localmente em `chaves-locais.md` (arquivo NÃO versionado, só no PC do Eder)
- ⚠️ O Channel Access Token foi exposto no histórico do git — **regenerar no LINE Developers Console antes de usar**

### Destino da notificação
- **Decidido:** enviar para um **grupo do LINE** (não para o User ID pessoal)
- Para isso falta:
  1. Habilitar **"Allow bot to join group chats"** no LINE Developers Console (estava "Disabled")
  2. Configurar webhook no Railway (`/api/line-webhook`) para capturar o `groupId` quando o bot `@207sktgh` for adicionado ao grupo
  3. Criar o grupo no LINE e adicionar o bot
  4. Salvar o `groupId` capturado como variável de ambiente

- **Estratégia de implementação combinada:** implementar e testar primeiro enviando para o **User ID pessoal** (já disponível), validar a lógica de agrupamento/horários, e só depois trocar o destino para o `groupId` do grupo (quando webhook estiver configurado).

### Implementação técnica planejada
- Adicionar dependências: `node-cron` (agendamento) e `dotenv` (variáveis locais)
- Criar `.env` local (gitignored) espelhando as variáveis do Railway, para testar localmente
- Adicionar endpoint manual `/api/test-line-notify` para disparar a notificação sob demanda (sem esperar 9h/13h), funciona local e no Railway
- Função `sendLineMessage(to, text)` usando `https://api.line.me/v2/bot/message/push` com header `Authorization: Bearer <CHANNEL_ACCESS_TOKEN>`
- Query Supabase REST: `candidates?origem=eq.indicado&created_at=gte.<ISO>&select=fabrica`
- Novas variáveis de ambiente no Railway: `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_USER_ID` (depois trocar/complementar com `LINE_GROUP_ID`)

### Limite do plano gratuito LINE
200 mensagens push grátis/mês. Em grupo, cada envio conta 1x por membro do grupo (ex: grupo de 5 pessoas × 2 disparos/dia × 30 dias = até 300/mês — pode estourar dependendo do tamanho do grupo).

---

## Histórico de Decisões

| Data | Decisão |
|------|---------|
| 2026-06-01 | Projeto iniciado. Stack: WordPress (público) + HTML/JS + Supabase |
| 2026-06-01 | Pipeline definido: 応募日→対応中→面接日→見学日→内定→入社 + ストック/NG/ブラック |
| 2026-06-01 | ブラック = flag booleana, não etapa. Candidato não tem login. |
| 2026-06-01 | Schema flat: todas as datas do pipeline na tabela candidates |
| 2026-06-01 | Formulário de cadastro criado em japonês com Supabase direto |
| 2026-06-01 | 可能な直 mudado para text[] (múltipla escolha) |
| 2026-06-01 | furigana removido do formulário e banco |
| 2026-06-01 | Stack de deploy alterada: Express + Railway (em vez de Next.js + Vercel) |
| 2026-06-02 | Dashboard completo: pipeline, calendário, gráficos |
| 2026-06-02 | Soft delete implementado (is_deleted = true) |
| 2026-06-02 | Layout mobile responsivo com bottom nav |
| 2026-06-02 | Calendário: grid no desktop, agenda no mobile |
| 2026-06-02 | locations.estado adicionado para registrar estado da fábrica |
| 2026-06-04 | Supabase Auth implementado — login individual por email/senha |
| 2026-06-04 | Tabela `profiles` criada com trigger automático de criação |
| 2026-06-04 | RLS por cargo: admin / jimusho / tantousha / shokaisha |
| 2026-06-04 | locations.jimusho adicionado — vincula fábrica ao escritório |
| 2026-06-04 | Express simplificado — senha removida, auth via Supabase |
| 2026-06-04 | Bug de fuso horário JST corrigido no calendário |
| 2026-06-04 | Botões 📞 電話 e 💬 WhatsApp adicionados no modal do candidato |
| 2026-06-04 | Formulário: tela de senha 0246 + popup de sucesso após cadastro |
| 2026-06-08 | Tabela `hiaringu` documentada — ficha de ヒアリング por candidato |
| 2026-06-08 | RLS da tabela `hiaringu` configurado (authenticated insert/update/select) |
| 2026-06-08 | Bug corrigido: botão さらに não expandia (estado perdido no re-render) |
| 2026-06-08 | Bug corrigido: selects do hiaringu sem value explícito não pré-selecionavam ao recarregar |
| 2026-06-09 | form-vaga.html criado — formulário público português no WordPress para captura de leads |
| 2026-06-09 | Campo `origem` adicionado — separa leads web do pipeline principal |
| 2026-06-09 | Pipeline "Leads do Site" criado (admin only) com etapas: 連絡前/担当者紹介/ストック/NG/ブラック |
| 2026-06-09 | ストック Pool criado — aba visível para todos os roles para reivindicar candidatos |
| 2026-06-09 | Integração Google Contacts — cria contato automático ao receber lead do form-vaga.html |
| 2026-06-09 | Integração Telegram — notificação automática formatada ao receber lead |
| 2026-06-09 | Função RPC `deletar_candidato` (SECURITY DEFINER) — contorna limitação de RLS no soft delete |
| 2026-06-09 | 見学 renomeado para 見学・ヒアリング済み em toda a interface |
| 2026-06-09 | Coluna `ativo` adicionada em `locations` — filtra fábricas inativas dos dropdowns |
| 2026-06-09 | 工場 e 工場２ no modal alterados de input texto para select (fábricas ativas da tabela locations) |
| 2026-06-10 | Canal LINE Messaging API "通知" criado (provider Eder) — credenciais salvas, notificação 9h/13h planejada para depois |
| 2026-06-10 | ヒアリングシート: campo `genzai_jusho` (現在住所) adicionado em 住所・通勤 (1ª pergunta) — coluna criada no Supabase |
| 2026-06-10 | ヒアリングシート: rodapé de impressão com nome do candidato (fixo em todas as páginas) e seção その他のコメント (caixa em branco, não persiste) adicionados |
| 2026-06-18 | Etapa 在籍 criada — calculada automaticamente quando `dt_nyusha` cai em mês anterior ao atual; botão 退社 move candidato para 全体ストック |
| 2026-06-18 | 見学・ヒアリング済み: coluna 見学日 adicionada (ordenado por mais recente), coluna 入社日 (quando já preenchida via ヒアリング) e botões inline NG/内定 |
| 2026-06-18 | Leads do Site: coluna Visto substituída por Estado e Cidade |
| 2026-06-18 | Admin passa a ver TODAS as fábricas (inclusive `ativo=false` e sem candidato) na sidebar e nos dropdowns; demais perfis continuam só com `ativo=true` e/ou com candidato |
| 2026-06-18 | hiaringu.html: `hiaringu_bi` deixou de marcar `dt_naitei` automaticamente — só reflete em `dt_kengaku`. 内定 agora é decisão manual |
| 2026-07-01 | hiaringu.html: layout de impressão 4 colunas (pergunta\|resposta\|pergunta\|resposta), textareas e labels longos em largura total |
| 2026-07-02 | Credenciais sensíveis removidas do cerebro.md → `chaves-locais.md` (gitignored, só no PC do Eder) |
| 2026-07-02 | Tabela `app_settings` criada — token do /reauth e timestamp do lembrete persistem entre deploys (env `SUPABASE_SERVICE_KEY` no Railway) |
| 2026-07-02 | RLS candidates: acesso anônimo removido do select; bug do filtro jimusho (`p.jimusho = p.jimusho`) corrigido no select e update |
| 2026-07-02 | dashboard.html separado em dashboard.html + dashboard.css + dashboard.js (split mecânico, sem mudança de código) |
| 2026-08-08 | Controle de acesso: shokaisha perde permissão de editar (RLS + frontend `podeEditar()`); tantousha só edita as próprias fábricas (perdeu bypass por indicação) |
| 2026-08-08 | `numero_cadastro` criado em `candidates` — número sequencial único, gerado automaticamente via sequence, exibido antes do nome em todas as etapas do pipeline |
| 2026-08-08 | Etapa 面接 passa a ordenar por `dt_mensetsu` + `mensetsu_hora` (mais próximo no topo; sem data vai para o final) |
| 2026-08-08 | PDF impresso (`imprimirPDF`): colunas 年齢, 性別 (男/女) e 登録日 adicionadas |
| 2026-08-08 | Seleção de candidatos para impressão: checkbox por candidato + checkbox de "selecionar tudo" no cabeçalho de cada etapa (substituiu os antigos botões globais 全選択/選択解除) |
| 2026-08-08 | Botão 項目選択印刷 criado — modal para escolher quais campos aparecem no PDF e em que ordem (ordem = ordem de clique), campos agrupados por categoria (基本情報, 仕事情報, スキル, パイプライン日付, アラート・メモ, ブラックリスト) |
| 2026-08-08 | Sistema de versão implantado: badge `vX.XX` no canto superior do dashboard + tag do git correspondente a cada versão publicada (permite reverter pro estado exato de qualquer versão) |
| 2026-08-19 | Link de afiliado por shokaisha: `?ref=` capturado em form-vaga.html/form-vaga-ig.html (cookie 90 dias, last-touch), grava em `candidates.shokai` no lugar do valor fixo `ヒューマンシステム（西留）` |
| 2026-08-19 | `link-afiliado.html` criado (página com senha `0246` pra gerar link sem precisar de login) — depois descontinuado a favor da aba 紹介リンク no dashboard, que exige login individual |
| 2026-08-19 | `locations.link_divulgacao` adicionado — alimenta a aba 🔗 紹介リンク do dashboard, que gera `link + ?ref=<nome do usuário logado>` |
| 2026-08-19 | Aba 🔗 紹介リンク criada no dashboard, visível pra qualquer perfil com `shokai_nome` |
| 2026-08-19 | Recuperação de senha self-service: link na tela de login + fluxo `resetPasswordForEmail`/`PASSWORD_RECOVERY` |
| 2026-08-19 | Leads do Site deixa de ser exclusivo do admin: qualquer perfil com `shokai_nome` vê os próprios; admin passa a ver só `shokai = 'ヒューマンシステム（西留）'` (função `shokaiFiltroLeads()`) |
| 2026-08-19 | Ações de Leads do Site (担当者紹介/ストック/NG/ブラック) restritas a admin e tantousha (`podeAgirLeads()`); shokaisha só visualiza |
| 2026-08-19 | `candidates.dt_shokai` (紹介日) adicionado — não entra no cálculo de etapa; gravado no cadastro interno ou no clique de 担当者紹介 |
| 2026-08-19 | Duas policies de UPDATE aditivas criadas: tantousha e shokaisha podem editar candidatos onde `shokai` bate com o próprio nome, sem depender da fábrica |
| 2026-08-19 | Edição parcial pro dono do lead: `podeEditarInfo(c)` libera dados pessoais no modal (trava 紹介者/工場/工場２/パイプライン日付/ブラックリスト/notas internas) |
| 2026-08-19 | Helper `voltarParaPipelineSeNecessario()` — clicar em fábrica ou マイ紹介 enquanto em Leads do Site/全体ストック/紹介リンク volta sozinho pro 状況 |
| 2026-08-19 | Botão lateral **候補者登録** (sem ícone) linkando pra `jobs-human.com/cadastro/`; ícone 🔗 removido do rótulo de 紹介リンク |
| 2026-08-19 | Área **`<escritório>`まとめ** criada pra role=jimusho — agrega pipeline/calendário/gráficos de todas as fábricas do escritório, diferente do "全体" (que mistura indicações de outros escritórios via match por shokai) |
| 2026-08-19 | `enviarParaFabrica` (担当者紹介) volta a ser 1 clique sem popup — tentativa de deixar escolher a fábrica no clique foi revertida no mesmo dia por ser redundante (fábrica já vem certa do site) |
| 2026-08-21 | Gráfico 紹介者 vira barra empilhada por etapa (depois reagrupado em 4 categorias: 進行中/成約/ストック/NG・ブラック); 在籍 removido e depois recolocado (dentro de 成約) |
| 2026-08-21 | Modo escuro (`body.dark-mode`) e visualização mobile forçada (`body.force-mobile`, só em tela de PC) adicionados, com toggles na sidebar; PDF sempre claro de propósito |
| 2026-08-21 | Visualização mobile forçada refinada: vira tela centralizada de 420px (como celular de verdade) em vez de layout mobile esticado; sidebar/bottomNav/filterPanel realinhados; botão "PC表示に戻る" no topbar |
| 2026-08-21 | Botões de impressão/exportação (PDF印刷/項目選択印刷/Excel出力) escondidos no layout mobile; linhas de Leads do Site e botões de ação do pipeline redesenhados pra empilhar no mobile em vez de espremer/sumir |
| 2026-08-21 | Calendário mobile (agenda) só mostra a partir de ontem em diante; card de 面接 mostra horário; dropdown de fábrica mostra nome do escritório em vez de "全工場"/"全体" genérico durante 事務所まとめ |
| 2026-08-21 | Botão 更新 volta a aparecer no mobile; fábrica na agenda vira chip colorido (cor automática por fábrica, repete entre escritórios diferentes) |
| 2026-08-21 | Regra nova de colaboração: sempre atualizar `cerebro.md` no mesmo fluxo de qualquer alteração no projeto |
| 2026-08-21 | Aba **オーダー状況** criada — `locations.order_atual`/`naitei_atual` (ambos manuais), cards com anel de progresso, stats do escritório, funil consolidado e agenda de 14 dias, em claro e escuro |
| 2026-08-21 | オーダー状況 movida do sidebar pro topbar (junto de 状況/カレンダー/グラフ); edição de オーダー/内定 sai da aba (fica só leitura) e vira a barra `#fabricaOrderBar`, que aparece ao filtrar uma fábrica específica — admin edita qualquer uma, jimusho as do próprio escritório, tantousha as próprias. Segunda policy de UPDATE em `locations` criada pra tantousha |
| 2026-08-21 | オーダー状況 passa a respeitar o filtro de datas (登録日) do topbar (`candidatosDoEscritorio()` usa `dentroDoPeriodo()`), e a aba se atualiza sozinha ao trocar o período |
| 2026-08-21 | No funil de オーダー状況, a barra 入社 conta por `dt_nyusha` dentro do período filtrado (não pela exceção "quem já entrou aparece sempre" que o resto do app usa); barra 在籍 removida desse funil (Eder não precisa monitorar isso ali) |
| 2026-08-21 | Admin passa a poder ver o `<escritório>`まとめ de qualquer escritório (lista `#sidebarJimushos`, um por vez), não só jimusho vendo o próprio — nova variável global `jimushoAtivoNome` guarda qual escritório está ativo |
| 2026-08-21 | Sidebar retrátil no desktop — puxador `#btnSidebarCollapse` fixo na borda, clica pra encolher/expandir, estado lembrado via `localStorage`. Escondido nos dois modos mobile (breakpoint real e forçado), que já têm o próprio mecanismo de sidebar via ☰ |
| 2026-08-21 | Atualização automática dos dados a cada 5 minutos (`iniciarAutoAtualizacao()`, chama `carregarDados()` via `setInterval`) — pulado se o modal do candidato estiver aberto, pra não perder edição em andamento. 5 min escolhido por ser leve (`candidates` tem algumas centenas de linhas, select simples) sem re-renderizar com frequência demais |
| 2026-08-21 | Bug corrigido: Excel出力 (e outras funções que juntam `habilitacao`/`experiencia`/`turnos_possiveis` com `.join`/`.map`/`.includes`) quebrava com `TypeError` quando algum candidato tinha um desses campos gravado como algo diferente de array (ex: string solta) — trocado `(campo||[]).join(...)` por `asArr(campo).join(...)` (helper que já existia, usado só nos filtros até então) em `CAMPOS_PDF`, `trArrPT` e `chk()` do modal. Reproduzido e confirmado corrigido rodando o dashboard local com Playwright (login real, fábrica NTKセラテック, 全て選択 + Excelで出力) — erro exato era `(c.turnos_possiveis \|\| []).join is not a function`. Também adicionado try/catch em `exportarExcelCustom()` com alerta visível de erro, e o nome do arquivo agora remove caracteres inválidos em nome de arquivo do Windows |
| 2026-08-21 | Bug corrigido: aba オーダー状況, quando admin tinha um escritório específico selecionado (via `<escritório>`まとめ na sidebar), mesmo assim mostrava todos os escritórios concatenados em vez de só o selecionado — `renderOrderStatus()` nunca olhava pra `jimushoAtivoNome`, diferente de `renderPipeline`/`renderCalendar` que já respeitavam esse filtro. Corrigido pra escopar pro escritório ativo quando selecionado, mantendo "mostrar todos, separados" quando nenhum escritório específico está selecionado (comportamento confirmado com Eder). Também corrigido: `filtrarFabrica`/`filtrarMeuShokai`/`filtrarJimushoMatome` agora atualizam a aba オーダー状況 na hora se ela já estiver aberta (antes só atualizava ao trocar de aba) |
| 2026-08-21 | Bug corrigido: em Leads do Site, `role: jimusho` via a aba (porque tem `shokai_nome`) mas nunca tinha os botões de ação (対応中, 担当者紹介, ストック, NG, Bloquear) — `podeAgirLeads()` só liberava `admin`/`tantousha`, faltando `jimusho`. Adicionado `jimusho` à lista. Reproduzido o cenário (conta de teste é jimusho + shokai_nome preenchido) e confirmado via leitura de código que `podeEditar(c)` já libera `jimusho` sem restrição de fábrica — ou seja, a policy de RLS do Supabase pra UPDATE em `candidates` já deve cobrir esse caso, não deveria precisar de policy nova |
| 2026-08-25 | Bug corrigido (esse sim precisava de policy nova): usuário `jimusho` (佐藤　レオナルド) reportou não ver os próprios leads em Leads do Site apesar de `shokai_nome` preenchido. Investigado com queries read-only comparando hash (`encode(...,'hex')`) de `profiles.shokai_nome` × `shokaisha.nome` × `candidates.shokai` — os três batiam exatamente, byte a byte, então não era erro de digitação/espaço. Causa real: a policy `select por cargo` nunca teve cláusula de `shokai` no bloco `jimusho` (só tinha `fabrica`, diferente de `tantousha`/`shokaisha`) — bug estrutural desde que a feature de Leads do Site foi criada em 2026-08-19, não específico desse usuário. Corrigido com duas policies aditivas novas, `jimusho select proprios indicados` e `jimusho update proprios indicados`, no mesmo padrão das de `tantousha`/`shokaisha` (ver Políticas RLS). Efeito colateral positivo: também corrige o "全体" de conta jimusho (documentado desde 2026-08-19 como devendo incluir indicados por `shokai`, mas que na prática nunca funcionou por essa mesma lacuna) |
| 2026-08-21 | Calendário redesenhado: mês inteiro (5-6 linhas) virou janela de 14 dias fixa (2 linhas de 7), navegação `←/→` anda de 14 em 14 dias a partir do domingo da semana atual (`calRefDate`, antiga `calYear`/`calMonth` removida). Corrige nomes cortados nos dias lotados — cada dia agora tem um wrapper `.cal-day-events` com scroll interno (`max-height:320px`) em vez de a linha inteira estourar/cortar. Número do dia ganhou contador `(N)` de eventos ao lado. Cards de 面接 no calendário (grid principal e agenda de オーダー状況) agora mostram o horário: `面接 09:00：Nome`. Criado campo novo `kengaku_hora` (見学時間, espelhando o `mensetsu_hora` que já existia) — no modal do candidato, na exportação `項目選択印刷` (Excel/PDF), e nos dois calendários, onde o rótulo "見学・ヒアリング" virou "見学時間" **só nessas duas telas** (funil, gráficos, Leads do Site etc. continuam "見学・ヒアリング"). Depende de coluna nova no Supabase — ver Pendências |
| 2026-08-25 | Correção no rótulo do calendário: "見学時間" tinha virado um texto fixo por engano — corrigido pra "見学" (curto, igual "面接"), com o horário do kengaku do lado: `見学 09:00：Nome`. O rótulo "見学時間" continua só no campo do modal e na coluna de exportação, que são label de coluna, não card de agenda |
| 2026-08-25 | Bug corrigido: admin via カレンダー/オーダー状況 do `<escritório>`まとめ vazio mesmo com entrevistas/見学 reais marcadas pros próximos dias. Causa: `candidatosDoEscritorio()` e o filtro do `renderCalendar()` usavam `dentroDoPeriodo(c)`, que só olha `created_at` (登録日) — um candidato cadastrado antes do período de 登録日 selecionado no topo desaparecia mesmo tendo 面接/見学/入社/内定 marcado dentro da janela de 14 dias. Reproduzido: conta jimusho do 小牧事務所 via `事務所まとめ`, estreitando 登録日 pra 2 dias — agenda de 14 dias continuava vazia antes da correção. Criado `dentroDoPeriodoOuEvento(c)`, que conta o candidato se **qualquer** uma dessas datas cair no período selecionado (登録日, 面接日, 見学日, 入社日 ou 内定日) — aplicado só em `candidatosDoEscritorio()` e no filtro de `renderCalendar()` (カレンダー e オーダー状況), decisão do Eder pra não alterar o resto do app (状況/グラフ/Leads do Site continuam só por 登録日). Mantida a exceção pré-existente de 入社/在籍 sempre aparecerem, mesmo redundante agora |
| 2026-08-25 | Bug corrigido: atualização automática (`carregarDados()`, chamada pelo `setInterval` de `iniciarAutoAtualizacao()`) só redesenhava 状況 (pipeline), カレンダー, sidebar e alertas — オーダー状況, グラフ, Leads do Site e 紹介者分析 buscavam dado novo do banco por baixo dos panos mas a tela não era redesenhada, só ficava atualizada de verdade se o usuário saísse da aba e voltasse (o que forçava `showTab()` de novo). Corrigido adicionando as mesmas checagens de visibilidade que `onPeriodoChange()` já usava (`if (aba visível) renderX()`) direto em `carregarDados()`. Intervalo também subiu de 5 para 10 minutos, a pedido do Eder. Testado via Playwright chamando `carregarDados()` manualmente com オーダー状況 e グラフ abertos — ambos redesenham corretamente. Notado (não corrigido, pré-existente): erro de console "Failed to create chart: can't acquire context from the given item" já acontecia antes dessa mudança, não foi introduzido por ela |
| 2026-08-25 | Tabela do estágio 面接 (aba 状況) ganhou colunas 面接日 e 面接時間 — antes só tinha アクション, igual 対応中. Novo `showMensetsuCol` (separado de `showActions3`, que agora é só `taiochu`) e classe CSS `.col-mensetsu` (14 colunas, mesmo total do `.col-kengaku`). Pedido do Eder confuso a princípio ("na parte do 条件") — era o 状況 mesmo, aparência parecida no teclado/tela |
| 2026-08-25 | Colunas de data na tabela do 状況 (面接日/見学日/入社日) passam a mostrar só mês e dia (`8月19日`), sem o ano — estava quebrando linha na coluna estreita (`2026年8月19日`). Novo helper `fmtDataCurta()`, usado só nessas colunas da tabela; `fmtDataPT()` (com ano) continua igual em todo o resto (modal, exportação, agenda). 面接時間 também passou a cortar os segundos (`c.mensetsu_hora.slice(0,5)`), mostrando `09:06` em vez de `09:06:00` |
| 2026-08-25 | Bug corrigido: menu ☰ (celular) não abria a sidebar pra quem tinha o estado "sidebar recolhida" salvo no navegador (`localStorage.sidebarCollapsed`, feature de desktop de 2026-08-21). Causa: `body.sidebar-collapsed #sidebar { width:0 }` (CSS.dashboard, linha ~19) nunca foi limitado ao desktop — se esse estado estivesse salvo, o menu no celular até "abria" (`.mobile-open` troca o `transform` certinho) mas ficava com `width:0; overflow:hidden`, invisível. Reproduzido e confirmado com Playwright (viewport de celular + `localStorage.sidebarCollapsed=1`: sidebar media `0px` antes da correção, `210px` depois). Corrigido com um reset de `width`/`overflow` dentro do breakpoint `@media (max-width:768px)` e do modo `force-mobile` — o recolhimento em si (desktop) continua funcionando igual, só não vaza mais pro celular |
| 2026-08-25 | Novo estágio **検討中** criado no pipeline, entre 面接 e 見学・ヒアリング — cor âmbar (`#f9a825`, mesma já usada no botão 対応中 de Leads do Site). Botões: linha do 検討中 tem 見学/NG/ストック (igual 面接 tinha antes); linha do 面接 ganhou um 4º botão 検討中, junto dos que já existiam. Tocou em bastante coisa: `STAGES`, `getStage()` (nova checagem `dt_kentouchu` entre `dt_kengaku` e `dt_mensetsu`), `diasNaEtapa()`, nova classe `.col-kentouchu`, `.col-mensetsu` alargada (4 botões agora), caixinha nova no quadro de números do topo, checkbox novo no filtro "ステージ▾", campo novo no modal (`検討中日`, entre 面接時間 e 見学・ヒアリング日), bloqueado pra edição parcial de shokaisha (`CAMPOS_BLOQUEADOS_INFO`), nova cor em `ORDST_STAGE_COLORS` (funil de オーダー状況) e nos arrays de `renderCharts()` (グラフ), e nova coluna exportável `検討中日` no `CAMPOS_PDF`. Depende de `ALTER TABLE candidates ADD COLUMN dt_kentouchu date;` no Supabase — ver Pendências |
| 2026-08-25 | Topbar dividido em duas linhas (antes tudo numa fileira só, quebrava desorganizado conforme a largura da tela): linha 1 = título/versão, abas, usuário/logout; linha 2 = busca, período, filtros rápidos, ステージ▾, 詳細フィルター, PDF印刷/項目選択印刷/Excel出力, 更新. Nova classe `.topbar-row` (mobile e force-mobile ajustados pra manter o `flex-wrap:nowrap` que só existia no `#topbar` antes) |
| 2026-08-25 | Campo de busca do topbar destacado visualmente (borda laranja, fundo levemente colorido, ícone 🔍 no placeholder, mais largo — 260px) pra ficar fácil de localizar; ajustado também no modo escuro (antes ia junto com o cinza padrão dos outros filtros) |
| 2026-08-25 | Busca do topbar passa a considerar também `numero_cadastro` (番号), não só 氏名/電話番号 — vale tanto pro 状況 (`getFiltrados()`) quanto pra Leads do Site (`getLeadsFiltrados()`) |
| 2026-08-25 | **Movimentação em massa no 状況** — barra nova (`#bulkActionBar`) aparece quando ≥1 candidato está com o checkbox marcado (reaproveita os checkboxes que já existiam pra seleção de impressão), com um dropdown de etapa-destino + botão 実行. Permite tanto avançar quanto **voltar** candidatos de etapa — voltar apaga automaticamente o(s) campo(s) de tudo que está mais avançado que o destino na ordem `STAGE_CHAIN` (NG > ストック > 在籍 > 入社 > 内定 > 見学・ヒアリング > 検討中 > 面接 > 対応中), e sempre desmarca ブラック se estiver marcado (senão a etapa não mudaria visualmente, já que `getStage()` prioriza ブラック acima de tudo). Ideia original era drag-and-drop, mas o Eder não conseguiu usar bem arrastando — foi pra esse caminho de seleção+botão em vez disso. Regra de confirmação (popup em japonês): 1 pessoa avançando = sem popup (igual aos botões individuais que já existiam); 1 pessoa voltando = popup avisando que vai apagar data; grupo (2+), qualquer direção = sempre popup, com contagem de quantos avançam/voltam quando for misto. Update é em lote (`'.in(id, ids)`, um único payload pra todo mundo, já que a lógica de "limpar tudo acima do alvo" não depende do estado atual de cada um) |
| 2026-08-25 | ステージ▾, 詳細フィルター e depois 登録日/性別/年齢上限/日本語 movidos da linha 2 pra linha 1 do topbar (a pedido do Eder, em duas correções seguidas) — linha 1 ficou com título/abas/todos os filtros rápidos/usuário; linha 2 ficou só com busca e os botões de impressão/exportação/atualizar |
| 2026-08-25 | **Coluna `dt_zaiseki` adicionada** — 在籍 deixa de depender só do cálculo automático por mês (`dt_nyusha` em mês anterior). Agora tem campo próprio no modal (在籍日, com botão 今日, logo após 入社日) e um botão **在籍** na linha da etapa 入社 no 状況 (ao lado direito, mesmo padrão dos outros botões de ação — nova classe CSS `.col-nyusha-action`, separada de `.col-nyusha` que continua servindo só pra 内定). `getStage()` checa `dt_zaiseki` primeiro; se vazio, cai no cálculo automático por mês de antes (as duas formas coexistem). `STAGE_CHAIN` ganhou entrada própria pra 在籍 (entre ストック e 入社), então também virou opção na movimentação em massa. Cor nova de botão `.btn-lead.teal` (mesma cor do card 在籍 na barra de status) |

## Sistema de Versão

- Badge visível no topo do dashboard (`採用管理 vX.XX`), ao lado do título
- A cada mudança publicada, o número sobe e uma tag anotada é criada no git (`git tag -a vX.XX`) apontando pro commit daquela versão, e enviada ao GitHub (`git push origin vX.XX`)
- Convenção: o número **menor** (segundo, ex: `1.02`) sobe a cada mudança normal; o número **maior** (primeiro, ex: `2.0`) sobe em mudanças estruturais grandes (redesenho, mudança de arquitetura)
- Para reverter: `git checkout vX.XX` recupera o código exatamente daquele ponto, sem perder o histórico do que veio depois
- Versão atual: **v1.48**
- Tags criadas até agora: `v1.00` a `v1.48`

## Pendências

- **Card アラート em オーダー状況 — critério ainda não decidido**: hoje conta todo candidato do escritório com `alerta_data` preenchido, sem checar se a data é passada/hoje/futura — diferente da barra laranja `#alertBar` do topo do app, que só considera alertas de **hoje**. Perguntado ao Eder em 2026-08-21 se deveria igualar (só hoje) ou manter mais amplo com outro rótulo (tipo "未対応アラート") — ainda sem resposta.
- **curriculo-edit.html e hiaringu.html sem controle de acesso**: as páginas não checam login (sem `auth.getUser()`) — qualquer pessoa com o link pode abrir e editar. A tabela `curriculos` não tem política de UPDATE no RLS nem coluna de fábrica/candidate_id (é buscada só por telefone), então não dá pra restringir por cargo/fábrica sem antes: (1) ligar RLS na tabela, (2) adicionar login nas duas páginas, (3) decidir como vincular `curriculos` a uma fábrica (hoje não tem esse dado). Adiado a pedido do Eder em 2026-08-06 — resolver depois.
- **form-vaga-ig.html**: recebeu a mesma correção de `?ref=` que form-vaga.html, mas nunca foi confirmado com o Eder se esse arquivo está de fato colado em alguma página do site. Se não estiver em uso, pode ser removido; se estiver, precisa do mesmo cuidado de recolar manualmente no Elementor a cada atualização.
- **Migração de shokaisha pra login individual**: dos 84 nomes na tabela `shokaisha`, só uma parte tem login/perfil no CRM hoje. Decisão do Eder (2026-08-19) foi só liberar a aba 🔗 紹介リンク pra quem já tem login — sem fallback — como forma de forçar a criação de conta de todos com o tempo. `link-afiliado.html` (com senha `0246`) ficou pronto como transição, mas não é o caminho oficial.
- **Trava de coluna só no frontend**: as policies de UPDATE aditivas (tantousha/shokaisha por shokai) liberam a linha inteira no banco — a restrição de "shokaisha não edita 紹介者/datas de pipeline" existe só no modal do dashboard, não no Postgres. Risco aceito pelo contexto (baixo volume, parceiros de confiança), mas vale lembrar se o uso crescer.
- **Página de vaga com duas tags `og:image` conflitantes**: encontrado em 2026-08-19 na página de Kumamoto — uma aponta pro logo genérico da Human, outra pra foto real da vaga. Pode causar preview errado ao compartilhar no WhatsApp/LINE dependendo de qual tag o app prioriza. Não é algo que se corrige neste repositório (é configuração do WordPress/plugin de SEO).
- **Mudança combinada mas não implementada: `getStage()` 入社→在籍 sem folga de mês**: Eder pediu (2026-08-25) que a data de `dt_nyusha` já passada vire `在籍` na hora (não esperar virar o mês como hoje), e que `dt_nyusha` futura mostre como `入社` (hoje cai pra `内定` se a data ainda não chegou). Mudança combinada — trocar o bloco de `if (c.dt_nyusha) {...}` em `getStage()` por `c.dt_nyusha <= hojeISO() ? 'zaiseki' : 'nyusha'` — mas ainda não subiu, Eder não confirmou se quer implementar agora. Importante: é reclassificação retroativa, muda o estágio de candidatos que já estão cadastrados assim que a página recarregar, não só daqui pra frente.
- **Migração pendente: coluna `dt_kentouchu` (v1.43)**: o código já lê/grava `dt_kentouchu` (novo estágio 検討中, entre 面接 e 見学), mas a coluna ainda **não existe** na tabela `candidates` do Supabase — sem rodar o SQL abaixo, salvar um candidato movendo pra 検討中 (ou qualquer save que passe por esse campo) vai quebrar. Rodar no SQL Editor do Supabase antes do deploy do v1.43 estar completo:
  ```sql
  ALTER TABLE candidates ADD COLUMN dt_kentouchu date;
  ```
  Remover esta pendência assim que confirmado que a coluna existe em produção.
- **Bug de permissão silenciosa nas ações de Leads do Site**: `enviarParaFabrica`, `moverParaTaiochu`, `moverParaStock`, `moverNG` e `bloquearLead` (dashboard.js) só checam `{ error }` do retorno do Supabase — quando o RLS bloqueia um UPDATE (0 linhas afetadas por falta de permissão), o Supabase **não retorna erro**, só afeta 0 linhas. O código assume sucesso, atualiza o objeto local otimisticamente e redesenha, dando a impressão de que funcionou — o banco nunca muda de verdade, e o estado volta ao normal na próxima atualização automática ou recarregada de página. Identificado investigando por que o botão 担当者紹介 "não fazia nada" pra um usuário jimusho (causa real, nesse caso, era falta da policy de UPDATE — ver changelog 2026-08-25). Falta decidir com o Eder se vale corrigir (checar linhas afetadas e avisar com alerta quando vier zero) — ele perguntou mas ainda não confirmou.
