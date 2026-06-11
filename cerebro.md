# Cérebro — CRM Recrutamento Japão

> Documento de referência do projeto. Reflete o estado atual construído.
> Última atualização: 2026-06-09

---

## Regra de Colaboração com o Assistente

**Sempre que o Eder pedir qualquer alteração ou tarefa:** o assistente deve primeiro explicar o que entendeu do pedido e aguardar confirmação antes de executar. Nunca executar direto sem confirmar o entendimento.

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

### Políticas RLS ativas
- `insert publico` — anon pode inserir (formulário público)
- `select por cargo` — filtro por role (admin/jimusho/tantousha/shokaisha)
- `update por cargo` — mesmo filtro do select
- `anon select temp` — anon pode ler tudo (temporário, remover quando todos migrarem para login)

---

## Usuários

| Perfil | Acesso | Responsabilidade |
|--------|--------|-----------------|
| `admin` | Total | Todos os candidatos, todas as fábricas |
| `jimusho` | Seu escritório | Todas as fábricas do seu escritório |
| `tantousha` | Suas fábricas + indicados | Candidatos das fábricas que gerencia |
| `shokaisha` | Só seus indicados | Ver candidatos que indicou |

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
| `dashboard.html` | CRM completo — pipeline, leads, stock pool, calendário, gráficos |
| `form-candidato.html` | Formulário interno de cadastro (japonês) — origem `indicado` |
| `form-vaga.html` | Formulário público (português) no WordPress — origem `web` |
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
dt_stock              date          -- 工場ストック
dt_stock_geral        date          -- 全体ストック (libera candidato p/ pool 全体ストック, qualquer fábrica pode assumir)
dt_ng                 date          -- NG
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
created_at  timestamp with time zone default now()
```

**Fábricas cadastradas:** アラコ, FTS, FTS田原, イビデン, コベルク富士松, コベルクいなべ, マルヤス, 三菱, 三菱重工, TBKいなべ, TBSK高浜, タチエス安城, 豊臣本社, 豊臣いなべ, ビューテック

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

> Uma linha por candidato. `hiaringu_bi` reflete automaticamente em `candidates.dt_kengaku` ao salvar.

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
create policy "select por cargo" on candidates for select using (...); -- filtro por role
create policy "update por cargo" on candidates for update using (...); -- filtro por role
create policy "anon select temp" on candidates for select using (auth.uid() is null and is_deleted = false);
-- ⚠️ anon select temp: remover quando todos usuários estiverem usando login

-- profiles
create policy "ver proprio perfil" on profiles for select using (auth.uid() = id);

-- shokaisha
create policy "leitura publica" on shokaisha for select using (true);

-- locations
create policy "leitura publica" on locations for select using (true);

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
dt_nyusha      → nyusha
dt_naitei      → naitei
dt_kengaku     → kengaku
dt_mensetsu    → mensetsu
dt_taiochu     → taiochu
(nenhuma)      → renrakumae
```

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

Formulário em **português** embutido no WordPress via Elementor HTML widget.
Ao submeter, grava no Supabase com `origem = 'web'` e **em seguida** chama `POST https://crm-recrutamento-production.up.railway.app/api/google-contact`.

### Detecção automática de fábrica

1. Campo oculto WPForms `form_fields[pagina]` (preenche automaticamente no post dinâmico da vaga)
2. Body class WordPress `fabrica-xxx` (taxonomy)
3. URL param `?fabrica=`

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
| Leads do Site | Somente `admin` | Mini-pipeline de leads do formulário WordPress |
| ストック Pool | Todos | Candidatos em ストック disponíveis para tantoushas reivindicarem |

### Sidebar

- Lista de fábricas com contagem
- Clicar filtra **todas as abas** simultaneamente (状況 + カレンダー + グラフ)
- Mobile: escondida, abre via botão ☰

### Barra de stats

総候補者 | 連絡前 | 対応中 | 面接 | 見学・ヒアリング済み | 内定 | 入社 | ストック | NG

### Painel 状況

- Candidatos agrupados por etapa com cores
- Colunas: 氏名 | 紹介者 | 電話番号 | 工場 | 国籍 | 性別 | 日本語 | 経過
- 経過 = dias na etapa atual (vermelho após 7 dias)
- Paginação: 5 por etapa + "Ver mais"
- Botão ステージ ▾ para mostrar/esconder etapas específicas
- Botão 詳細フィルター → painel slide-in com filtros avançados
- Botão PDF印刷 → abre nova aba com lista para imprimir

### Filtros disponíveis

**Topbar:** Busca (氏名/電話), 性別, 年齢上限, 日本語レベル

**詳細フィルター (painel):**
日本語レベル, 年齢上限, 状況, 住居, 就業状況, 性別, 国籍, 都道府県, 可能な直, 引越し, 免許・資格, 工場経験

### Modal de candidato

- Abre ao clicar em qualquer candidato
- Título: `氏名 (電話番号)`
- Seções: 基本情報, 仕事情報, スキル, パイプライン日付 (com botão 今日), アラート・メモ, ブラックリスト
- Botão 保存 → salva no Supabase
- Botão 削除 → soft delete (oculta, não apaga)

### Leads do Site (aba admin)

Pipeline separado para candidatos com `origem = 'web'`. Etapas:

| Etapa | Chave | Descrição |
|-------|-------|-----------|
| 連絡前 | renrakumae | Recém cadastrado, ainda não contactado |
| 担当者紹介 | indicado | Enviado para fábrica (`origem = 'web_indicado'`) |
| ストック | stock | Movido para pool (`origem = 'web_stock'`) |
| NG | ng | `dt_ng` preenchido |
| ブラック | black | `is_blacklisted = true` |

Ações disponíveis por card: **Enviar para fábrica** → move para pipeline principal | **ストック** → move para pool | **NG** | **ブラック**

### ストック Pool (aba todos)

Lista de candidatos com `origem = 'web_stock'`. Tantoushas podem clicar em **Atribuir para fábrica** → seleciona a fábrica → move para pipeline principal com `origem = 'indicado'`.

### Calendário

- **Desktop:** grade mensal tradicional
- **Mobile:** vista agenda cronológica (só dias com eventos)
- Filtro por fábrica (sincronizado com sidebar)
- Toggle de tipos: ● 面接 ● 見学・ヒアリング済み ● 入社 ● アラート
- Clicar em evento abre modal do candidato

### Gráficos (aba グラフ)

- Filtro por fábrica no topo
- 4 cards de taxa de conversão: total, 応募→面接, 面接→内定, 内定→入社
- Funil de recrutamento (barras horizontais por etapa)
- Candidatos por fábrica (barras verticais — some ao filtrar por fábrica)
- Entradas por mês (linha)
- Ranking 紹介者 top 10 (barras horizontais)

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
| `TELEGRAM_CHAT_ID` | ID do grupo/canal que recebe as notificações (`-5181155523`) |

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
- **Channel ID:** `2010343284`
- **Channel secret:** `cd8495194fa2a2b7e314690e80b61c6b`
- **Bot basic ID:** `@207sktgh`
- **Channel Access Token (long-lived):** `aSk0XxIBYUGXxK/5ZMaicRuutZuus3mm8AoogVJgI1lPlDT3i0Mw9qMuNWvFTSkDwBDktaZ9rPY0hTgaCUiPyxyq035buos4VpgURbT7mNg68cpSAzkF1YalBjxdb0ZeFI6KT6eBopxjgYE4E2QjbgdB04t89/1O/w1cDnyilFU=`
- **User ID pessoal do Eder (LINE):** `U60d8255b3e3483f02d10d06494b192c0`

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
