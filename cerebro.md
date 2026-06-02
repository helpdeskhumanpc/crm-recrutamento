# Cérebro — CRM Recrutamento Japão

> Documento de referência do projeto. Atualizar sempre que uma decisão for tomada.

---

## Visão do Produto

Sistema interno de gestão de recrutamento para o mercado japonês.  
Elimina o caos de planilhas e WhatsApp no processo seletivo por fábrica.

**Site público:** https://jobs-human.com/ (WordPress + Elementor)  
**Candidato:** preenche formulário no site → dados caem automaticamente no sistema  
**Recrutador:** acessa o CRM para gerenciar candidatos da sua fábrica  
**Hierarquia:** flat — cada 担当者 cuida da sua fábrica de forma autônoma  
**Sistema legado:** nenhum — construção do zero

---

## Usuários

| Perfil | Acesso | Responsabilidade |
|--------|--------|-----------------|
| Admin | Total | Visão geral de todas as fábricas |
| 担当者 (Recrutador) | Sua fábrica | Gerenciar candidatos e agenda do seu local |
| Candidato | Nenhum | Só preenche formulário público no site |

---

## Pipeline de Recrutamento

### Fluxo Principal (ordem obrigatória)

```
応募日 → 対応中 → 面接日 → 見学日 → 内定 → 入社
```

### Saídas Laterais

| Status | Tipo | Descrição |
|--------|------|-----------|
| ストック | Etapa de espera | Candidato aprovado, sem vaga disponível no momento. Retorna ao fluxo quando abrir vaga. |
| NG | Saída negativa | Reprovado ou desistiu. Pode ocorrer em qualquer etapa. |
| ブラック | Flag no perfil | Candidato problemático ou com histórico de problemas. **Não é etapa** — é marcação permanente, visível em qualquer tela. |

### Regras do Pipeline

- **ブラック** aparece como alerta vermelho em qualquer tela que o candidato aparecer
- **ストック** pode ser reativado quando surgir vaga na fábrica
- Candidato pode ter múltiplos registros se tentar entrar em fábricas diferentes

---

## Stack Tecnológica

| Camada | Tecnologia | Decisão |
|--------|-----------|---------|
| Site público | WordPress + Elementor | Já existe em jobs-human.com |
| Formulário de entrada | Elementor Form → Supabase | Candidato preenche no site, cai direto no banco |
| Banco de dados | **Supabase (PostgreSQL)** | Auth + Realtime + Storage — free tier |
| Frontend CRM | Next.js (React) | Interface dos recrutadores |
| Estilo | Tailwind CSS | Velocidade de desenvolvimento |
| Agenda | FullCalendar.js | Suporte japonês, flexível |
| Deploy CRM | Vercel | Free tier, integração com Next.js |
| App mobile | ❌ Não — só web | — |

**Estimativa de usuários:** 10 a 15 recrutadores simultâneos → free tier do Supabase suporta com folga.

---

## Schema do Banco de Dados

