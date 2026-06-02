# CRM Recrutamento Japão — Discussão Inicial dos Agentes

> Documento de alinhamento estratégico. Atualizar conforme decisões forem tomadas.

---

## Visão Geral do Projeto

Site de recrutamento voltado para o mercado japonês, com foco em:
- Agendamento de etapas do processo seletivo (面接・見学・入社)
- Gestão centralizada de candidatos
- Visão por fábrica / escritório
- Dashboard operacional para recrutadores

---

## 1. Posicionamento Estratégico — Vision Chief

**Pergunta central:** Para quem é esse sistema?

- **Usuário primário:** Recrutadores internos (por fábrica/escritório)
- **Usuário secundário:** Candidatos (recebem convite, confirmam presença)
- **Stakeholder:** Gestores que precisam do painel consolidado

**Narrativa do produto:**
> "Um sistema simples que elimina o caos de planilhas e WhatsApp no recrutamento de fábrica no Japão."

**Questões em aberto:**
- [ ] O candidato acessa o sistema ou só recebe notificações?
Candidato preenche um formulário via site e cai no sistema.
- [ ] Recrutadores por fábrica têm autonomia total ou existe hierarquia?
Cada Tantousha vai cuidar da sua fábrica.
- [ ] Existe integração com algum sistema de RH já existente?
Vou criar do zero. 
---

## 2. Stack Tecnológica — CTO Architect

**Decisão principal: Build custom com stack enxuto.**

Plataformas ocidentais (Lever, Ashby, Greenhouse) não atendem bem o mercado japonês — sem suporte adequado ao idioma e sem flexibilidade para o contexto de fábrica.

### Stack Recomendada

| Camada | Tecnologia | Motivo |
|--------|-----------|--------|
| Frontend | Next.js (React) | i18n nativo, SSR, SEO |
| Banco de dados | **Supabase (PostgreSQL)** | Auth + Realtime + Storage gratuitos |
| Agenda | FullCalendar.js | Suporte a japonês, flexível |
| Autenticação | Supabase Auth | Já incluso, controle por perfil |
| Deploy | Vercel + Supabase | Free tier suficiente para MVP |
| Estilo | Tailwind CSS | Velocidade de desenvolvimento |

### Princípio do CTO:
> "A melhor arquitetura é a mais simples que resolve o problema pelos próximos 18 meses."

**Questões em aberto:**
- [ ] Existe domínio já registrado para o site?
sim, o site é https://jobs-human.com/ e uso wordpress elementor.
- [ ] Precisa de app mobile ou só web?
só web
- [ ] Quantos usuários recrutadores simultâneos no MVP?
Talvez tenha uns 10 à 15

---

## 3. Schema do Banco de Dados — Proposta Inicial

```sql
-- Locais de trabalho (fábricas / escritórios)
locations
  id, nome, tipo (fábrica | escritório), cidade, responsavel_id

-- Recrutadores
users
  id, nome, email, role (admin | recruiter), location_id

-- Candidatos
candidates
  id, nome, furigana, nacionalidade, zairyu_status,
  telefone, email, location_id, created_at

-- Etapas do processo
pipeline_stages
  id, candidate_id, stage (応募|書類審査|面接|見学|内定|入社|不採用),
  status, updated_by, updated_at, notas

-- Agendamentos
appointments
  id, candidate_id, location_id, tipo (面接|見学|入社|その他),
  data_hora, duracao_min, responsavel_id, status, observacoes
```

**Campos importantes para o Japão:**
- `furigana` — leitura do nome em hiragana (obrigatório em formulários japoneses)
- `zairyu_status` — tipo de visto/residência (`永住者`, `技能実習`, `特定技能`, etc.)
- `nacionalidade` — relevante para documentação e elegibilidade

**Questões em aberto:**
- [ ] Quais campos são obrigatórios no formulário de cadastro?
- [ ] Precisa registrar `在留カード` (número do cartão de residência)?
- [ ] Candidatos podem se candidatar por conta própria ou só via recrutador?

---

## 4. Jornadas dos Usuários — UX Designer

### Jornada do Recrutador

