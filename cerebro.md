# Cérebro — CRM Recrutamento Japão

> Documento de referência do projeto. Reflete o estado atual construído.
> Última atualização: 2026-06-02

---

## Visão do Produto

Sistema interno de gestão de recrutamento para o mercado japonês.
Elimina o caos de planilhas e WhatsApp no processo seletivo por fábrica.

**Site público:** https://jobs-human.com/ (WordPress + Elementor)
**CRM (dashboard):** https://crm-recrutamento-production.up.railway.app
**Senha de acesso:** 0246
**Repositório GitHub:** https://github.com/helpdeskhumanpc/crm-recrutamento

---

## Usuários

| Perfil | Acesso | Responsabilidade |
|--------|--------|-----------------|
| Admin | Total | Visão geral de todas as fábricas |
| 担当者 (Recrutador) | Sua fábrica | Gerenciar candidatos da sua fábrica |
| Candidato | Nenhum | Só preenche formulário público no site |

**Hierarquia:** flat — cada 担当者 cuida da sua fábrica de forma autônoma.

---

## Stack Tecnológica (atual)

| Camada | Tecnologia |
|--------|-----------|
| Site público | WordPress + Elementor (jobs-human.com) |
| Formulário de cadastro | HTML puro com Supabase JS SDK |
| Banco de dados | Supabase (PostgreSQL) — free tier |
| Dashboard CRM | HTML + CSS + JS vanilla (dashboard.html) |
| Servidor | Express.js com autenticação por senha (server.js) |
| Deploy | Railway (auto-deploy via GitHub push) |
| Senha | `0246` (configurável via variável `PASSWORD` no Railway) |

---

## Arquivos do Projeto

| Arquivo | Função |
|---------|--------|
| `dashboard.html` | CRM completo — pipeline, calendário, gráficos |
| `form-candidato.html` | Formulário de cadastro de candidatos (japonês) |
| `server.js` | Servidor Express com login por senha + static files |
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
-- Pipeline dates
dt_oubo               date          -- 応募日
dt_taiochu            date          -- 対応中
dt_mensetsu           date          -- 面接日
mensetsu_hora         time          -- 面接時間
dt_kengaku            date          -- 見学日
dt_naitei             date          -- 内定
dt_nyusha             date          -- 入社
dt_stock              date          -- ストック
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
created_at  timestamp with time zone default now()
```

**Fábricas cadastradas:** アラコ, FTS, FTS田原, イビデン, コベルク富士松, コベルクいなべ, マルヤス, 三菱, 三菱重工, TBKいなべ, TBSK高浜, タチエス安城, 豊臣本社, 豊臣いなべ, ビューテック

### `tantoushas` — recrutadores

```sql
id          uuid PK
nome        text NOT NULL
email       text (nullable)
role        text default 'tantousha'
location_id uuid FK → locations
jimusho     text
created_at  timestamp with time zone default now()
```

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
alter table candidates enable row level security;
create policy "permitir insert" on candidates for insert with check (true);
create policy "permitir select" on candidates for select using (true);
create policy "permitir update" on candidates for update using (true);

-- shokaisha
alter table shokaisha enable row level security;
create policy "leitura publica" on shokaisha for select using (true);

-- locations
alter table locations enable row level security;
create policy "leitura publica" on locations for select using (true);
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

| Aba | Função |
|-----|--------|
| 状況 | Pipeline de candidatos por etapa |
| カレンダー | Grid mensal (desktop) / Agenda lista (mobile) |
| グラフ | Gráficos Tier 1 |

### Sidebar

- Lista de fábricas com contagem
- Clicar filtra **todas as abas** simultaneamente (状況 + カレンダー + グラフ)
- Mobile: escondida, abre via botão ☰

### Barra de stats

総候補者 | 連絡前 | 対応中 | 面接 | 見学 | 内定 | 入社 | ストック | NG

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

### Calendário

- **Desktop:** grade mensal tradicional
- **Mobile:** vista agenda cronológica (só dias com eventos)
- Filtro por fábrica (sincronizado com sidebar)
- Toggle de tipos: ● 面接 ● 見学 ● 入社 ● アラート
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
- `PASSWORD` — senha de acesso (padrão: 0246)

**Para testar localmente:**
```bash
cd c:\projetos\xquads\crm-recrutamento
npm install
node server.js
# acessa http://localhost:4000
```

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