```sql
-- Locais (fábricas / escritórios)
locations
  id, nome, tipo (fábrica | escritório), cidade, responsavel_id

-- Recrutadores
users
  id, nome, email, role (admin | tantousha), location_id

-- Candidatos
candidates
  id                        uuid, PK
  shokai                    text          -- 紹介：quem indicou
  shimei                    text          -- 氏名：nome completo
  furigana                  text          -- ふりがな：leitura do nome (obrigatório JA)
  telefone                  text          -- 電話番号
  postal_code               text          -- 〒
  prefecture                text          -- 住所：県
  city                      text          -- 住所：市
  data_nascimento           date          -- 生年月日
  idade                     integer       -- 年齢 (calculado ou preenchido)
  sexo                      text          -- 性別：男性 | 女性 | その他
  nacionalidade             text          -- 国籍
  visa                      text          -- ビザ / 在留資格 (enum abaixo)
  nivel_japones             text          -- 日本語力 (enum abaixo)
  fala_ingles               boolean       -- 英語会話できるか
  hiragana                  text          -- ひらがな (enum: leitura_escrita | leitura | nenhum)
  katakana                  text          -- カタカナ (enum: leitura_escrita | leitura | nenhum)
  habilitacao               text[]        -- 免許：array (Carro, Moto, Empilhadeira, etc.)
  tem_carro                 boolean       -- 車の所有
  experiencia               text[]        -- 経験：array de experiências (enum abaixo)
  turnos_possiveis          text          -- 可能な直：昼直|夜直|両方
  horario_contato           text[]        -- 電話可能時間：array de horários (enum abaixo)
  precisa_apartamento       boolean       -- アパート必要
  pode_mudar                boolean       -- 引っ越し可能か
  esta_empregado            boolean       -- 現在仕事中
  horario_contato           text          -- 電話可能時間：ex. 14:00〜16:00
  comentario                text          -- observações gerais sobre o candidato
  tantousha_id              uuid          -- FK → users (quem recebeu o candidato)
  tantousha_comentario      text          -- comentário do 担当者 sobre o candidato
  is_blacklisted            boolean       -- ブラック flag
  blacklist_motivo          text
  created_at                timestamp

-- Pipeline: datas diretamente no candidato (uma coluna por etapa)
-- Abordagem escolhida: flat columns — simples, direto, sem JOINs

  dt_oubо                   date    -- 応募日
  dt_taiochu                date    -- 対応中
  dt_mensetsu               date    -- 面接日
  dt_kengaku                date    -- 見学日
  dt_naitei                 date    -- 内定
  dt_nyusha                 date    -- 入社
  dt_stock                  date    -- ストック (data que entrou em espera)
  dt_ng                     date    -- NG (data que foi reprovado/desistiu)

```

### Decisões do schema

- **3 tabelas no total** — candidates, locations, users. Sem tabela de agendamentos.
- Todas as datas do pipeline ficam na linha do candidato. Se ele voltar, atualiza as datas.
- Uma linha = um candidato completo. Simples de consultar, simples de exibir.
- Alteração no CRM → atualiza o Supabase na hora via SDK. Sem sincronização manual.

### Enums e opções dos campos

**ビザ (visa)**
```
Residente permanente
Cônjuge de japonês
Cônjuge ou filho de residente permanente
Residente de longa permanência (1,3 ou 5 anos)
Dependente
Estudante
Nacionalidade japonesa
```

**日本語力 (nivel_japones)**
```
0% (não falo japonês)
N5 10%〜 (falo um pouco)
N4 30%〜 (conversação básica)
N3 50%〜 (conversação do dia a dia)
N2 60%〜 (conversação intermediária)
N1 80%〜 (conversação avançada)
```

**ひらがな / カタカナ (hiragana / katakana)**
```
Leitura e escrita
Leitura
Não tenho esse conhecimento
```

**免許 (habilitacao)** — múltipla escolha, salvo como array
```
Não possuo
Carro
Moto
Empilhadeira
Tamakake
Kuren
Soldagem
```

**経験 (experiencia)** — múltipla escolha, salvo como array
```
Não possuo experiência
Montagem (kumitate)
Autopeças (jidosha buhin)
Alimentícios (shokuhin)
Eletrônico (denshi)
Forklift
Tamakake
Inspeção de Qualidade (Kensa)
Embalagem (konpo)
Prensa (puresu)
Soldagem (yosetsu)
Pintura (toso)
Construção Civil (kensetsu)
Logística (butsuryu)
Konbini
Supermercado (supa)
Hotel (hoteru)
```

**可能な直 (turnos_possiveis)**
```
二交代
早番遅番
二直三班
昼勤のみ
```

**現在仕事中 (esta_empregado)**
```
Sim
Não
Fazendo baito
Aviso prévio
```

### Correções de tipo em relação ao schema anterior

| Campo | Era | Agora | Motivo |
|-------|-----|-------|--------|
| `hiragana` | boolean | text (enum 3 opções) | Tem nível, não é só sim/não |
| `katakana` | boolean | text (enum 3 opções) | Tem nível, não é só sim/não |
| `habilitacao` | text | text[] (array) | Múltipla escolha |
| `experiencia` | text | text[] (array) | Múltipla escolha |
| `horario_contato` | text | text[] (array) | Múltipla escolha |
| `esta_empregado` | boolean | text (enum 4 opções) | Tem "Fazendo baito" e "Aviso prévio" |