```
1. Login no sistema
2. Ver painel geral → candidatos por etapa / por fábrica
3. Novo candidato → preencher formulário
4. Agendar 面接 → escolher data/hora disponível
5. Candidato comparece → mover para próxima etapa
6. 見学 → agendar visita à fábrica
7. 内定 → registrar oferta
8. 入社 → confirmar início
```

### Jornada do Candidato (se tiver acesso)

```
1. Receber link/convite por email ou WhatsApp
2. Acessar página de agendamento
3. Escolher horário disponível para 面接
4. Confirmar presença
5. Receber lembrete automático
```

### Pontos críticos de UX para o Japão:
- Formato de data: `2026年6月1日（月）`
- Formato de hora: `14:00〜15:00`
- Nomes: sempre `姓` + `名` separados + campo `ふりがな`
- Interface em japonês por padrão

**Questões em aberto:**
- [ ] Candidato precisa de login próprio ou acesso por link único?
- [ ] Sistema envia notificações? (Email? LINE? SMS?)
- [ ] Recrutador precisa de app mobile para agendar em campo?

---

## 5. Dashboard Operacional — COO Orchestrator

### Três níveis de visualização:

**Nível Estratégico** (visão geral)
- Total de candidatos ativos
- Vagas abertas por fábrica
- Taxa de conversão: aplicação → entrada

**Nível Operacional** (por fábrica)
- Pipeline completo: `応募 → 面接 → 見学 → 内定 → 入社`
- Candidatos em cada etapa
- Tempo médio por etapa

**Nível Tático** (agenda da semana)
- Agendamentos desta semana por recrutador
- Pendências (candidatos sem próxima etapa definida)
- Próximas 入社 confirmadas

### Métricas principais:
| Métrica | Descrição |
|---------|-----------|
| Time-to-hire | Dias entre `応募` e `入社` |
| Taxa 面接→内定 | Conversão entrevista para oferta |
| Taxa 内定→入社 | Conversão oferta para início real |
| Candidatos por fábrica | Volume por local |

---

## 6. Riscos e Pontos de Atenção — Charlie Munger (Inversão)

> "Inverta: o que garantiria que esse sistema falhasse?"

- **Sem `ふりがな`** → erros em nomes japoneses, confusão em documentação
- **Sem controle de `在留資格`** → problemas legais de contratação
- **Sem notificação automática** → candidatos não aparecem na 面接
- **Interface só em português/inglês** → recrutadores japoneses não usam
- **Dados de candidatos sem segurança** → violação da Lei de Proteção de Dados do Japão (個人情報保護法)
- **Sem histórico de contato** → dois recrutadores contatam o mesmo candidato
- **Calendário sem fuso horário JST** → erros de agendamento

---

## 7. MVP — Escopo Mínimo Viável

Para começar **rápido e com valor real**, o MVP deve ter apenas:

### ✅ Incluir no MVP
- [ ] Formulário de cadastro de candidato (japonês)
- [ ] Lista de candidatos por fábrica/escritório
- [ ] Agendamento simples (面接, 見学, 入社)
- [ ] Pipeline básico com etapas
- [ ] Dashboard com visão por fábrica
- [ ] Login para recrutadores

### ❌ Deixar para depois
- App mobile
- Notificações automáticas (email/LINE)
- Portal do candidato com login
- Relatórios avançados
- Integração com sistemas de RH externos
- IA para triagem de candidatos

---

## 8. Próximas Decisões (Prioridade Alta)

| # | Decisão | Impacto |
|---|---------|---------|
| 1 | Candidato acessa o sistema? | Define toda a arquitetura de auth |
| 2 | Quais campos no formulário? | Define o schema do banco |
| 3 | Quais fábricas/locais no MVP? | Define volume e estrutura |
| 4 | Notificações são essenciais no MVP? | Define complexidade inicial |
| 5 | Existe prazo para lançar? | Define escopo do MVP |

---

## Histórico de Discussão

| Data | Decisão |
|------|---------|
| 2026-06-01 | Discussão inicial criada. Stack definida: Next.js + Supabase. |