---

## Alertas

Colunas adicionadas em `candidates`:
- `alerta_data` — timestamp do lembrete
- `alerta_nota` — instrução do 担当者 ("Ligar para confirmar 面接", etc.)

Aparece na barra **今日の予定** quando a data chega. Um alerta por candidato no MVP — tabela separada só se precisar de múltiplos alertas por candidato no futuro.

---

## Dashboard

### Três visões disponíveis

| Visão | Quem usa | O que filtra |
|-------|----------|-------------|
| **全体** | Admin | Todos os candidatos, todas as fábricas e escritórios |
| **事務所別** | Admin / 担当者 | Filtrado por escritório — fábricas e 紹介 daquele escritório |
| **工場別** | 担当者 | Pipeline específico de uma fábrica + alertas do dia |

### Funil de recrutamento (visual em barras)

```
応募 → 対応中 → 面接 → 見学 → 内定 → 入社
```
Barra proporcional com número de candidatos em cada etapa. Filtrável por período (開始日〜終了日).

### Sumário lateral

| Métrica | Descrição |
|---------|-----------|
| 転換率（→内定） | Taxa de conversão応募 → 内定 |
| 転換率（→入社） | Taxa de conversão応募 → 入社 |
| ストック | Total de candidatos em espera |
| NG | Total de reprovados/desistências |
| ブラック | Total de candidatos bloqueados |

### Ranking de 紹介

Mostra quem está trazendo mais candidatos no período:
```
1. ヒクチ (刈谷事務所)    12 応募
2. ラセルダ (刈谷事務所)   8 応募
3. ジョナス (三重事務所)   6 応募
```

### 入社リスト do período

Tabela com: # / 入社日 / 工場 / 氏名

### Alertas do dia (今日の予定)

Candidatos com `alerta_data` = hoje, agrupados por fábrica. Visível no topo do dashboard.

---

## MVP — Escopo

### ✅ Incluído

- Formulário público (WordPress/Elementor → Supabase)
- Cadastro de candidatos com campos japoneses
- Pipeline com as 6 etapas + ストック + NG
- Flag ブラック no perfil
- Agenda (面接, 見学, 入社)
- Visão por fábrica
- Login para 担当者 e admin
- Dashboard básico (3 níveis)

### ❌ Fora do MVP

- Notificações automáticas (email / LINE / SMS)
- Portal do candidato com login
- App mobile
- Relatórios exportáveis
- IA para triagem
- Integração com sistemas externos

---

## Mensagem de Introdução (紹介メッセージ)

Campo gerado automaticamente na tela do candidato — **não é coluna no banco**, é montado a partir dos dados existentes. Tem botão コピー para enviar ao 担当者 via LINE, email, etc.

### Template

```
お疲れ様です。
Tantousha向け
新規応募がありました

紹介：{shokai}
氏名：{shimei}
電話番号：{telefone}
〒：{postal_code}
住所：{prefecture} / {city}
生年月日：{data_nascimento}
年齢：{idade}
性別：{sexo}
国籍：{nacionalidade}
ビザ：{visa}
日本語力：{nivel_japones}
ひらがな：{le_hiragana}
カタカナ：{le_katakana}
免許：{carteira_habilitacao}
経験：{experiencia}
アパート必要：{precisa_apartamento}
電話可能時間：{horario_contato}
現在仕事中：{esta_empregado}

よろしくお願いします。
```

---

## Decisões de UI/UX do Painel

> Sistema construído do zero. Tudo abaixo precisa ser implementado.

### Painel principal — candidatos por etapa

| Funcionalidade | Especificação |
|---------------|--------------|
| Agrupamento por etapa | Seções coloridas: 連絡前・対応中・面接・見学・内定・入社・ストック・NG・ブラック |
| Colunas visíveis | 氏名, 電話番号, 工場(H), 工場(R), 国籍, 年齢, 性, 都道府県, 市区町村, 生年月日, 就業, アパート, 日本語 |
| Contador por etapa | Badge com número de candidatos em cada etapa |
| Etapas vazias | Colapsar automaticamente quando count = 0 |
| Paginação por etapa | Mostrar primeiros 5 → botão "Ver mais (X)" |
| Ordenação dentro da etapa | Por ordem de chegada (created_at) — sem opção de reordenar |
| Indicador de dias na etapa | Quantos dias o candidato está parado na etapa atual — vermelho após X dias |
| Botão 詳細 | Abre o perfil completo do candidato |

### Mudança de etapa

| Funcionalidade | Especificação |
|---------------|--------------|
| Drag and drop | Arrastar candidato para outra etapa |
| Campo de data | Digitar ou selecionar a data da etapa |
| Botão 今日 | Ao lado do campo de data — preenche com a data de hoje e move o candidato |

### Sidebar esquerda — fábricas

| Funcionalidade | Especificação |
|---------------|--------------|
| Lista de fábricas | Nome + total de candidatos ativos |
| Mini-badges por etapa | 連絡前 X / 対応中 X / ストック X por fábrica |
| Filtro por fábrica | Clicar na fábrica filtra o painel principal |

### Filtros e busca (topo)

| Funcionalidade | Especificação |
|---------------|--------------|
| Busca | Por 氏名 ou 電話番号 |
| Filtro 工場 | Dropdown com todas as fábricas |
| Filtro 国籍 | Dropdown |
| Filtro 性別 | Dropdown |
| Filtro 期間 (登録日) | Range de datas |

### Barra de hoje (今日の予定)

| Funcionalidade | Especificação |
|---------------|--------------|
| アラート badge | Número de candidatos com ação pendente hoje |
| Lista de nomes | Candidatos agendados para hoje aparecem no topo |

### Descartado

| Item | Motivo |
|------|--------|
| Ordenação manual dentro da etapa | Desnecessário — ordem de chegada é suficiente |
| Seleção múltipla em lote | Custo alto, baixa necessidade no MVP |

---

## Pontos Ainda em Aberto

| # | Questão | Impacto |
|---|---------|---------|
| 1 | ✅ Campos do formulário definidos | Schema do banco concluído |
| 2 | Precisa registrar número do `在留カード`? | Privacidade + LGPD japonesa (個人情報保護法) |
| 3 | Quais fábricas/locais entram no MVP? | Estrutura inicial da tabela `locations` |
| 4 | Existe prazo para lançar? | Escopo do MVP |
| 5 | Como candidato chega ao formulário? (anúncio, QR, link direto?) | UX do fluxo de entrada |
| 6 | `nivel_japones` — quais opções exatas mostrar no formulário? | Enum da coluna |
| 7 | `turnos_possiveis` — como chamar os turnos? (昼直/夜直 ou outro nome?) | Enum da coluna |

---

## Riscos Críticos

- Sem `ふりがな` → erros em nomes japoneses na documentação
- Sem controle de `在留資格` → risco legal de contratação
- Dados sem proteção adequada → violação da 個人情報保護法
- Dois 担当者 contatando o mesmo candidato → necessário histórico visível
- Calendário sem JST → erros de agendamento

---

## Histórico de Decisões

| Data | Decisão |
|------|---------|
| 2026-06-01 | Projeto iniciado. Stack definida: WordPress (público) + Next.js + Supabase. |
| 2026-06-01 | Pipeline definido: 応募日→対応中→面接日→見学日→内定→入社 + ストック/NG/ブラック. |
| 2026-06-01 | ブラック definido como flag booleana, não etapa do pipeline. |
| 2026-06-01 | Candidato não tem login — só preenche formulário público. |
| 2026-06-01 | Hierarquia flat: cada 担当者 gerencia sua fábrica de forma autônoma. |
| 2026-06-01 | Campos do formulário de candidato definidos — 21 campos confirmados pelo usuário. |
