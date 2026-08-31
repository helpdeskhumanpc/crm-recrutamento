const { createClient } = supabase
const sb = createClient('https://xzxfwrbebkwagnropgfb.supabase.co','sb_publishable_rPu8_l2pdy3XtOTAus6Mxw_rp2HO_XE')

// ─── Sidebar retrátil (desktop) ──────────────────────────────
function alternarSidebarColapsada() {
  document.body.classList.toggle('sidebar-collapsed')
  const colapsada = document.body.classList.contains('sidebar-collapsed')
  localStorage.setItem('sidebarCollapsed', colapsada ? '1' : '0')
  document.getElementById('btnSidebarCollapse').textContent = colapsada ? '›' : '‹'
}
if (localStorage.getItem('sidebarCollapsed') === '1') {
  document.body.classList.add('sidebar-collapsed')
  document.getElementById('btnSidebarCollapse').textContent = '›'
}

// ─── Tema claro/escuro ──────────────────────────────────────
function alternarTema() {
  document.body.classList.toggle('dark-mode')
  localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light')
  document.getElementById('btnTemaToggle')?.classList.toggle('active', document.body.classList.contains('dark-mode'))
  if (document.getElementById('chartsView')?.style.display !== 'none') renderCharts()
}
if (localStorage.getItem('theme') === 'dark') {
  document.body.classList.add('dark-mode')
  document.getElementById('btnTemaToggle')?.classList.add('active')
}

// ─── Visualização forçada mobile/desktop (só disponível em tela de PC) ───
function alternarLayout() {
  document.body.classList.toggle('force-mobile')
  const ativo = document.body.classList.contains('force-mobile')
  localStorage.setItem('layout', ativo ? 'mobile' : 'desktop')
  document.getElementById('btnLayoutToggle')?.classList.toggle('active', ativo)
  document.getElementById('btnVoltarDesktop').style.display = ativo ? '' : 'none'
}
if (window.innerWidth > 768) {
  document.getElementById('btnLayoutToggle').style.display = ''
  if (localStorage.getItem('layout') === 'mobile') {
    document.body.classList.add('force-mobile')
    document.getElementById('btnLayoutToggle').classList.add('active')
    document.getElementById('btnVoltarDesktop').style.display = ''
  }
}

let todosOsCandidatos = []
let todasFabricas = []
let todasLocations = []
let fabricaAtiva = null
let shokaiAtivo = null
let jimushoAtivo = false
let jimushoAtivoNome = null
let telefonesDuplicados = new Set()

function recalcularDuplicados() {
  const counts = {}
  todosOsCandidatos.forEach(c => {
    const tel = (c.telefone || '').replace(/\D/g, '')
    if (!tel) return
    counts[tel] = (counts[tel] || 0) + 1
  })
  telefonesDuplicados = new Set(Object.keys(counts).filter(t => counts[t] > 1))
}

function isTelDuplicado(c) {
  const tel = (c.telefone || '').replace(/\D/g, '')
  return tel && telefonesDuplicados.has(tel)
}
let candidatoAtivo = null
// domingo da semana atual — inicio da janela de 14 dias (2 linhas de 7) exibida no calendario
function inicioDaSemana(d) { const r = new Date(d); r.setHours(0,0,0,0); r.setDate(r.getDate() - r.getDay()); return r }
let calRefDate = inicioDaSemana(new Date())

const STAGES = [
  { key:'renrakumae', label:'連絡前',  cls:'stage-renrakumae' },
  { key:'taiochu',   label:'対応中',  cls:'stage-taiochu'    },
  { key:'mensetsu',  label:'面接',    cls:'stage-mensetsu'   },
  { key:'kentouchu', label:'検討中',  cls:'stage-kentouchu'  },
  { key:'kengaku',   label:'見学・ヒアリング',    cls:'stage-kengaku'    },
  { key:'naitei',    label:'内定',    cls:'stage-naitei'     },
  { key:'nyusha',    label:'入社',    cls:'stage-nyusha'     },
  { key:'zaiseki',   label:'在籍',    cls:'stage-zaiseki'    },
  { key:'stock',     label:'工場ストック', cls:'stage-stock'     },
  { key:'ng',        label:'NG',      cls:'stage-ng'         },
  { key:'black',     label:'ブラック', cls:'stage-black'     },
]

// Ordem do mais avançado pro menos avançado — usado pra movimentação em massa
// (avançar/voltar). Cada entrada guarda o(s) campo(s) que marcam essa etapa;
// "voltar" pra uma etapa apaga o(s) campo(s) de tudo que está acima dela aqui.
const STAGE_CHAIN = [
  { key:'ng',        label:'NG',      fields:['dt_ng'] },
  { key:'stock',     label:'工場ストック', fields:['dt_stock'] },
  { key:'zaiseki',   label:'在籍',    fields:['dt_zaiseki'] },
  { key:'nyusha',    label:'入社',    fields:['dt_nyusha'] },
  { key:'naitei',    label:'内定',    fields:['dt_naitei'] },
  { key:'kengaku',   label:'見学・ヒアリング', fields:['dt_kengaku','kengaku_hora'] },
  { key:'kentouchu', label:'検討中',  fields:['dt_kentouchu'] },
  { key:'mensetsu',  label:'面接',    fields:['dt_mensetsu','mensetsu_hora'] },
  { key:'taiochu',   label:'対応中',  fields:['dt_taiochu'] },
]

function hojeISO() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}

function getStage(c) {
  if (c.is_blacklisted) return 'black'
  if (c.dt_ng)          return 'ng'
  if (c.dt_stock)       return 'stock'
  if (c.dt_zaiseki)     return 'zaiseki'
  if (c.dt_nyusha) {
    const now = new Date()
    const nyushaDate = new Date(c.dt_nyusha + 'T00:00:00')
    if (nyushaDate.getFullYear() < now.getFullYear() ||
        (nyushaDate.getFullYear() === now.getFullYear() && nyushaDate.getMonth() < now.getMonth())) {
      return 'zaiseki'
    }
    if (c.dt_nyusha <= hojeISO()) return 'nyusha'
  }
  if (c.dt_naitei)      return 'naitei'
  if (c.dt_kengaku)     return 'kengaku'
  if (c.dt_kentouchu)   return 'kentouchu'
  if (c.dt_mensetsu)    return 'mensetsu'
  if (c.dt_taiochu)     return 'taiochu'
  return 'renrakumae'
}

function diasNaEtapa(c) {
  const stage = getStage(c)
  const dateMap = { renrakumae: c.created_at, taiochu: c.dt_taiochu, mensetsu: c.dt_mensetsu, kentouchu: c.dt_kentouchu, kengaku: c.dt_kengaku, naitei: c.dt_naitei, nyusha: c.dt_nyusha, zaiseki: c.dt_zaiseki || c.dt_nyusha, stock: c.dt_stock, ng: c.dt_ng, black: c.created_at }
  const d = dateMap[stage]
  if (!d) return { text: '—', alert: false }
  const dias = Math.floor((Date.now() - new Date(d)) / 86400000)
  return { text: dias === 0 ? '今日' : dias + '日', alert: dias >= 7 }
}

// 紹介者は登録時に固定。全体ストック／NG／ブラックになってから5日経過した場合のみ変更可能
// admin は期間に関係なく常に変更可能
function shokaiBloqueado(c) {
  if (currentProfile?.role === 'admin') return false
  let ref = null
  if (c.dt_stock_geral) ref = c.dt_stock_geral
  else if (c.dt_ng)     ref = c.dt_ng
  if (!ref) return true
  const dias = Math.floor((Date.now() - new Date(ref)) / 86400000)
  return dias < 5
}

async function carregarDados() {
  document.getElementById('pipeline').innerHTML = '<div class="loading">読み込み中...</div>'
  let locQuery = sb.from('locations').select('id,nome,jimusho,order_atual,naitei_atual').eq('tipo', '工場').order('nome')
  if (currentProfile?.role !== 'admin') locQuery = locQuery.eq('ativo', true)
  const [res1, res2] = await Promise.all([
    sb.from('candidates').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
    locQuery
  ])
  todosOsCandidatos = res1.data || []
  todasLocations    = res2.data || []
  todasFabricas     = todasLocations.map(f => f.nome)
  recalcularDuplicados()
  carregarSidebar()
  carregarCalFabricaFilter()
  carregarChartFabricaFilter()
  if (jimushoAtivo) atualizarLabelFiltroFabrica(jimushoAtivoNome)
  renderAlerts()
  renderPipeline()
  renderCalendar()
  if (document.getElementById('chartsView').style.display      !== 'none') renderCharts()
  if (document.getElementById('shokaiView').style.display      !== 'none') renderShokaiAnalise()
  if (document.getElementById('leadsView').style.display       !== 'none') renderLeads()
  if (document.getElementById('orderStatusView').style.display !== 'none') renderOrderStatus()
}

// 工場２が設定されている場合はそちらを優先
function fabricaEfetiva(c) { return c.fabrica2 || c.fabrica }

// cor por fábrica na agenda — varia entre fábricas do mesmo escritório; pode repetir entre escritórios diferentes
const PALETA_FABRICA = ['#1e88e5','#43a047','#fb8c00','#8e24aa','#00acc1','#e53935','#3949ab','#00897b','#d81b60','#6d4c41']
function corDaFabrica(nomeFabrica) {
  if (!nomeFabrica) return '#888'
  const loc = todasLocations.find(l => l.nome === nomeFabrica)
  const jimusho = loc?.jimusho || '_sem_jimusho_'
  const irmas = todasLocations.filter(l => (l.jimusho || '_sem_jimusho_') === jimusho).map(l => l.nome).sort()
  const idx = Math.max(0, irmas.indexOf(nomeFabrica))
  return PALETA_FABRICA[idx % PALETA_FABRICA.length]
}

function carregarSidebar() {
  const candidatos = todosOsCandidatos.filter(c => c.origem !== 'web' && c.origem !== 'web_stock')
  const fabricas = currentProfile?.role === 'admin'
    ? todasFabricas
    : [...new Set(candidatos.map(c => fabricaEfetiva(c)).filter(Boolean))].sort()
  const container = document.getElementById('sidebarFabricas')
  container.innerHTML = ''
  document.getElementById('totalCount').textContent = candidatos.length + '名'
  const meusCount = currentProfile?.shokai_nome ? candidatos.filter(c => c.shokai === currentProfile.shokai_nome).length : 0
  document.getElementById('meuShokaiCount').textContent = meusCount + '名'
  fabricas.forEach(f => {
    const count = candidatos.filter(c => fabricaEfetiva(c) === f).length
    const div = document.createElement('div')
    div.className = 'sidebar-item'
    div.innerHTML = `<div class="factory-name">${f}</div><div class="factory-count">${count}名</div>`
    div.onclick = () => filtrarFabrica(f, div)
    container.appendChild(div)
  })

  // admin: lista cada escritório, pra ver o まとめ de qualquer um deles
  if (currentProfile?.role === 'admin') {
    const jimushos = [...new Set(todasLocations.map(l => l.jimusho).filter(Boolean))].sort()
    document.getElementById('tituloJimushos').style.display = jimushos.length ? '' : 'none'
    const jimushoContainer = document.getElementById('sidebarJimushos')
    jimushoContainer.innerHTML = ''
    jimushos.forEach(jm => {
      const div = document.createElement('div')
      div.className = 'sidebar-item sidebar-special'
      div.innerHTML = `<div class="factory-name">${jm}まとめ</div>`
      div.onclick = () => filtrarJimushoMatome(jm, div)
      jimushoContainer.appendChild(div)
    })
  }
}

function carregarCalFabricaFilter() {
  const sel = document.getElementById('calFabricaFilter')
  sel.innerHTML = '<option value="">全工場</option>'
  todasFabricas.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o) })
}

// rótulo do dropdown "全工場"/"全体" — mostra o nome do escritório quando em 事務所まとめ
function atualizarLabelFiltroFabrica(jimusho) {
  const calOpt = document.querySelector('#calFabricaFilter option[value=""]')
  const chOpt  = document.querySelector('#chartFabrica option[value=""]')
  if (calOpt) calOpt.textContent = jimusho ? `${jimusho}（全工場）` : '全工場'
  if (chOpt)  chOpt.textContent  = jimusho ? `${jimusho}（全工場）` : '全体'
}

// se estava em Leads do Site / 全体ストック / 紹介リンク, volta para o painel 状況
function voltarParaPipelineSeNecessario() {
  const leads = document.getElementById('leadsView')
  const pool  = document.getElementById('stockPoolView')
  const vlink = document.getElementById('vagasLinkView')
  if (leads.style.display === 'flex' || pool.style.display === 'flex' || vlink.style.display === 'flex') {
    leads.style.display     = 'none'
    pool.style.display      = 'none'
    vlink.style.display     = 'none'
    document.getElementById('pipeline').style.display = 'block'
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelector('.tab-btn').classList.add('active')
  }
}

function filtrarFabrica(fabrica, el) {
  fabricaAtiva = fabrica
  shokaiAtivo = null
  jimushoAtivo = false
  jimushoAtivoNome = null
  voltarParaPipelineSeNecessario()
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
  if (el) el.classList.add('active')
  // sincroniza filtros do calendário e gráficos
  const calSel = document.getElementById('calFabricaFilter')
  const chSel  = document.getElementById('chartFabrica')
  if (calSel) calSel.value = fabrica || ''
  if (chSel)  chSel.value  = fabrica || ''
  atualizarLabelFiltroFabrica(null)
  atualizarFabricaOrderBar()
  renderPipeline()
  renderCalendar()
  renderCharts()
  if (document.getElementById('orderStatusView').style.display !== 'none') renderOrderStatus()
}

function atualizarDropdownShokai() {
  const sel = document.getElementById('filterShokaiSelect')
  if (!sel) return
  const pool = fabricaAtiva
    ? todosOsCandidatos.filter(c => fabricaEfetiva(c) === fabricaAtiva)
    : todosOsCandidatos
  const nomes = [...new Set(pool.map(c => c.shokai).filter(Boolean))].sort()
  sel.innerHTML = '<option value="">紹介者：全て</option>' +
    nomes.map(n => `<option value="${n}" ${n === shokaiAtivo ? 'selected' : ''}>${n}</option>`).join('')
}

function onShokaiSelectChange() {
  shokaiAtivo = document.getElementById('filterShokaiSelect').value || null
  renderPipeline()
  if (document.getElementById('calendarView').style.display !== 'none') renderCalendar()
  if (document.getElementById('chartsView').style.display   !== 'none') renderCharts()
}

function filtrarMeuShokai(el) {
  if (!currentProfile?.shokai_nome) {
    alert('プロフィールに紹介者名（shokai_nome）が設定されていません。管理者に確認してください。')
    return
  }
  fabricaAtiva = null
  shokaiAtivo = currentProfile.shokai_nome
  jimushoAtivo = false
  jimushoAtivoNome = null
  voltarParaPipelineSeNecessario()
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
  if (el) el.classList.add('active')
  // limpa filtros de fábrica do calendário e gráficos
  const calSel = document.getElementById('calFabricaFilter')
  const chSel  = document.getElementById('chartFabrica')
  if (calSel) calSel.value = ''
  if (chSel)  chSel.value  = ''
  atualizarLabelFiltroFabrica(null)
  atualizarFabricaOrderBar()
  renderPipeline()
  renderCalendar()
  renderCharts()
  if (document.getElementById('orderStatusView').style.display !== 'none') renderOrderStatus()
}

function filtrarJimushoMatome(jimusho, el) {
  const jm = jimusho || currentProfile?.jimusho
  if (!jm) return
  fabricaAtiva = null
  shokaiAtivo = null
  jimushoAtivo = true
  jimushoAtivoNome = jm
  voltarParaPipelineSeNecessario()
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
  if (el) el.classList.add('active')
  const calSel = document.getElementById('calFabricaFilter')
  const chSel  = document.getElementById('chartFabrica')
  if (calSel) calSel.value = ''
  if (chSel)  chSel.value  = ''
  atualizarLabelFiltroFabrica(jm)
  atualizarFabricaOrderBar()
  renderPipeline()
  renderCalendar()
  renderCharts()
  if (document.getElementById('orderStatusView').style.display !== 'none') renderOrderStatus()
}

// ─── FILTER PANEL ────────────────────────────────────────────
let activeFilters = {}

function abrirFilterPanel() {
  // popula nacionaidades e prefeituras dinamicamente
  const nacs  = [...new Set(todosOsCandidatos.map(c => c.nacionalidade).filter(Boolean))].sort()
  const prefs = [...new Set(todosOsCandidatos.map(c => c.prefecture).filter(Boolean))].sort()

  const nacDiv  = document.getElementById('fp-nac-chips')
  const prefDiv = document.getElementById('fp-pref-chips')
  if (!nacDiv.children.length) {
    nacs.forEach(n => {
      const l = document.createElement('label'); l.className = 'fp-chip'
      l.innerHTML = `<input type="checkbox" class="fp-nac" value="${n}"> ${n}`
      nacDiv.appendChild(l)
    })
  }
  if (!prefDiv.children.length) {
    prefs.forEach(p => {
      const l = document.createElement('label'); l.className = 'fp-chip'
      l.innerHTML = `<input type="checkbox" class="fp-pref" value="${p}"> ${p}`
      prefDiv.appendChild(l)
    })
  }
  document.getElementById('filterPanel').classList.add('open')
  document.getElementById('filterOverlay').style.display = 'block'
}

function fecharFilterPanel() {
  document.getElementById('filterPanel').classList.remove('open')
  document.getElementById('filterOverlay').style.display = 'none'
}

function resetFilterPanel() {
  document.querySelectorAll('.fp-jp, .fp-stage, .fp-emp, .fp-nac, .fp-pref, .fp-turno, .fp-menkyo, .fp-exp').forEach(c => c.checked = false)
  document.querySelector('input[name="fp-apt"][value=""]').checked = true
  document.querySelector('input[name="fp-sexo"][value=""]').checked = true
  document.querySelector('input[name="fp-move"][value=""]').checked = true
  document.getElementById('fp-age-max').value = ''
  activeFilters = {}
  atualizarBadge()
  renderPipeline()
  renderLeads()
}

function aplicarFilterPanel() {
  activeFilters = {
    jp:     [...document.querySelectorAll('.fp-jp:checked')].map(c => c.value),
    stage:  [...document.querySelectorAll('.fp-stage:checked')].map(c => c.value),
    emp:    [...document.querySelectorAll('.fp-emp:checked')].map(c => c.value),
    nac:    [...document.querySelectorAll('.fp-nac:checked')].map(c => c.value),
    pref:   [...document.querySelectorAll('.fp-pref:checked')].map(c => c.value),
    turno:  [...document.querySelectorAll('.fp-turno:checked')].map(c => c.value),
    menkyo: [...document.querySelectorAll('.fp-menkyo:checked')].map(c => c.value),
    exp:    [...document.querySelectorAll('.fp-exp:checked')].map(c => c.value),
    apt:    document.querySelector('input[name="fp-apt"]:checked').value,
    sexo:   document.querySelector('input[name="fp-sexo"]:checked').value,
    move:   document.querySelector('input[name="fp-move"]:checked').value,
    ageMax: parseInt(document.getElementById('fp-age-max').value) || null,
  }
  atualizarBadge()
  fecharFilterPanel()
  renderPipeline()
  renderLeads()
}

function atualizarBadge() {
  const f = activeFilters
  const count = (f.jp?.length||0) + (f.stage?.length||0) + (f.emp?.length||0) +
    (f.nac?.length||0) + (f.pref?.length||0) + (f.turno?.length||0) +
    (f.apt ? 1 : 0) + (f.sexo ? 1 : 0) + (f.move ? 1 : 0) + (f.ageMax ? 1 : 0)
  const badge = document.getElementById('filterBadge')
  badge.textContent = count
  badge.style.display = count > 0 ? 'inline' : 'none'
}

function toggleStageFilter() {
  const box = document.getElementById('stageFilterBox')
  box.style.display = box.style.display === 'none' ? 'block' : 'none'
}

function selectAllStages(val) {
  document.querySelectorAll('.stage-chk').forEach(c => c.checked = val)
  renderPipeline()
}

function getStagesVisiveis() {
  const chks = [...document.querySelectorAll('.stage-chk:checked')].map(c => c.value)
  return chks.length > 0 ? chks : STAGES.map(s => s.key)
}

function imprimirPDF() {
  if (document.getElementById('leadsView').style.display === 'flex') { imprimirPDFLeads(); return }
  const fab = `【${labelFiltroAtivo()}】`
  let candidatos = getFiltrados()
  if (_selecionadosImpressao.size > 0) candidatos = candidatos.filter(c => _selecionadosImpressao.has(c.id))
  const stagesVisiveis = getStagesVisiveis()

  const linhas = STAGES
    .filter(s => stagesVisiveis.includes(s.key))
    .map(stage => {
      const list = candidatos.filter(c => getStage(c) === stage.key)
      if (!list.length) return ''
      return `<tr class="stage-row"><td colspan="11">${stage.label}（${list.length}名）</td></tr>` +
        list.map((c, i) => `<tr class="${i%2===0?'even':''}">
          <td>${c.shimei||'—'}</td>
          <td>${c.idade||'—'}</td>
          <td>${c.sexo==='男性'?'男':c.sexo==='女性'?'女':'—'}</td>
          <td>${c.created_at ? fmtDataPT(c.created_at.slice(0,10)) : '—'}</td>
          <td>${c.telefone||'—'}</td>
          <td>${c.fabrica||'—'}</td>
          <td>${c.shokai||'—'}</td>
          <td>${c.nivel_japones?.split('〜')[0]||'—'}</td>
          <td>${c.prefecture||'—'}</td>
          <td>${c.city||'—'}</td>
          <td class="comment">${(c.tantousha_comentario||'—').replace(/</g,'&lt;')}</td>
        </tr>`).join('')
    }).join('')

  const w = window.open('', '_blank')
  if (!w) { alert('⚠️ ポップアップがブロックされました。\nブラウザのアドレスバーでこのサイトのポップアップを許可してください。'); return }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>候補者リスト</title>
    <style>
      body { font-family: 'Helvetica Neue', sans-serif; font-size: 11px; padding: 20px; color: #333; }
      h2 { font-size: 15px; margin-bottom: 4px; }
      p { font-size: 12px; color: #666; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #333; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; }
      tr.even td { background: #f9f9f9; }
      tr.stage-row td { background: #e8f0fe; font-weight: 700; font-size: 12px; padding: 6px 8px; color: #1a237e; }
      td.comment { font-size: 10px; color: #555; max-width: 220px; }
      @media print { button { display: none } }
    </style>
    </head><body>
    <h2>候補者リスト ${fab}</h2>
    <p>出力日：${new Date().toLocaleDateString('ja-JP')}　総候補者: ${candidatos.length}名</p>
    <button onclick="window.print()" style="margin-bottom:14px;padding:7px 18px;background:#1e88e5;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">印刷 / PDF保存</button>
    <table>
      <thead><tr><th>氏名</th><th>年齢</th><th>性別</th><th>登録日</th><th>電話番号</th><th>工場</th><th>紹介者</th><th>日本語</th><th>都道府県</th><th>市区町村</th><th>コメント</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></body></html>`)
  w.document.close()
}

const CAMPOS_PDF = [
  { key: 'numero_cadastro',      label: '番号',        group: '基本情報', get: c => c.numero_cadastro ?? '—' },
  { key: 'shimei',                label: '氏名',        group: '基本情報', get: c => c.shimei || '—' },
  { key: 'idade',                 label: '年齢',        group: '基本情報', get: c => c.idade || '—' },
  { key: 'sexo',                  label: '性別',        group: '基本情報', get: c => c.sexo==='男性'?'男':c.sexo==='女性'?'女':'—' },
  { key: 'data_nascimento',       label: '生年月日',     group: '基本情報', get: c => c.data_nascimento ? fmtDataPT(c.data_nascimento) : '—' },
  { key: 'nacionalidade',         label: '国籍',        group: '基本情報', get: c => c.nacionalidade || '—' },
  { key: 'telefone',              label: '電話番号',     group: '基本情報', get: c => c.telefone || '—' },
  { key: 'postal_code',           label: '〒',          group: '基本情報', get: c => c.postal_code || '—' },
  { key: 'prefecture',            label: '都道府県',     group: '基本情報', get: c => c.prefecture || '—' },
  { key: 'city',                  label: '市区町村',     group: '基本情報', get: c => c.city || '—' },
  { key: 'visa',                  label: 'ビザ',        group: '仕事情報', get: c => c.visa || '—' },
  { key: 'esta_empregado',        label: '現在仕事中',   group: '仕事情報', get: c => c.esta_empregado || '—' },
  { key: 'fabrica',               label: '工場',        group: '仕事情報', get: c => c.fabrica || '—' },
  { key: 'fabrica2',              label: '工場２',       group: '仕事情報', get: c => c.fabrica2 || '—' },
  { key: 'shokai',                label: '紹介者',       group: '仕事情報', get: c => c.shokai || '—' },
  { key: 'precisa_apartamento',   label: 'アパート必要', group: '仕事情報', get: c => c.precisa_apartamento ? '必要' : '不要' },
  { key: 'pode_mudar',            label: '引っ越し',     group: '仕事情報', get: c => c.pode_mudar ? '可能' : '不可' },
  { key: 'tem_carro',             label: '車の所有',     group: '仕事情報', get: c => c.tem_carro ? 'あり' : 'なし' },
  { key: 'nivel_japones',         label: '日本語力',     group: 'スキル', get: c => c.nivel_japones || '—' },
  { key: 'hiragana',              label: 'ひらがな',     group: 'スキル', get: c => c.hiragana || '—' },
  { key: 'katakana',              label: 'カタカナ',     group: 'スキル', get: c => c.katakana || '—' },
  { key: 'fala_ingles',           label: '英語会話',     group: 'スキル', get: c => c.fala_ingles ? 'はい' : 'いいえ' },
  { key: 'habilitacao',           label: '免許・資格',   group: 'スキル', get: c => asArr(c.habilitacao).join('・') || '—' },
  { key: 'experiencia',           label: '工場経験',     group: 'スキル', get: c => asArr(c.experiencia).join('・') || '—' },
  { key: 'turnos_possiveis',      label: '可能な直',     group: 'スキル', get: c => asArr(c.turnos_possiveis).join('・') || '—' },
  { key: 'created_at',            label: '登録日',       group: 'パイプライン日付', get: c => c.created_at ? fmtDataPT(c.created_at.slice(0,10)) : '—' },
  { key: 'dt_taiochu',            label: '対応中',       group: 'パイプライン日付', get: c => c.dt_taiochu ? fmtDataPT(c.dt_taiochu) : '—' },
  { key: 'dt_mensetsu',           label: '面接日',       group: 'パイプライン日付', get: c => c.dt_mensetsu ? fmtDataPT(c.dt_mensetsu) : '—' },
  { key: 'mensetsu_hora',         label: '面接時間',     group: 'パイプライン日付', get: c => c.mensetsu_hora || '—' },
  { key: 'dt_kentouchu',          label: '検討中日',     group: 'パイプライン日付', get: c => c.dt_kentouchu ? fmtDataPT(c.dt_kentouchu) : '—' },
  { key: 'dt_kengaku',            label: '見学・ヒアリング日', group: 'パイプライン日付', get: c => c.dt_kengaku ? fmtDataPT(c.dt_kengaku) : '—' },
  { key: 'kengaku_hora',          label: '見学時間',     group: 'パイプライン日付', get: c => c.kengaku_hora || '—' },
  { key: 'dt_naitei',             label: '内定日',       group: 'パイプライン日付', get: c => c.dt_naitei ? fmtDataPT(c.dt_naitei) : '—' },
  { key: 'dt_nyusha',             label: '入社日',       group: 'パイプライン日付', get: c => c.dt_nyusha ? fmtDataPT(c.dt_nyusha) : '—' },
  { key: 'dt_zaiseki',            label: '在籍日',       group: 'パイプライン日付', get: c => c.dt_zaiseki ? fmtDataPT(c.dt_zaiseki) : '—' },
  { key: 'dt_stock',              label: '工場ストック日', group: 'パイプライン日付', get: c => c.dt_stock ? fmtDataPT(c.dt_stock) : '—' },
  { key: 'dt_stock_geral',        label: '全体ストック日', group: 'パイプライン日付', get: c => c.dt_stock_geral ? fmtDataPT(c.dt_stock_geral) : '—' },
  { key: 'dt_ng',                 label: 'NG日',        group: 'パイプライン日付', get: c => c.dt_ng ? fmtDataPT(c.dt_ng) : '—' },
  { key: 'alerta_data',           label: 'アラート日時', group: 'アラート・メモ', get: c => c.alerta_data ? fmtDataPT(c.alerta_data.slice(0,10)) : '—' },
  { key: 'alerta_nota',           label: 'アラート内容', group: 'アラート・メモ', get: c => c.alerta_nota || '—' },
  { key: 'comentario',            label: 'コメント',     group: 'アラート・メモ', get: c => c.comentario || '—' },
  { key: 'tantousha_comentario',  label: '担当者コメント', group: 'アラート・メモ', get: c => c.tantousha_comentario || '—' },
  { key: 'is_blacklisted',        label: 'ブラック登録', group: 'ブラックリスト', get: c => c.is_blacklisted ? 'はい' : 'いいえ' },
  { key: 'blacklist_motivo',      label: 'ブラック理由', group: 'ブラックリスト', get: c => c.blacklist_motivo || '—' },
]

let _colunasSelecionadasPDF = []

function abrirPdfColModal() {
  _colunasSelecionadasPDF = []
  renderPdfColList()
  document.getElementById('pdfColModal').style.display = 'flex'
}

function fecharPdfColModal() {
  document.getElementById('pdfColModal').style.display = 'none'
}

function renderPdfColList() {
  const grupos = {}
  CAMPOS_PDF.forEach(f => { (grupos[f.group] = grupos[f.group] || []).push(f) })

  const allKeys = CAMPOS_PDF.map(f => f.key)
  const allChecked = allKeys.every(k => _colunasSelecionadasPDF.includes(k))

  const headerHtml = `<label style="display:flex;align-items:center;gap:6px;padding:8px 10px;margin-bottom:12px;background:#f5f5f5;border-radius:4px;cursor:pointer;font-weight:700;font-size:13px">
    <input type="checkbox" ${allChecked ? 'checked' : ''} onchange="toggleColunaTodos(this.checked)">
    <span>全て選択</span>
  </label>`

  const gruposHtml = Object.entries(grupos).map(([grupo, campos]) => {
    const keys = campos.map(f => f.key)
    const grupoChecked = keys.every(k => _colunasSelecionadasPDF.includes(k))
    return `
    <div style="margin-bottom:14px">
      <label style="display:flex;align-items:center;gap:6px;margin-bottom:6px;padding-bottom:3px;border-bottom:1px solid #f0f0f0;cursor:pointer">
        <input type="checkbox" ${grupoChecked ? 'checked' : ''} onchange="toggleColunaCategoria('${grupo}', this.checked)">
        <span style="font-size:11px;font-weight:700;color:#888;text-transform:uppercase">${grupo}</span>
      </label>
      <div style="display:grid;grid-template-columns:repeat(auto-fill, minmax(150px, 1fr));gap:6px">
        ${campos.map(f => {
          const idx = _colunasSelecionadasPDF.indexOf(f.key)
          const ordem = idx >= 0 ? ` (${idx + 1})` : ''
          return `<label style="display:flex;align-items:center;gap:6px;padding:6px 8px;border:1px solid #eee;border-radius:4px;cursor:pointer;font-size:13px">
            <input type="checkbox" ${idx >= 0 ? 'checked' : ''} onchange="toggleColunaPDF('${f.key}')">
            <span>${f.label}${ordem}</span>
          </label>`
        }).join('')}
      </div>
    </div>
  `}).join('')

  document.getElementById('pdfColList').innerHTML = headerHtml + gruposHtml
}

function toggleColunaPDF(key) {
  const idx = _colunasSelecionadasPDF.indexOf(key)
  if (idx >= 0) _colunasSelecionadasPDF.splice(idx, 1)
  else _colunasSelecionadasPDF.push(key)
  renderPdfColList()
}

function toggleColunaCategoria(grupo, checked) {
  const keys = CAMPOS_PDF.filter(f => f.group === grupo).map(f => f.key)
  if (checked) keys.forEach(k => { if (!_colunasSelecionadasPDF.includes(k)) _colunasSelecionadasPDF.push(k) })
  else _colunasSelecionadasPDF = _colunasSelecionadasPDF.filter(k => !keys.includes(k))
  renderPdfColList()
}

function toggleColunaTodos(checked) {
  _colunasSelecionadasPDF = checked ? CAMPOS_PDF.map(f => f.key) : []
  renderPdfColList()
}

function escHtml(v) {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

function imprimirPDFCustom() {
  if (_colunasSelecionadasPDF.length === 0) { alert('少なくとも1つの項目を選んでください。'); return }
  const campos = _colunasSelecionadasPDF.map(key => CAMPOS_PDF.find(f => f.key === key))
  fecharPdfColModal()

  const fab = `【${labelFiltroAtivo()}】`
  let candidatos = getFiltrados()
  if (_selecionadosImpressao.size > 0) candidatos = candidatos.filter(c => _selecionadosImpressao.has(c.id))
  const stagesVisiveis = getStagesVisiveis()

  const linhas = STAGES
    .filter(s => stagesVisiveis.includes(s.key))
    .map(stage => {
      const list = candidatos.filter(c => getStage(c) === stage.key)
      if (!list.length) return ''
      return `<tr class="stage-row"><td colspan="${campos.length}">${stage.label}（${list.length}名）</td></tr>` +
        list.map((c, i) => `<tr class="${i%2===0?'even':''}">${campos.map(f => `<td>${escHtml(f.get(c))}</td>`).join('')}</tr>`).join('')
    }).join('')

  const w = window.open('', '_blank')
  if (!w) { alert('⚠️ ポップアップがブロックされました。\nブラウザのアドレスバーでこのサイトのポップアップを許可してください。'); return }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>候補者リスト</title>
    <style>
      body { font-family: 'Helvetica Neue', sans-serif; font-size: 11px; padding: 20px; color: #333; }
      h2 { font-size: 15px; margin-bottom: 4px; }
      p { font-size: 12px; color: #666; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #333; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; }
      tr.even td { background: #f9f9f9; }
      tr.stage-row td { background: #e8f0fe; font-weight: 700; font-size: 12px; padding: 6px 8px; color: #1a237e; }
      @media print { button { display: none } }
    </style>
    </head><body>
    <h2>候補者リスト ${fab}</h2>
    <p>出力日：${new Date().toLocaleDateString('ja-JP')}　総候補者: ${candidatos.length}名</p>
    <button onclick="window.print()" style="margin-bottom:14px;padding:7px 18px;background:#1e88e5;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">印刷 / PDF保存</button>
    <table>
      <thead><tr>${campos.map(f => `<th>${f.label}</th>`).join('')}</tr></thead>
      <tbody>${linhas}</tbody>
    </table></body></html>`)
  w.document.close()
}

function exportarExcelCustom() {
  if (_colunasSelecionadasPDF.length === 0) { alert('少なくとも1つの項目を選んでください。'); return }
  const campos = _colunasSelecionadasPDF.map(key => CAMPOS_PDF.find(f => f.key === key))
  fecharPdfColModal()

  let candidatos = getFiltrados()
  if (_selecionadosImpressao.size > 0) candidatos = candidatos.filter(c => _selecionadosImpressao.has(c.id))
  const stagesVisiveis = getStagesVisiveis()

  try {
    const linhas = []
    STAGES.filter(s => stagesVisiveis.includes(s.key)).forEach(stage => {
      candidatos.filter(c => getStage(c) === stage.key).forEach(c => {
        const row = { '状況': stage.label }
        campos.forEach(f => { row[f.label] = f.get(c) })
        linhas.push(row)
      })
    })

    if (linhas.length === 0) { alert('出力する候補者がいません。'); return }

    const ws = XLSX.utils.json_to_sheet(linhas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '候補者リスト')
    // nome de arquivo sem caracteres que quebram no Windows/Mac
    const fab = labelFiltroAtivo().replace(/[\\/:*?"<>|]/g, '_')
    const hoje = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `候補者リスト_${fab}_${hoje}.xlsx`)
  } catch (err) {
    console.error('Excel出力エラー:', err)
    alert('Excel出力でエラーが発生しました：' + (err.message || err))
  }
}

function imprimirPDFLeads() {
  const fabFilter = document.getElementById('leadsFilter')?.value || ''
  const fab = fabFilter ? `【${fabFilter}】` : '【全体】'
  // mesma lógica de filtro da tela — o PDF imprime exatamente o que está visível
  const leads = getLeadsFiltrados()

  const linhas = LEAD_STAGES.map(stage => {
    const list = leads.filter(c => getLeadsStage(c) === stage.key)
    if (!list.length) return ''
    return `<tr class="stage-row"><td colspan="8">${stage.label}（${list.length}名）</td></tr>` +
      list.map((c, i) => `<tr class="${i%2===0?'even':''}">
        <td>${c.shimei||'—'}</td>
        <td>${c.telefone||'—'}</td>
        <td>${c.idade||'—'}</td>
        <td>${c.fabrica||'—'}</td>
        <td>${c.prefecture||'—'}</td>
        <td>${c.city||'—'}</td>
        <td>${c.nivel_japones?.split('〜')[0]||'—'}</td>
        <td>${c.precisa_apartamento ? '必要' : '不要'}</td>
      </tr>`).join('')
  }).join('')

  const w = window.open('', '_blank')
  if (!w) { alert('⚠️ ポップアップがブロックされました。\nブラウザのアドレスバーでこのサイトのポップアップを許可してください。'); return }
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Leads do Site</title>
    <style>
      body { font-family: 'Helvetica Neue', sans-serif; font-size: 11px; padding: 20px; color: #333; }
      h2 { font-size: 15px; margin-bottom: 4px; }
      p { font-size: 12px; color: #666; margin-bottom: 12px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #333; color: white; padding: 6px 8px; text-align: left; font-size: 11px; }
      td { padding: 5px 8px; border-bottom: 1px solid #eee; }
      tr.even td { background: #f9f9f9; }
      tr.stage-row td { background: #e8f0fe; font-weight: 700; font-size: 12px; padding: 6px 8px; color: #1a237e; }
      @media print { button { display: none } }
    </style>
    </head><body>
    <h2>Leads do Site ${fab}</h2>
    <p>出力日：${new Date().toLocaleDateString('ja-JP')}　総件数: ${leads.length}名</p>
    <button onclick="window.print()" style="margin-bottom:14px;padding:7px 18px;background:#1e88e5;color:white;border:none;border-radius:4px;cursor:pointer;font-size:13px">印刷 / PDF保存</button>
    <table>
      <thead><tr><th>氏名</th><th>電話番号</th><th>年齢</th><th>工場</th><th>都道府県</th><th>市区町村</th><th>日本語</th><th>アパート</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></body></html>`)
  w.document.close()
}

// Normaliza campo que deveria ser array mas pode vir como texto do banco
function asArr(v) {
  if (Array.isArray(v)) return v
  if (v == null || v === '') return []
  if (typeof v === 'string') {
    try { const p = JSON.parse(v); return Array.isArray(p) ? p : [v] } catch (_) { return [v] }
  }
  return []
}

// Filtro global por data de cadastro (created_at).
// comExcecao=true: candidatos em 入社/在籍 nunca somem, independente do período.
function dentroDoPeriodo(c, comExcecao = true) {
  if (comExcecao) {
    const st = getStage(c)
    if (st === 'nyusha' || st === 'zaiseki') return true
  }
  const ini = document.getElementById('filterDtIni')?.value
  const fim = document.getElementById('filterDtFim')?.value
  const d = (c.created_at || '').split('T')[0]
  if (ini && d < ini) return false
  if (fim && d > fim) return false
  return true
}

// Usado só pelo カレンダー e オーダー状況: conta o candidato se QUALQUER uma dessas datas
// cair dentro do período selecionado (登録日, 面接日, 見学日, 入社日, 内定日) — não só 登録日,
// pra uma entrevista/見学 marcada não sumir só porque o candidato foi cadastrado antes do período
function dentroDoPeriodoOuEvento(c) {
  const st = getStage(c)
  if (st === 'nyusha' || st === 'zaiseki') return true
  const ini = document.getElementById('filterDtIni')?.value
  const fim = document.getElementById('filterDtFim')?.value
  if (!ini && !fim) return true
  const emRange = dateStr => {
    if (!dateStr) return false
    const d = dateStr.split('T')[0]
    if (ini && d < ini) return false
    if (fim && d > fim) return false
    return true
  }
  return emRange(c.created_at) || emRange(c.dt_mensetsu) || emRange(c.dt_kengaku) || emRange(c.dt_nyusha) || emRange(c.dt_naitei)
}

function onPeriodoChange() {
  renderPipeline()
  if (document.getElementById('calendarView').style.display !== 'none') renderCalendar()
  if (document.getElementById('chartsView').style.display   !== 'none') renderCharts()
  if (document.getElementById('shokaiView').style.display   !== 'none') renderShokaiAnalise()
  if (document.getElementById('leadsView').style.display    !== 'none') renderLeads()
  if (document.getElementById('orderStatusView').style.display !== 'none') renderOrderStatus()
}

// fabricas do escritorio ativo no momento (jimusho logado, ou o escritorio que o admin escolheu ver)
function fabricasDoMeuJimusho() {
  if (!jimushoAtivoNome) return []
  return todasLocations.filter(l => l.jimusho === jimushoAtivoNome).map(l => l.nome)
}

// texto do filtro de fabrica/escritorio ativo no momento, pra usar em titulos de PDF/Excel
function labelFiltroAtivo() {
  if (fabricaAtiva) return fabricaAtiva
  if (jimushoAtivo) return (jimushoAtivoNome || '事務所') + 'まとめ'
  return '全体'
}

function getFiltrados(comExcecaoPeriodo = true) {
  const search = document.getElementById('searchInput').value.toLowerCase()
  const sexo   = document.getElementById('filterSexo').value
  const jp     = document.getElementById('filterJP').value
  const idade  = parseInt(document.getElementById('filterIdade').value) || null
  const f = activeFilters
  const jimushoFabs = jimushoAtivo ? fabricasDoMeuJimusho() : null

  return todosOsCandidatos.filter(c => {
    if (c.origem === 'web' || c.origem === 'web_stock') return false
    if (c.dt_stock_geral && !c.dt_ng) return false
    if (!dentroDoPeriodo(c, comExcecaoPeriodo)) return false
    if (jimushoFabs && !jimushoFabs.includes(fabricaEfetiva(c))) return false
    if (fabricaAtiva && fabricaEfetiva(c) !== fabricaAtiva) return false
    if (shokaiAtivo && c.shokai !== shokaiAtivo) return false
    if (sexo   && c.sexo !== sexo)                                            return false
    if (jp     && c.nivel_japones !== jp)                                     return false
    if (idade  && c.idade > idade)                                            return false
    if (search && !c.shimei?.toLowerCase().includes(search) && !c.telefone?.includes(search) && !String(c.numero_cadastro ?? '').includes(search)) return false
    // filtros do painel
    if (f.jp?.length    && !f.jp.includes(c.nivel_japones))     return false
    if (f.stage?.length && !f.stage.includes(getStage(c)))       return false
    if (f.emp?.length   && !f.emp.includes(c.esta_empregado))    return false
    if (f.nac?.length   && !f.nac.includes(c.nacionalidade))     return false
    if (f.pref?.length  && !f.pref.includes(c.prefecture))       return false
    if (f.turno?.length  && !asArr(c.turnos_possiveis).some(t => f.turno.includes(t)))   return false
    if (f.menkyo?.length && !asArr(c.habilitacao).some(m => f.menkyo.includes(m)))       return false
    if (f.exp?.length    && !asArr(c.experiencia).some(e => f.exp.includes(e)))          return false
    if (f.apt            && String(c.precisa_apartamento) !== f.apt)                    return false
    if (f.sexo           && c.sexo !== f.sexo)                                          return false
    if (f.move           && String(c.pode_mudar) !== f.move)                            return false
    if (f.ageMax         && (c.idade > f.ageMax))                                       return false
    return true
  })
}

function renderAlerts() {
  const h = new Date()
  const hoje = `${h.getFullYear()}-${String(h.getMonth()+1).padStart(2,'0')}-${String(h.getDate()).padStart(2,'0')}`
  const alerts = todosOsCandidatos.filter(c => c.alerta_data && c.alerta_data.startsWith(hoje))
  const bar = document.getElementById('alertBar')
  if (!alerts.length) { bar.style.display = 'none'; return }
  bar.style.display = 'flex'
  bar.innerHTML = `<strong>アラート ${alerts.length}件</strong>` +
    alerts.map(c => `<span class="alert-chip" onclick="abrirModal('${c.id}')">${c.shimei}</span>`).join('')
}

function comentarioCol(c) {
  const txt = (c.tantousha_comentario || '').trim()
  const attr = txt.replace(/"/g, '&quot;').replace(/</g, '&lt;')
  return `<span style="font-size:11px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${attr}">${attr || '—'}</span>`
}

const _expandedStages = new Set()
const _selecionadosImpressao = new Set()

function toggleSelecaoImpressao(id, checked) {
  if (checked) _selecionadosImpressao.add(id)
  else _selecionadosImpressao.delete(id)
  atualizarBulkActionBar()
}

function toggleSelecaoEtapa(stageKey, checked) {
  const list = window._grouped?.[stageKey] || []
  list.forEach(c => {
    if (checked) _selecionadosImpressao.add(c.id)
    else _selecionadosImpressao.delete(c.id)
  })
  renderPipeline()
}

function atualizarBulkActionBar() {
  const bar = document.getElementById('bulkActionBar')
  const n = _selecionadosImpressao.size
  bar.style.display = n > 0 ? 'flex' : 'none'
  document.getElementById('bulkActionCount').textContent = `${n}人選択中`
}

function limparSelecaoCandidatos() {
  _selecionadosImpressao.clear()
  renderPipeline()
}

function renderPipeline() {
  atualizarDropdownShokai()
  const candidatos = getFiltrados()
  const grouped = {}
  STAGES.forEach(s => grouped[s.key] = [])
  candidatos.forEach(c => grouped[getStage(c)].push(c))

  document.getElementById('s-total').textContent    = candidatos.length
  document.getElementById('s-renraku').textContent  = grouped.renrakumae.length
  document.getElementById('s-taiochu').textContent  = grouped.taiochu.length
  document.getElementById('s-mensetsu').textContent = grouped.mensetsu.length
  document.getElementById('s-kentouchu').textContent = grouped.kentouchu.length
  document.getElementById('s-kengaku').textContent  = grouped.kengaku.length
  document.getElementById('s-naitei').textContent   = grouped.naitei.length
  document.getElementById('s-nyusha').textContent   = grouped.nyusha.length
  document.getElementById('s-zaiseki').textContent  = grouped.zaiseki.length
  document.getElementById('s-stock').textContent    = grouped.stock.length
  document.getElementById('s-ng').textContent       = grouped.ng.length

  window._grouped = grouped

  const stagesVisiveis = getStagesVisiveis()
  document.getElementById('pipeline').innerHTML = STAGES.filter(s => stagesVisiveis.includes(s.key)).map(stage => {
    const list = grouped[stage.key]
    const showNaiteiCol  = stage.key === 'naitei'
    const showNyushaActionCol = stage.key === 'nyusha'
    const showKengakuCol = stage.key === 'kengaku'
    const showZaisekiCol = stage.key === 'zaiseki'
    const showActions4   = stage.key === 'renrakumae'
    const showMensetsuCol = stage.key === 'mensetsu'
    const showKentouchuCol = stage.key === 'kentouchu'
    const showActions3   = stage.key === 'taiochu'
    if (showNaiteiCol || showNyushaActionCol || showZaisekiCol) list.sort((a, b) => (a.dt_nyusha || '').localeCompare(b.dt_nyusha || ''))
    if (showKengakuCol) list.sort((a, b) => (b.dt_kengaku || '').localeCompare(a.dt_kengaku || ''))
    if (stage.key === 'mensetsu') list.sort((a, b) => `${a.dt_mensetsu||'9999-99-99'} ${a.mensetsu_hora||'99:99'}`.localeCompare(`${b.dt_mensetsu||'9999-99-99'} ${b.mensetsu_hora||'99:99'}`))
    const expanded = _expandedStages.has(stage.key)
    const show = expanded ? list : list.slice(0, 5)
    const hasMore = list.length > 5 && !expanded
    let colClass = ''
    if (showNaiteiCol)       colClass = ' col-nyusha'
    else if (showNyushaActionCol) colClass = ' col-nyusha-action'
    else if (showKengakuCol) colClass = ' col-kengaku'
    else if (showZaisekiCol) colClass = ' col-zaiseki'
    else if (showActions4)   colClass = ' col-actions4'
    else if (showMensetsuCol) colClass = ' col-mensetsu'
    else if (showKentouchuCol) colClass = ' col-kentouchu'
    else if (showActions3)   colClass = ' col-actions3'

    let extraHeader = ''
    if (showNaiteiCol)       extraHeader = '<span>入社日</span>'
    else if (showNyushaActionCol) extraHeader = '<span>入社日</span><span>アクション</span>'
    else if (showKengakuCol) extraHeader = '<span>見学日</span><span>入社日</span><span>アクション</span>'
    else if (showZaisekiCol) extraHeader = '<span>入社日</span><span></span>'
    else if (showMensetsuCol) extraHeader = '<span>面接日</span><span>面接時間</span><span>アクション</span>'
    else if (showKentouchuCol) extraHeader = '<span>検討中日</span><span>アクション</span>'
    else if (showActions4 || showActions3) extraHeader = '<span>アクション</span>'

    const rowsHtml = list.length === 0
      ? `<div class="stage-empty">候補者なし</div>`
      : `<div class="col-header${colClass}"><span></span><span>番号</span><span>氏名</span><span>紹介者</span><span>電話番号</span><span>工場</span><span>市区町村</span><span>国籍</span><span>性別</span><span>日本語</span><span>経過</span>${extraHeader}<span>コメント</span></div>` +
        show.map(c => {
          const d = diasNaEtapa(c)
          let extraCols = ''
          if (showNaiteiCol)
            extraCols = `<span style="font-size:11px">${fmtDataCurta(c.dt_nyusha) || '—'}</span>`
          else if (showNyushaActionCol)
            extraCols = `<span style="font-size:11px">${fmtDataCurta(c.dt_nyusha) || '—'}</span><span onclick="event.stopPropagation()"><button class="btn-lead teal" onclick="avancarEtapa(event,'${c.id}','dt_zaiseki')">在籍</button></span>`
          else if (showKengakuCol)
            extraCols = `<span style="font-size:11px">${fmtDataCurta(c.dt_kengaku) || '—'}</span><span style="font-size:11px">${fmtDataCurta(c.dt_nyusha) || '—'}</span><span onclick="event.stopPropagation()" style="display:flex;gap:4px;align-items:center"><button class="btn-lead red" onclick="kengakuNG(event,'${c.id}')">NG</button><button class="btn-lead green" onclick="kengakuNaitei(event,'${c.id}')">内定</button></span>`
          else if (showZaisekiCol)
            extraCols = `<span style="font-size:11px">${fmtDataCurta(c.dt_nyusha) || '—'}</span><span onclick="event.stopPropagation()"><button class="btn-lead blue" onclick="taisha(event,'${c.id}')">退社</button></span>`
          else if (showActions4)
            extraCols = `<span onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-lead amber" onclick="avancarEtapa(event,'${c.id}','dt_taiochu')">対応中</button><button class="btn-lead green" onclick="avancarEtapa(event,'${c.id}','dt_mensetsu')">面接</button><button class="btn-lead orange" onclick="avancarEtapa(event,'${c.id}','dt_ng','NGにしますか？')">NG</button><button class="btn-lead blue" onclick="avancarEtapa(event,'${c.id}','dt_stock')">ストック</button></span>`
          else if (showMensetsuCol)
            extraCols = `<span style="font-size:11px">${fmtDataCurta(c.dt_mensetsu) || '—'}</span><span style="font-size:11px">${c.mensetsu_hora ? c.mensetsu_hora.slice(0,5) : '—'}</span><span onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-lead green" onclick="avancarEtapa(event,'${c.id}','dt_kengaku')">見学</button><button class="btn-lead amber" onclick="avancarEtapa(event,'${c.id}','dt_kentouchu')">検討中</button><button class="btn-lead orange" onclick="avancarEtapa(event,'${c.id}','dt_ng','NGにしますか？')">NG</button><button class="btn-lead blue" onclick="avancarEtapa(event,'${c.id}','dt_stock')">ストック</button></span>`
          else if (showKentouchuCol)
            extraCols = `<span style="font-size:11px">${fmtDataCurta(c.dt_kentouchu) || '—'}</span><span onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-lead green" onclick="avancarEtapa(event,'${c.id}','dt_kengaku')">見学</button><button class="btn-lead orange" onclick="avancarEtapa(event,'${c.id}','dt_ng','NGにしますか？')">NG</button><button class="btn-lead blue" onclick="avancarEtapa(event,'${c.id}','dt_stock')">ストック</button></span>`
          else if (showActions3) {
            extraCols = `<span onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-lead green" onclick="avancarEtapa(event,'${c.id}','dt_mensetsu')">面接</button><button class="btn-lead orange" onclick="avancarEtapa(event,'${c.id}','dt_ng','NGにしますか？')">NG</button><button class="btn-lead blue" onclick="avancarEtapa(event,'${c.id}','dt_stock')">ストック</button></span>`
          }
          return `<div class="candidate-row${colClass}" onclick="abrirModal('${c.id}')">
            <span onclick="event.stopPropagation()"><input type="checkbox" onchange="toggleSelecaoImpressao('${c.id}', this.checked)" ${_selecionadosImpressao.has(c.id) ? 'checked' : ''}></span>
            <span style="font-size:11px;color:#999">${c.numero_cadastro ?? '—'}</span>
            <span class="${isTelDuplicado(c) ? 'dup-tel' : ''}">${c.is_blacklisted ? '<span class="black-flag">⚠</span> ' : ''}${c.shimei || '—'}</span>
            <span style="font-size:11px;color:#666">${c.shokai || '—'}</span>
            <span>${c.telefone || '—'}</span>
            <span style="font-size:11px">${c.fabrica || '—'}</span>
            <span style="font-size:11px">${c.city || '—'}</span>
            <span style="font-size:11px">${c.nacionalidade || '—'}</span>
            <span>${c.sexo === '男性' ? 'M' : c.sexo === '女性' ? 'F' : '—'}</span>
            <span style="font-size:11px">${c.nivel_japones?.split('（')[0] || '—'}</span>
            <span class="dias-badge ${d.alert ? 'alert' : ''}">${d.text}</span>
            ${extraCols}
            ${comentarioCol(c)}
          </div>`
        }).join('') +
        (hasMore ? `<div style="padding:7px 16px;font-size:12px;color:#1e88e5;cursor:pointer" onclick="expandStage('${stage.key}')">+ さらに ${list.length - 5} 件</div>` : '')

    const allSelected = list.length > 0 && list.every(c => _selecionadosImpressao.has(c.id))
    return `<div class="stage-section ${stage.cls}">
      <div class="stage-header" onclick="toggleStage('${stage.key}')">
        <input type="checkbox" onclick="event.stopPropagation()" onchange="toggleSelecaoEtapa('${stage.key}', this.checked)" ${allSelected ? 'checked' : ''} style="margin-right:8px;vertical-align:middle">
        ${stage.label} <span class="stage-count">${list.length}</span>
      </div>
      <div class="stage-body" id="body-${stage.key}">${rowsHtml}</div>
    </div>`
  }).join('')
  atualizarBulkActionBar()
}

function toggleStage(key) { const b = document.getElementById('body-'+key); b.style.display = b.style.display === 'none' ? '' : 'none' }
function expandStage(key)  { _expandedStages.add(key); renderPipeline() }

// ─── CALENDAR ─────────────────────────────────────────────────
function calPrev()  { calRefDate.setDate(calRefDate.getDate() - 14); renderCalendar() }
function calNext()  { calRefDate.setDate(calRefDate.getDate() + 14); renderCalendar() }
function calToday() { calRefDate = inicioDaSemana(new Date()); renderCalendar() }

let calTypesAtivos = new Set(['mensetsu','kengaku','nyusha','alerta'])

function toggleCalType(btn, tipo) {
  if (calTypesAtivos.has(tipo)) { calTypesAtivos.delete(tipo); btn.classList.remove('active') }
  else { calTypesAtivos.add(tipo); btn.classList.add('active') }
  renderCalendar()
}

function renderCalendar() {
  const fabFilter = document.getElementById('calFabricaFilter').value
  const today     = new Date()
  const todayStr  = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`
  const dows      = ['日','月','火','水','木','金','土']
  const fmtISO    = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`

  // janela de 14 dias (2 linhas de 7), a partir de calRefDate (domingo)
  const dias14   = Array.from({ length: 14 }, (_, i) => { const d = new Date(calRefDate); d.setDate(d.getDate() + i); return d })
  const rangeIni = fmtISO(dias14[0])
  const rangeFim = fmtISO(dias14[13])
  document.getElementById('calTitle').textContent =
    `${dias14[0].getMonth()+1}/${dias14[0].getDate()} 〜 ${dias14[13].getMonth()+1}/${dias14[13].getDate()}`

  const events = {}
  const add = (dateStr, tipo, nome, fabrica, candidatoId, hora) => {
    if (!dateStr || !calTypesAtivos.has(tipo)) return
    const d = dateStr.split('T')[0]
    if (d < rangeIni || d > rangeFim) return
    if (!events[d]) events[d] = []
    events[d].push({ tipo, nome, fabrica, candidatoId, hora })
  }

  const jimushoFabsCal = jimushoAtivo ? fabricasDoMeuJimusho() : null
  todosOsCandidatos
    .filter(c => !fabFilter || fabricaEfetiva(c) === fabFilter)
    .filter(c => !jimushoFabsCal || jimushoFabsCal.includes(fabricaEfetiva(c)))
    .filter(c => dentroDoPeriodoOuEvento(c))
    .forEach(c => {
      add(c.dt_mensetsu, 'mensetsu', c.shimei, c.fabrica, c.id, c.mensetsu_hora)
      add(c.dt_kengaku,  'kengaku',  c.shimei, c.fabrica, c.id, c.kengaku_hora)
      add(c.dt_nyusha,   'nyusha',   c.shimei, c.fabrica, c.id)
      if (c.alerta_data) add(c.alerta_data, 'alerta', c.shimei, c.fabrica, c.id)
    })

  const tipoLabel = { mensetsu:'面接', kengaku:'見学', nyusha:'入社', alerta:'アラート' }

  // ── GRID (desktop) — 14 dias, 2 linhas de 7 ──────────────
  const grid = document.getElementById('calGrid')
  let html = dows.map(d => `<div class="cal-day-header">${d}</div>`).join('')
  dias14.forEach(date => {
    const dateStr   = fmtISO(date)
    const dow       = date.getDay()
    const isToday   = dateStr === todayStr
    const cls       = ['cal-day', isToday?'today':'', dow===0?'sunday':'', dow===6?'saturday':''].filter(Boolean).join(' ')
    const dayEvents = events[dateStr] || []
    const evs = dayEvents.map(e => `<div class="cal-event ${e.tipo}" onclick="abrirModal('${e.candidatoId}')" title="${e.nome}">${tipoLabel[e.tipo]}${e.hora ? ' ' + e.hora.slice(0,5) : ''}：${e.nome||''}</div>`).join('')
    html += `<div class="${cls}"><div class="cal-day-num">${date.getMonth()+1}/${date.getDate()}${dayEvents.length ? ` <span class="cal-day-count">(${dayEvents.length})</span>` : ''}</div><div class="cal-day-events">${evs}</div></div>`
  })
  grid.innerHTML = html

  // ── AGENDA (mobile) — só a partir de ontem em diante ──────
  const ontem = new Date(today)
  ontem.setDate(today.getDate() - 1)
  const ontemStr = fmtISO(ontem)
  const sortedDates = Object.keys(events).filter(d => d >= ontemStr).sort()
  if (!sortedDates.length) {
    document.getElementById('agendaList').innerHTML =
      `<div class="agenda-empty">📅 この期間のイベントはありません</div>`
    return
  }
  document.getElementById('agendaList').innerHTML = sortedDates.map(dateStr => {
    const date     = new Date(dateStr + 'T00:00:00')
    const dow      = dows[date.getDay()]
    const day      = date.getDate()
    const isToday  = dateStr === todayStr
    const dowColor = date.getDay()===0 ? 'color:#c62828' : date.getDay()===6 ? 'color:#1565c0' : ''
    const evRows   = events[dateStr].map(e => `
      <div class="agenda-event" onclick="abrirModal('${e.candidatoId}')">
        <span class="agenda-chip ${e.tipo}">${tipoLabel[e.tipo]}${e.hora ? ' ' + e.hora.slice(0,5) : ''}</span>
        <span class="agenda-nome">${e.nome||'—'}</span>
        ${e.fabrica ? `<span class="agenda-chip" style="background:${corDaFabrica(e.fabrica)}">${e.fabrica}</span>` : ''}
      </div>`).join('')
    return `
      <div class="agenda-day">
        <div class="agenda-day-header">
          <span class="agenda-dow" style="${dowColor}">${dow}</span>
          <span class="agenda-date" style="${dowColor}">${date.getMonth()+1}月${day}日</span>
          ${isToday ? '<span class="agenda-today-badge">今日</span>' : ''}
        </div>
        <div class="agenda-events">${evRows}</div>
      </div>`
  }).join('')
}

// ─── MODAL EDITAR ─────────────────────────────────────────────
const SEXO_PT = { '男性': 'Homem', '女性': 'Mulher', 'その他': 'Outro' }
const VISA_PT = {
  '永住者': 'Residente Permanente',
  '日本人の配偶者': 'Cônjuge de Japonês',
  '永住者の配偶者または子': 'Cônjuge ou filho de Residente Permanente',
  '定住者（1・3・5年）': 'Residente de longa permanência (1,3 ou 5 anos)',
  '家族滞在': 'Dependente',
  '留学': 'Estudante',
  '日本国籍': 'Cidadão Japonês',
  '特定活動': 'Atividades Designadas',
}
const KANA_PT = { '読み書きできる': 'Leitura e escrita', '読めるのみ': 'Leitura', 'できない': 'Não sabe' }
const NIHONGO_PT = {
  '0%（日本語不可）': '0% (não fala japonês)',
  'N5 10%〜（少し話せる）': 'N5 10%〜 (fala um pouco)',
  'N4 30%〜（基本会話）': 'N4 30%〜 (conversação básica)',
  'N3 50%〜（日常会話）': 'N3 50%〜 (conversação do dia a dia)',
  'N2 60%〜（中級会話）': 'N2 60%〜 (conversação intermediária)',
  'N1 80%〜（上級会話）': 'N1 80%〜 (conversação avançada)',
}
const EMPREGO_PT = {
  '在職中': 'Sim', '離職中': 'Não', 'アルバイト中': 'Meio período (Arubaito)',
  '退職予定（予告期間中）': 'Em aviso prévio', '無職': 'Desempregado',
}
const HABILITACAO_PT = {
  '所持なし': 'Nenhuma', '普通自動車': 'Carro', 'バイク': 'Moto',
  'フォークリフト': 'Empilhadeira', '玉掛け': 'Tamakake', 'クレーン': 'Guindaste', '溶接': 'Solda',
}
const EXPERIENCIA_PT = {
  '経験なし': 'Nenhuma', '組み立て（くみたて）': 'Montagem (Kumitate)', '自動車部品': 'Peças automotivas',
  '食品': 'Alimentos', '電子部品': 'Componentes eletrônicos', 'フォークリフト': 'Empilhadeira', '玉掛け': 'Tamakake',
  '検査': 'Inspeção de Qualidade (Kensa)', '梱包': 'Embalagem (Konpo)', 'プレス': 'Prensa',
  '溶接': 'Solda (Yosetsu)', '塗装': 'Pintura (Toso)', '建設': 'Construção (Kensetsu)',
  '物流': 'Logística (Butsuryu)', 'コンビニ': 'Loja de conveniência', 'スーパー': 'Supermercado', 'ホテル': 'Hotel',
}

function fmtDataPT(iso) {
  if (!iso) return null
  const [y, m, d] = iso.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}
// versão curta (sem ano) — só pras colunas de データ日 na tabela do 状況 (面接日/見学日/入社日)
function fmtDataCurta(iso) {
  if (!iso) return null
  const [, m, d] = iso.split('-')
  return `${parseInt(m)}月${parseInt(d)}日`
}
function trPT(map, val)    { return (val && map[val]) || val || '—' }
function trArrPT(map, arr) { const a = asArr(arr); return a.length ? a.map(v => map[v] || v).join(', ') : '—' }

function buildCopyText(c) {
  const rows = [
    'お疲れ様です。',
    `${c.fabrica || 'ヒューマン'}向け`,
    '新規応募がありました',
    '',
    `紹介：${c.shokai || 'ヒューマンシステム'}`,
    `氏名：${c.shimei || '—'}`,
    `電話番号：${c.telefone || '—'}`,
    c.postal_code            ? `〒：${c.postal_code}` : null,
    (c.prefecture || c.city) ? `住所：${[c.prefecture, c.city].filter(Boolean).join(' / ')}` : null,
    c.data_nascimento        ? `生年月日：${fmtDataPT(c.data_nascimento)}` : null,
    c.idade                  ? `年齢：${c.idade}` : null,
    `性別：${trPT(SEXO_PT, c.sexo)}`,
    `国籍：${c.nacionalidade || '—'}`,
    `ビザ：${trPT(VISA_PT, c.visa)}`,
    `日本語力：${trPT(NIHONGO_PT, c.nivel_japones)}`,
    c.hiragana ? `ひらがな：${trPT(KANA_PT, c.hiragana)}` : null,
    c.katakana ? `カタカナ：${trPT(KANA_PT, c.katakana)}` : null,
    `免許：${trArrPT(HABILITACAO_PT, c.habilitacao)}`,
    `経験：${trArrPT(EXPERIENCIA_PT, c.experiencia)}`,
    `アパート必要：${c.precisa_apartamento ? 'Sim' : 'Não'}`,
    `現在仕事中：${trPT(EMPREGO_PT, c.esta_empregado)}`,
    '',
    'よろしくお願いします。',
  ]
  return rows.filter(r => r !== null).join('\n')
}

function copiarDados(btn) {
  const ta = document.getElementById('f_copytext')
  navigator.clipboard.writeText(ta.value).then(() => {
    const old = btn.textContent
    btn.textContent = 'コピーしました！'
    setTimeout(() => btn.textContent = old, 1500)
  })
}

function podeEditar(c) {
  const role = currentProfile?.role
  if (role === 'admin' || role === 'jimusho') return true
  if (role === 'tantousha') {
    const fabricas = currentProfile?.fabricas || []
    return fabricas.includes(c.fabrica) || fabricas.includes(c.fabrica2)
  }
  return false
}

// edicao parcial: quem indicou (shokai bate) pode corrigir dados pessoais e a fabrica
// do proprio candidato enquanto ele estiver em Leads do Site (web/web_indicado/web_stock),
// mas nao mexe em shokai nem no andamento do processo seletivo
const CAMPOS_BLOQUEADOS_INFO = new Set([
  'f_shokai',
  'f_oubo', 'f_taio', 'f_mens', 'f_menshora', 'f_kentou', 'f_keng', 'f_kenghora', 'f_nait', 'f_nyu', 'f_stock', 'f_stockgeral', 'f_ng',
  'f_black', 'f_blackmotivo', 'f_alert', 'f_alertnota', 'f_tancom',
])
function podeEditarInfo(c) {
  return !!currentProfile?.shokai_nome && c.shokai === currentProfile.shokai_nome &&
    (c.origem === 'web' || c.origem === 'web_indicado' || c.origem === 'web_stock')
}

function abrirModal(id) {
  const c = todosOsCandidatos.find(x => x.id == id)
  if (!c) return
  candidatoAtivo = c
  document.getElementById('modalTitle').textContent = (c.shimei || '候補者詳細') + (c.telefone ? '  (' + c.telefone + ')' : '')
  const tel = (c.telefone || '').replace(/\D/g, '')
  const wa  = tel.startsWith('0') ? '81' + tel.slice(1) : tel
  document.getElementById('btnCall').href    = tel ? `tel:${tel}` : '#'
  document.getElementById('btnWA').href      = tel ? `https://wa.me/${wa}` : '#'
  document.getElementById('btnRireki').href    = tel ? `curriculo-edit.html?tel=${tel.replace(/\D/g,'')}` : '#'
  document.getElementById('btnHiaringu').href  = c.id ? `hiaringu.html?id=${c.id}` : '#'

  const chk = (arr, val) => asArr(arr).includes(val) ? 'checked' : ''
  const sel = (opts, val) => opts.map(o => `<option ${o===val?'selected':''}>${o}</option>`).join('')

  document.getElementById('modalBody').innerHTML = `
    <div class="modal-section">
      <div class="modal-section-title">基本情報</div>
      <div class="modal-grid">
        <div class="modal-field"><label>氏名</label><input id="f_shimei" value="${c.shimei||''}"></div>
        <div class="modal-field"><label>電話番号</label><input id="f_telefone" value="${c.telefone||''}"></div>
        <div class="modal-field"><label>国籍</label><input id="f_nac" value="${c.nacionalidade||''}"></div>
        <div class="modal-field"><label>年齢</label><input type="number" id="f_idade" value="${c.idade||''}"></div>
        <div class="modal-field"><label>生年月日</label><input type="date" id="f_nasc" value="${c.data_nascimento||''}"></div>
        <div class="modal-field"><label>性別</label><select id="f_sexo"><option value="">—</option>${sel(['男性','女性','その他'],c.sexo)}</select></div>
        <div class="modal-field"><label>都道府県</label><input id="f_pref" value="${c.prefecture||''}"></div>
        <div class="modal-field"><label>市区町村</label><input id="f_city" value="${c.city||''}"></div>
        <div class="modal-field"><label>〒</label><input id="f_cep" value="${c.postal_code||''}"></div>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">仕事情報</div>
      <div class="modal-grid">
        <div class="modal-field"><label>ビザ</label><select id="f_visa"><option value="">—</option>${sel(['永住者','日本人の配偶者','永住者の配偶者または子','定住者（1・3・5年）','家族滞在','留学','日本国籍'],c.visa)}</select></div>
        <div class="modal-field"><label>工場</label><select id="f_fab"><option value="">—</option>${todasFabricas.map(f=>`<option value="${f}" ${f===c.fabrica?'selected':''}>${f}</option>`).join('')}</select></div>
        <div class="modal-field"><label>工場２</label><select id="f_fab2"><option value="">—</option>${todasFabricas.map(f=>`<option value="${f}" ${f===c.fabrica2?'selected':''}>${f}</option>`).join('')}</select></div>
        <div class="modal-field"><label>紹介者${shokaiBloqueado(c) ? ' 🔒' : ''}</label><input id="f_shokai" value="${c.shokai||''}" ${shokaiBloqueado(c) ? 'disabled style="background:#f5f5f5;color:#999"' : ''}></div>
        <div class="modal-field"><label>就業状況</label><select id="f_emp"><option value="">—</option>${sel(['在職中','離職中','アルバイト中','退職予定（予告期間中）'],c.esta_empregado)}</select></div>
        <div class="modal-field"><label>アパート</label><select id="f_apt"><option value="false">不要</option><option value="true" ${c.precisa_apartamento?'selected':''}>必要</option></select></div>
        <div class="modal-field"><label>引っ越し</label><select id="f_move"><option value="false">不可</option><option value="true" ${c.pode_mudar?'selected':''}>可能</option></select></div>
        <div class="modal-field"><label>車</label><select id="f_car"><option value="false">なし</option><option value="true" ${c.tem_carro?'selected':''}>あり</option></select></div>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">スキル</div>
      <div class="modal-field" style="margin-bottom:10px">
        <label>日本語力</label>
        <select id="f_jp">${sel(['0%（日本語不可）','N5 10%〜（少し話せる）','N4 30%〜（基本会話）','N3 50%〜（日常会話）','N2 60%〜（中級会話）','N1 80%〜（上級会話）'],c.nivel_japones)}</select>
      </div>
      <div class="modal-grid" style="margin-bottom:10px">
        <div class="modal-field"><label>ひらがな</label><select id="f_hira">${sel(['読み書きできる','読めるのみ','できない'],c.hiragana)}</select></div>
        <div class="modal-field"><label>カタカナ</label><select id="f_kata">${sel(['読み書きできる','読めるのみ','できない'],c.katakana)}</select></div>
      </div>
      <div class="modal-field" style="margin-bottom:10px">
        <label>免許・資格</label>
        <div class="modal-checkbox-group">
          ${['所持なし','普通自動車','バイク','フォークリフト','玉掛け','クレーン','溶接'].map(v=>`<label><input type="checkbox" name="hab" value="${v}" ${chk(c.habilitacao,v)}> ${v}</label>`).join('')}
        </div>
      </div>
      <div class="modal-field" style="margin-bottom:10px">
        <label>可能な直</label>
        <div class="modal-checkbox-group">
          ${['二交代','早番遅番','二直三班','昼勤のみ'].map(v=>`<label><input type="checkbox" name="turno" value="${v}" ${chk(c.turnos_possiveis,v)}> ${v}</label>`).join('')}
        </div>
      </div>
      <div class="modal-field">
        <label>工場経験</label>
        <div class="modal-checkbox-group">
          ${['経験なし','組み立て（くみたて）','自動車部品','食品','電子部品','フォークリフト','玉掛け','検査','梱包','プレス','溶接','塗装','建設','物流','コンビニ','スーパー','ホテル'].map(v=>`<label><input type="checkbox" name="exp" value="${v}" ${chk(c.experiencia,v)}> ${v}</label>`).join('')}
        </div>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">パイプライン日付</div>
      <div class="modal-grid-3">
        <div class="modal-field"><label>応募日</label>${currentProfile?.role === 'admin'
          ? `<input type="date" id="f_oubo" value="${c.created_at ? c.created_at.slice(0,10) : ''}">`
          : `<input type="text" value="${c.created_at ? fmtDataPT(c.created_at.slice(0,10)) : '—'}" disabled style="background:#f5f5f5;color:#666">`}</div>
        <div class="modal-field"><label>紹介日</label>${currentProfile?.role === 'admin'
          ? `<input type="date" id="f_dtshokai" value="${c.dt_shokai||''}">`
          : `<input type="text" value="${c.dt_shokai ? fmtDataPT(c.dt_shokai) : '—'}" disabled style="background:#f5f5f5;color:#666">`}</div>
        <div class="modal-field"><label>対応中</label><div class="date-with-btn"><input type="date" id="f_taio" value="${c.dt_taiochu||''}"><button class="btn-hoje" onclick="hoje('f_taio')">今日</button></div></div>
        <div class="modal-field"><label>面接日</label><div class="date-with-btn"><input type="date" id="f_mens" value="${c.dt_mensetsu||''}"><button class="btn-hoje" onclick="hoje('f_mens')">今日</button></div></div>
        <div class="modal-field"><label>面接時間</label><input type="time" id="f_menshora" value="${c.mensetsu_hora||''}"></div>
        <div class="modal-field"><label>検討中日</label><div class="date-with-btn"><input type="date" id="f_kentou" value="${c.dt_kentouchu||''}"><button class="btn-hoje" onclick="hoje('f_kentou')">今日</button></div></div>
        <div class="modal-field"><label>見学・ヒアリング日</label><div class="date-with-btn"><input type="date" id="f_keng" value="${c.dt_kengaku||''}"><button class="btn-hoje" onclick="hoje('f_keng')">今日</button></div></div>
        <div class="modal-field"><label>見学時間</label><input type="time" id="f_kenghora" value="${c.kengaku_hora||''}"></div>
        <div class="modal-field"><label>内定日</label><div class="date-with-btn"><input type="date" id="f_nait" value="${c.dt_naitei||''}"><button class="btn-hoje" onclick="hoje('f_nait')">今日</button></div></div>
        <div class="modal-field"><label>入社日</label><div class="date-with-btn"><input type="date" id="f_nyu" value="${c.dt_nyusha||''}"><button class="btn-hoje" onclick="hoje('f_nyu')">今日</button></div></div>
        <div class="modal-field"><label>在籍日</label><div class="date-with-btn"><input type="date" id="f_zaiseki" value="${c.dt_zaiseki||''}"><button class="btn-hoje" onclick="hoje('f_zaiseki')">今日</button></div></div>
        <div class="modal-field"><label>工場ストック日 <span class="info-icon" onclick="this.classList.toggle('active')">i<span class="info-tip">現在の担当工場だけのストックになります。その工場の担当者だけが見られます。</span></span></label><div class="date-with-btn"><input type="date" id="f_stock" value="${c.dt_stock||''}"><button class="btn-hoje" onclick="hoje('f_stock')">今日</button></div></div>
        <div class="modal-field"><label>全体ストック日 <span class="info-icon" onclick="this.classList.toggle('active')">i<span class="info-tip">全工場向けのストックになります。すべての工場の担当者が見て、引き受けることができます。</span></span></label><div class="date-with-btn"><input type="date" id="f_stockgeral" value="${c.dt_stock_geral||''}"><button class="btn-hoje" onclick="hoje('f_stockgeral')">今日</button></div></div>
        <div class="modal-field"><label>NG日</label><div class="date-with-btn"><input type="date" id="f_ng" value="${c.dt_ng||''}"><button class="btn-hoje" onclick="hoje('f_ng')">今日</button></div></div>
      </div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">アラート・メモ</div>
      <div class="modal-grid" style="margin-bottom:10px">
        <div class="modal-field"><label>アラート日時</label><input type="datetime-local" id="f_alert" value="${c.alerta_data ? c.alerta_data.slice(0,16) : ''}"></div>
        <div class="modal-field"><label>アラート内容</label><input id="f_alertnota" value="${c.alerta_nota||''}"></div>
      </div>
      <div class="modal-field" style="margin-bottom:8px"><label>コメント</label><textarea id="f_com" rows="3">${c.comentario||''}</textarea></div>
      <div class="modal-field"><label>担当者コメント</label><textarea id="f_tancom" rows="2">${c.tantousha_comentario||''}</textarea></div>
    </div>

    <div class="modal-section">
      <div class="modal-section-title">ブラックリスト</div>
      ${c.is_blacklisted
        ? `<div class="black-toggle">⚠️ ブラック登録済み &nbsp;<label style="display:flex;align-items:center;gap:6px;font-size:13px"><input type="checkbox" id="f_black" checked> 解除する</label></div>`
        : `<label style="display:flex;align-items:center;gap:6px;font-size:13px;padding:8px;border:1px solid #eee;border-radius:4px"><input type="checkbox" id="f_black"> ブラック登録する</label>`}
      ${c.is_blacklisted || `<div class="modal-field" style="margin-top:8px"><label>ブラック理由</label><input id="f_blackmotivo" value="${c.blacklist_motivo||''}"></div>`}
    </div>

    <div class="modal-section">
      <div class="modal-section-title">コピー用データ</div>
      <textarea id="f_copytext" rows="14" readonly style="width:100%;font-family:monospace;font-size:12px;white-space:pre-wrap;resize:vertical;box-sizing:border-box">${buildCopyText(c)}</textarea>
      <button class="btn-hoje" style="margin-top:8px" onclick="copiarDados(this)">コピー</button>
    </div>
  `

  const editavelTudo = podeEditar(c)
  const editavelInfo = !editavelTudo && podeEditarInfo(c)
  const editavel = editavelTudo || editavelInfo
  document.getElementById('modalReadOnlyNote').style.display = editavel ? 'none' : ''
  document.querySelector('#modal .btn-delete').style.display = editavelTudo ? '' : 'none'
  document.querySelector('#modal .btn-save').style.display   = editavel ? '' : 'none'
  if (!editavelTudo) {
    document.querySelectorAll('#modalBody input, #modalBody select, #modalBody textarea').forEach(el => {
      if (el.id === 'f_copytext') return
      if (editavelInfo && !CAMPOS_BLOQUEADOS_INFO.has(el.id)) return
      el.disabled = true
    })
  }

  document.getElementById('modal').style.display = 'flex'
}

async function salvarCandidato() {
  if (!candidatoAtivo) return
  if (!podeEditar(candidatoAtivo) && !podeEditarInfo(candidatoAtivo)) { alert('編集権限がありません。'); return }
  const g = id => document.getElementById(id)
  const chks = name => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map(e => e.value)

  const novoFab2 = g('f_fab2').value || null
  const fab2Mudou = novoFab2 && novoFab2 !== candidatoAtivo.fabrica2

  const payload = {
    is_blacklisted:       g('f_black')?.checked || false,
    blacklist_motivo:     g('f_blackmotivo')?.value || null,
    shimei:               g('f_shimei').value,
    telefone:             g('f_telefone').value,
    nacionalidade:        g('f_nac').value,
    idade:                parseInt(g('f_idade').value) || null,
    data_nascimento:      g('f_nasc').value  || null,
    sexo:                 g('f_sexo').value,
    prefecture:           g('f_pref').value,
    city:                 g('f_city').value,
    postal_code:          g('f_cep').value,
    visa:                 g('f_visa').value,
    fabrica:              g('f_fab').value,
    fabrica2:             novoFab2,
    shokai:               g('f_shokai').value || null,
    esta_empregado:       g('f_emp').value,
    precisa_apartamento:  g('f_apt').value === 'true',
    pode_mudar:           g('f_move').value === 'true',
    tem_carro:            g('f_car').value  === 'true',
    nivel_japones:        g('f_jp').value,
    hiragana:             g('f_hira').value,
    katakana:             g('f_kata').value,
    habilitacao:          chks('hab'),
    turnos_possiveis:     chks('turno'),
    experiencia:          chks('exp'),
    dt_taiochu:           fab2Mudou ? null : (g('f_taio').value    || null),
    dt_mensetsu:          fab2Mudou ? null : (g('f_mens').value    || null),
    mensetsu_hora:        fab2Mudou ? null : (g('f_menshora').value || null),
    dt_kentouchu:         fab2Mudou ? null : (g('f_kentou').value  || null),
    dt_kengaku:           fab2Mudou ? null : (g('f_keng').value    || null),
    kengaku_hora:         fab2Mudou ? null : (g('f_kenghora').value || null),
    dt_naitei:            fab2Mudou ? null : (g('f_nait').value    || null),
    dt_nyusha:            fab2Mudou ? null : (g('f_nyu').value     || null),
    dt_zaiseki:           fab2Mudou ? null : (g('f_zaiseki').value || null),
    dt_stock:             fab2Mudou ? null : (g('f_stock').value   || null),
    dt_stock_geral:       fab2Mudou ? null : (g('f_stockgeral').value || g('f_ng').value || null),
    dt_ng:                fab2Mudou ? null : (g('f_ng').value      || null),
    dt_shokai:            document.getElementById('f_dtshokai') ? (g('f_dtshokai').value || null) : candidatoAtivo.dt_shokai,
    alerta_data:          g('f_alert').value   || null,
    alerta_nota:          g('f_alertnota').value || null,
    comentario:           g('f_com').value     || null,
    tantousha_comentario: g('f_tancom').value  || null,
  }

  const fOubo = g('f_oubo')
  if (fOubo && fOubo.value) {
    const horaOriginal = candidatoAtivo.created_at ? candidatoAtivo.created_at.slice(10) : 'T00:00:00.000Z'
    payload.created_at = fOubo.value + horaOriginal
  }

  const { error } = await sb.from('candidates').update(payload).eq('id', candidatoAtivo.id)
  if (error) { alert('エラー: ' + error.message); return }
  const idx = todosOsCandidatos.findIndex(c => c.id === candidatoAtivo.id)
  if (idx >= 0) Object.assign(todosOsCandidatos[idx], payload)
  recalcularDuplicados()
  fecharModal()
  carregarSidebar()
  renderPipeline()
  renderCalendar()
  renderLeads()
  renderStockPool()
}

async function deletarCandidato() {
  if (!candidatoAtivo) return
  if (!podeEditar(candidatoAtivo)) { alert('編集権限がありません。'); return }
  if (!confirm(`「${candidatoAtivo.shimei}」を非表示にしますか？\n（データはシステムに保持されます）`)) return
  const id = candidatoAtivo.id
  const { error } = await sb.rpc('deletar_candidato', { candidate_id: id })
  if (error) { alert('エラー: ' + error.message); return }
  todosOsCandidatos = todosOsCandidatos.filter(c => c.id !== id)
  recalcularDuplicados()
  fecharModal()
  carregarSidebar()
  renderPipeline()
}

function hoje(id) {
  const n = new Date()
  document.getElementById(id).value = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}
function fecharModal() { document.getElementById('modal').style.display = 'none'; candidatoAtivo = null }
function closeModalBg(e) { if (e.target.id === 'modal') fecharModal() }

// ヒアリングをタブで開いて閉じた後、見学/内定/入社日が外部更新されている可能性があるため再取得
window.addEventListener('focus', async () => {
  if (!candidatoAtivo || document.getElementById('modal').style.display !== 'flex') return
  const { data, error } = await sb.from('candidates').select('dt_kengaku,dt_naitei,dt_nyusha').eq('id', candidatoAtivo.id).single()
  if (error || !data) return
  Object.assign(candidatoAtivo, data)
  const c = todosOsCandidatos.find(x => x.id === candidatoAtivo.id)
  if (c) Object.assign(c, data)
  document.getElementById('f_keng').value = data.dt_kengaku || ''
  document.getElementById('f_nait').value = data.dt_naitei || ''
  document.getElementById('f_nyu').value  = data.dt_nyusha || ''
})

function showTab(tab, btn) {
  document.getElementById('pipeline').style.display      = tab === 'pipeline'  ? 'block' : 'none'
  document.getElementById('calendarView').style.display  = tab === 'calendar'  ? 'flex'  : 'none'
  document.getElementById('chartsView').style.display    = tab === 'charts'    ? 'flex'  : 'none'
  document.getElementById('leadsView').style.display     = tab === 'leads'     ? 'flex'  : 'none'
  document.getElementById('stockPoolView').style.display = tab === 'stockpool' ? 'flex'  : 'none'
  document.getElementById('shokaiView').style.display    = tab === 'shokai'    ? 'flex'  : 'none'
  document.getElementById('vagasLinkView').style.display = tab === 'vagaslink' ? 'flex'  : 'none'
  document.getElementById('orderStatusView').style.display = tab === 'orderstatus' ? 'block' : 'none'
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  if (tab === 'leads' || tab === 'stockpool' || tab === 'shokai' || tab === 'vagaslink') {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
    if (btn) btn.classList.add('active')
  } else {
    document.querySelectorAll('.sidebar-nav').forEach(i => i.classList.remove('active'))
    if (btn) btn.classList.add('active')
    if (!document.querySelector('.sidebar-item.active')) {
      const total = document.querySelector('.sidebar-item:not(.sidebar-nav)')
      if (total) total.classList.add('active')
    }
  }
  if (tab === 'calendar')  renderCalendar()
  if (tab === 'charts')    renderCharts()
  if (tab === 'leads')     renderLeads()
  if (tab === 'stockpool') renderStockPool()
  if (tab === 'shokai')    renderShokaiAnalise()
  if (tab === 'vagaslink') renderVagasLink()
  if (tab === 'orderstatus') renderOrderStatus()
}

// ─── 紹介リンク (プロフィールに shokai_nome があるユーザーのみ) ─────
async function renderVagasLink() {
  document.getElementById('vagasLinkNome').textContent = currentProfile?.shokai_nome || '—'
  const grid = document.getElementById('vagasLinkGrid')
  grid.innerHTML = '<div style="padding:10px;color:#aaa;font-size:12px">読み込み中...</div>'

  const { data, error } = await sb.from('locations')
    .select('nome,link_divulgacao')
    .eq('ativo', true)
    .not('link_divulgacao', 'is', null)
    .order('nome')

  const vagas = (data || []).filter(v => v.link_divulgacao && v.link_divulgacao.trim())

  if (error || vagas.length === 0) {
    grid.innerHTML = '<div style="padding:10px;color:#aaa;font-size:12px">紹介リンクが設定された求人がありません。</div>'
    return
  }

  const ref = encodeURIComponent(currentProfile?.shokai_nome || '')
  grid.innerHTML = vagas.map((v, i) => `
    <div class="vagas-link-card">
      <div class="vagas-link-nome">${v.nome}</div>
      <div class="vagas-link-actions">
        <button class="btn-vlink btn-vlink-copy" onclick="copiarVagaLink(${i})">コピー</button>
        <button class="btn-vlink btn-vlink-share" onclick="compartilharVagaLink(${i})">共有</button>
      </div>
    </div>
  `).join('')

  window._vagasLinkAtuais = vagas.map(v => `${v.link_divulgacao}${v.link_divulgacao.includes('?') ? '&' : '?'}ref=${ref}`)
}

function copiarVagaLink(i) {
  navigator.clipboard.writeText(window._vagasLinkAtuais[i]).then(() => alert('リンクをコピーしました！'))
}

function compartilharVagaLink(i) {
  const url = window._vagasLinkAtuais[i]
  if (navigator.share) navigator.share({ url }).catch(() => {})
  else navigator.clipboard.writeText(url).then(() => alert('リンクをコピーしました！'))
}

// ─── オーダー状況 (jimusho: proprio escritorio; admin: todos, separados) ───
const ORDST_STAGE_COLORS = {
  renrakumae:'#1e88e5', taiochu:'#f57c00', mensetsu:'#00897b', kentouchu:'#f9a825', kengaku:'#5e35b1',
  naitei:'#2e7d32', nyusha:'#7b1fa2', zaiseki:'#00695c', stock:'#e91e8c', ng:'#c62828', black:'#212121',
}

function fabricasDoJimushoNome(jimusho) {
  return todasLocations.filter(l => l.jimusho === jimusho).map(l => l.nome)
}

function candidatosDoEscritorio(jimusho) {
  const fabs = fabricasDoJimushoNome(jimusho)
  return todosOsCandidatos.filter(c =>
    c.origem !== 'web' && c.origem !== 'web_stock' && fabs.includes(fabricaEfetiva(c)) && dentroDoPeriodoOuEvento(c)
  )
}

async function renderOrderStatus() {
  const container = document.getElementById('orderStatusView')
  const isAdmin = currentProfile?.role === 'admin'
  const jimushos = isAdmin
    ? (jimushoAtivo && jimushoAtivoNome ? [jimushoAtivoNome] : [...new Set(todasLocations.map(l => l.jimusho).filter(Boolean))].sort())
    : [currentProfile?.jimusho].filter(Boolean)

  if (!jimushos.length) {
    container.innerHTML = '<div class="ordst-empty">事務所情報が設定されていません。</div>'
    return
  }
  container.innerHTML = jimushos.map(jm => renderOrderStatusEscritorio(jm)).join('<div class="ordst-divider"></div>')
}

function renderOrderStatusEscritorio(jimusho) {
  const cands = candidatosDoEscritorio(jimusho)
  const naoEncerrado = c => !['ng','black'].includes(getStage(c))

  // stats
  const totalAtivo   = cands.filter(naoEncerrado).length
  const alertas      = cands.filter(c => c.alerta_data).length
  const parados      = cands.filter(c => naoEncerrado(c) && !['nyusha','zaiseki'].includes(getStage(c)) && diasNaEtapa(c).alert).length
  const comMens      = cands.filter(c => c.dt_mensetsu).length
  const comNait      = cands.filter(c => c.dt_naitei).length
  const comNyu       = cands.filter(c => c.dt_nyusha).length
  const pct = (a, b) => b === 0 ? '—' : Math.round(a / b * 100) + '%'

  // funil consolidado — 入社 conta pelo dt_nyusha dentro do período filtrado, não pela
  // exceção de "sempre mostrar quem já entrou" que o resto do app usa (dentroDoPeriodo)
  const filtroIni = document.getElementById('filterDtIni')?.value
  const filtroFim = document.getElementById('filterDtFim')?.value
  const funil = STAGES.filter(s => s.key !== 'zaiseki').map(s => {
    let count
    if (s.key === 'nyusha') {
      count = cands.filter(c => getStage(c) === 'nyusha' && c.dt_nyusha
        && (!filtroIni || c.dt_nyusha >= filtroIni) && (!filtroFim || c.dt_nyusha <= filtroFim)).length
    } else {
      count = cands.filter(c => getStage(c) === s.key).length
    }
    return { label: s.label, color: ORDST_STAGE_COLORS[s.key], count }
  })
  const funilMax = Math.max(1, ...funil.map(f => f.count))

  // cards de オーダー (só leitura aqui — edição agora é na barra da fábrica ativa) — só quem tem order_atual > 0
  const fabricasComOrder = todasLocations
    .filter(l => l.jimusho === jimusho && (l.order_atual || 0) > 0)
    .slice()
    .sort((a, b) => ((b.order_atual||0) - (b.naitei_atual||0)) - ((a.order_atual||0) - (a.naitei_atual||0)))

  const cardsOrder = fabricasComOrder.map(l => {
    const order  = l.order_atual || 0
    const naitei = l.naitei_atual || 0
    const pctOrd = order > 0 ? Math.min(100, Math.round(naitei / order * 100)) : 0
    const cor = pctOrd >= 100 ? '#2e7d32' : pctOrd >= 50 ? '#f9a825' : '#c62828'
    return `
      <div class="ordst-card">
        <div class="ordst-ring" style="background:conic-gradient(${cor} ${pctOrd*3.6}deg, var(--ordst-ring-bg) 0deg)">
          <div class="ordst-ring-inner">${pctOrd}%</div>
        </div>
        <div class="ordst-card-nome">${l.nome}</div>
        <div class="ordst-card-numeros">オーダー ${order} ／ 内定 ${naitei}</div>
      </div>`
  }).join('')

  // agenda dos proximos 14 dias, escopo do escritorio inteiro (nao so quem tem order)
  const agendaHtml = renderOrdstAgenda(cands)

  return `
    <div class="ordst-escritorio">
      <h2 class="ordst-titulo">${jimusho}</h2>

      <div class="ordst-stats-row">
        <div class="ordst-stat"><div class="ordst-stat-num">${totalAtivo}</div><div class="ordst-stat-label">稼働中</div></div>
        <div class="ordst-stat"><div class="ordst-stat-num" style="color:#e8621a">${alertas}</div><div class="ordst-stat-label">アラート</div></div>
        <div class="ordst-stat"><div class="ordst-stat-num" style="color:#c62828">${parados}</div><div class="ordst-stat-label">7日+滞留</div></div>
        <div class="ordst-stat"><div class="ordst-stat-num">${pct(comMens, cands.length)}</div><div class="ordst-stat-label">応募→面接</div></div>
        <div class="ordst-stat"><div class="ordst-stat-num">${pct(comNait, comMens)}</div><div class="ordst-stat-label">面接→内定</div></div>
        <div class="ordst-stat"><div class="ordst-stat-num">${pct(comNyu, comNait)}</div><div class="ordst-stat-label">内定→入社</div></div>
      </div>

      ${cardsOrder
        ? `<div class="ordst-grid">${cardsOrder}</div>`
        : '<div class="ordst-empty">オーダーが登録されているファブリカがありません。工場別のフィルターで各ファブリカを選び、上のバーから登録してください。</div>'}

      <h3 class="ordst-subtitulo">今後の予定（14日間）</h3>
      ${agendaHtml}

      <h3 class="ordst-subtitulo">状況</h3>
      <div class="ordst-funil">
        ${funil.map(f => `
          <div class="ordst-funil-row">
            <span class="ordst-funil-label">${f.label}</span>
            <div class="ordst-funil-bar-wrap"><div class="ordst-funil-bar" style="width:${f.count/funilMax*100}%;background:${f.color}"></div></div>
            <span class="ordst-funil-count">${f.count}</span>
          </div>`).join('')}
      </div>
    </div>`
}

function renderOrdstAgenda(cands) {
  const hoje = new Date(); hoje.setHours(0,0,0,0)
  const fim  = new Date(hoje); fim.setDate(fim.getDate() + 14)
  const iso  = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const tipoLabel = { mensetsu:'面接', kengaku:'見学', nyusha:'入社', alerta:'アラート' }
  const events = {}
  const add = (dateStr, tipo, nome, fabrica, candidatoId, hora) => {
    if (!dateStr) return
    const d = dateStr.split('T')[0]
    if (d < iso(hoje) || d > iso(fim)) return
    if (!events[d]) events[d] = []
    events[d].push({ tipo, nome, fabrica, candidatoId, hora })
  }
  cands.forEach(c => {
    add(c.dt_mensetsu, 'mensetsu', c.shimei, fabricaEfetiva(c), c.id, c.mensetsu_hora)
    add(c.dt_kengaku,  'kengaku',  c.shimei, fabricaEfetiva(c), c.id, c.kengaku_hora)
    add(c.dt_nyusha,   'nyusha',   c.shimei, fabricaEfetiva(c), c.id)
    if (c.alerta_data) add(c.alerta_data, 'alerta', c.shimei, fabricaEfetiva(c), c.id)
  })
  const dates = Object.keys(events).sort()
  if (!dates.length) return '<div class="ordst-empty">今後14日間の予定はありません。</div>'
  const dows = ['日','月','火','水','木','金','土']
  const dias = dates.map(dateStr => {
    const date = new Date(dateStr + 'T00:00:00')
    const isToday = dateStr === iso(hoje)
    const rows = events[dateStr].map(e => `
      <div class="agenda-event" onclick="abrirModal('${e.candidatoId}')">
        <span class="agenda-chip ${e.tipo}">${tipoLabel[e.tipo]}${e.hora ? ' ' + e.hora.slice(0,5) : ''}</span>
        <span class="agenda-nome">${e.nome||'—'}</span>
        ${e.fabrica ? `<span class="agenda-chip" style="background:${corDaFabrica(e.fabrica)}">${e.fabrica}</span>` : ''}
      </div>`).join('')
    return `
      <div class="agenda-day">
        <div class="agenda-day-header">
          <span class="agenda-dow">${dows[date.getDay()]}</span>
          <span class="agenda-date">${date.getMonth()+1}月${date.getDate()}日</span>
          ${isToday ? '<span class="agenda-today-badge">今日</span>' : ''}
        </div>
        <div class="agenda-events">${rows}</div>
      </div>`
  }).join('')
  return `<div class="ordst-agenda-grid">${dias}</div>`
}

async function alterarOrderNaitei(locationId, campo, delta, valorDireto) {
  const loc = todasLocations.find(l => l.id === locationId)
  if (!loc) return
  let novo
  if (valorDireto !== undefined) novo = Math.max(0, parseInt(valorDireto) || 0)
  else novo = Math.max(0, (loc[campo] || 0) + delta)
  const { error } = await sb.from('locations').update({ [campo]: novo }).eq('id', locationId)
  if (error) { alert('Erro: ' + error.message); return }
  loc[campo] = novo
  if (document.getElementById('orderStatusView').style.display !== 'none') renderOrderStatus()
  if (fabricaAtivaLocId === locationId) atualizarFabricaOrderBar()
}

// ─── barra de オーダー/内定 da fábrica ativa (工場別 → fábrica específica) ───
let fabricaAtivaLocId = null

function podeEditarOrderFabrica(fabricaNome) {
  const role = currentProfile?.role
  if (!fabricaNome) return false
  if (role === 'admin') return true
  if (role === 'jimusho') {
    const loc = todasLocations.find(l => l.nome === fabricaNome)
    return loc?.jimusho === currentProfile?.jimusho
  }
  if (role === 'tantousha') return (currentProfile?.fabricas || []).includes(fabricaNome)
  return false
}

function atualizarFabricaOrderBar() {
  const bar = document.getElementById('fabricaOrderBar')
  const loc = fabricaAtiva ? todasLocations.find(l => l.nome === fabricaAtiva) : null
  if (!loc || !podeEditarOrderFabrica(fabricaAtiva)) {
    bar.style.display = 'none'
    fabricaAtivaLocId = null
    return
  }
  fabricaAtivaLocId = loc.id
  document.getElementById('fabricaOrderNome').textContent = loc.nome
  document.getElementById('fabricaOrderNum').value = loc.order_atual || 0
  document.getElementById('fabricaNaiteiNum').value = loc.naitei_atual || 0
  bar.style.display = 'flex'
}

function alterarOrderFabricaAtiva(campo, delta, valorDireto) {
  if (!fabricaAtivaLocId) return
  alterarOrderNaitei(fabricaAtivaLocId, campo, delta, valorDireto)
}

// ─── SHOKAI ANALYSIS (admin) ─────────────────────────────────
function renderShokaiAnalise() {
  // usa o período global do topo, SEM exceção de 入社/在籍:
  // a taxa compara "dos cadastrados no período, quantos entraram"
  const dados = todosOsCandidatos.filter(c => c.shokai && dentroDoPeriodo(c, false))

  const mapa = {}
  dados.forEach(c => {
    const m = mapa[c.shokai] || (mapa[c.shokai] = { total: 0, nyusha: 0, ng: 0, andamento: 0 })
    m.total++
    if (c.dt_nyusha) m.nyusha++
    else if (c.dt_ng || c.is_blacklisted) m.ng++
    else m.andamento++
  })

  const linhas = Object.entries(mapa).map(([nome, m]) => ({
    nome, ...m, rate: m.total ? m.nyusha / m.total : 0,
  }))

  // 3+ indicações primeiro (por taxa, depois por volume); menos de 3 vão para o fim
  linhas.sort((a, b) => {
    const aOk = a.total >= 3, bOk = b.total >= 3
    if (aOk !== bOk) return aOk ? -1 : 1
    return (b.rate - a.rate) || (b.nyusha - a.nyusha) || (b.total - a.total)
  })

  const totalGeral  = linhas.reduce((s, l) => s + l.total, 0)
  const nyushaGeral = linhas.reduce((s, l) => s + l.nyusha, 0)
  document.getElementById('shokai-resumo').textContent =
    `紹介者 ${linhas.length}名 ・ 紹介 ${totalGeral}件 ・ 入社 ${nyushaGeral}件（全体 ${totalGeral ? Math.round(nyushaGeral / totalGeral * 100) : 0}%）`

  const corRate = r => r >= 0.5 ? '#2e7d32' : r >= 0.25 ? '#ef6c00' : '#c62828'

  const rows = linhas.map(l => {
    const pct = Math.round(l.rate * 100)
    const cor = l.total >= 3 ? corRate(l.rate) : '#999'
    return `<tr class="${l.total < 3 ? 'poucos' : ''}">
      <td>${l.nome}</td>
      <td class="num">${l.total}</td>
      <td class="num">${l.nyusha}</td>
      <td class="num">${l.ng}</td>
      <td class="num">${l.andamento}</td>
      <td class="num" style="white-space:nowrap">
        <span class="shokai-bar" style="width:${Math.max(pct, 2) * 0.6}px;background:${cor}"></span>
        <span class="shokai-rate" style="color:${cor}">${pct}%</span>
      </td>
    </tr>`
  }).join('')

  document.getElementById('shokaiTable').innerHTML = linhas.length ? `
    <table class="shokai-table">
      <thead><tr>
        <th>紹介者</th><th class="num">紹介数</th><th class="num">入社</th>
        <th class="num">NG</th><th class="num">進行中</th><th class="num">入社率</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`
    : '<div style="padding:30px;text-align:center;color:#aaa;font-size:13px">この期間の紹介はありません</div>'
}

// ─── CHARTS ──────────────────────────────────────────────────
let chartInstances = {}

function destroyChart(id) { if (chartInstances[id]) { chartInstances[id].destroy(); delete chartInstances[id] } }

function renderCharts() {
  const dark = document.body.classList.contains('dark-mode')
  Chart.defaults.color = dark ? '#c7c7d6' : '#666'
  Chart.defaults.borderColor = dark ? '#3a3a4d' : '#e0e0e0'
  const fab = document.getElementById('chartFabrica').value
  const candidatosValidos = getFiltrados(false)
  const dados = fab ? candidatosValidos.filter(c => fabricaEfetiva(c) === fab) : candidatosValidos

  // Esconde/mostra gráfico de fábricas quando filtrado
  document.getElementById('cardFabrica').style.display = fab ? 'none' : ''

  // Conversões
  const total   = dados.length
  const comMens = dados.filter(c => c.dt_mensetsu).length
  const comNait = dados.filter(c => c.dt_naitei).length
  const comNyu  = dados.filter(c => c.dt_nyusha).length
  const pct = (a, b) => b === 0 ? '—' : Math.round(a / b * 100) + '%'
  document.getElementById('cv-total').textContent = total
  document.getElementById('cv-mens').textContent  = pct(comMens, total)
  document.getElementById('cv-nait').textContent  = pct(comNait, comMens)
  document.getElementById('cv-nyu').textContent   = pct(comNyu, comNait)

  // Funil
  const stageLabels = ['連絡前','対応中','面接','検討中','見学・ヒアリング','内定','入社','在籍','工場ストック','NG','ブラック']
  const stageKeys   = ['renrakumae','taiochu','mensetsu','kentouchu','kengaku','naitei','nyusha','zaiseki','stock','ng','black']
  const stageCounts = stageKeys.map(k => dados.filter(c => getStage(c) === k).length)
  const stageColors = ['#1e88e5','#f57c00','#00897b','#f9a825','#5e35b1','#2e7d32','#7b1fa2','#00695c','#e91e8c','#c62828','#212121']

  destroyChart('chartFunil')
  chartInstances['chartFunil'] = new Chart(document.getElementById('chartFunil'), {
    type: 'bar',
    data: { labels: stageLabels, datasets: [{ data: stageCounts, backgroundColor: stageColors, borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
  })

  // Por fábrica (só geral)
  if (!fab) {
    const fabMap = {}
    candidatosValidos.forEach(c => { const f = fabricaEfetiva(c); if (f) fabMap[f] = (fabMap[f] || 0) + 1 })
    const fabLabels = Object.keys(fabMap).sort((a,b) => fabMap[b] - fabMap[a])
    const fabCounts = fabLabels.map(f => fabMap[f])
    destroyChart('chartFabrica')
    chartInstances['chartFabrica'] = new Chart(document.getElementById('chartFabrica'), {
      type: 'bar',
      data: { labels: fabLabels, datasets: [{ data: fabCounts, backgroundColor: '#1e88e5', borderRadius: 4 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
    })
  }

  // Por mês
  const mesMap = {}
  dados.forEach(c => {
    const m = c.created_at?.slice(0, 7)
    if (m) mesMap[m] = (mesMap[m] || 0) + 1
  })
  const mesLabels = Object.keys(mesMap).sort()
  destroyChart('chartMes')
  chartInstances['chartMes'] = new Chart(document.getElementById('chartMes'), {
    type: 'line',
    data: { labels: mesLabels, datasets: [{ data: mesLabels.map(m => mesMap[m]), borderColor: '#1e88e5', backgroundColor: 'rgba(30,136,229,0.1)', fill: true, tension: 0.3, pointRadius: 4 }] },
    options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }
  })

  // Ranking 紹介者 (barra empilhada por grupo de etapa, em vez das 10 etapas soltas)
  const GRUPOS_SHOKAI = [
    { label: '進行中',      color: '#1e88e5', stages: ['renrakumae','taiochu','mensetsu','kengaku'] },
    { label: '成約',        color: '#2e7d32', stages: ['naitei','nyusha','zaiseki'] },
    { label: 'ストック',     color: '#f9a825', stages: ['stock'] },
    { label: 'NG・ブラック', color: '#c62828', stages: ['ng','black'] },
  ]
  const shMap = {}      // total por shokai, so pra ordenar o ranking
  const shGrupoMap = {} // shokai -> { grupoLabel: count }
  dados.forEach(c => {
    if (!c.shokai) return
    shMap[c.shokai] = (shMap[c.shokai] || 0) + 1
    if (!shGrupoMap[c.shokai]) shGrupoMap[c.shokai] = {}
    const stg = getStage(c)
    const grupo = GRUPOS_SHOKAI.find(g => g.stages.includes(stg)) || GRUPOS_SHOKAI[0]
    shGrupoMap[c.shokai][grupo.label] = (shGrupoMap[c.shokai][grupo.label] || 0) + 1
  })
  const shLabels = Object.keys(shMap).sort((a,b) => shMap[b] - shMap[a])
  // altura dinâmica: cresce com a quantidade de 紹介者 para mostrar todos os nomes
  document.getElementById('chartShokaiWrap').style.height = Math.max(220, shLabels.length * 28 + 60) + 'px'
  destroyChart('chartShokai')
  chartInstances['chartShokai'] = new Chart(document.getElementById('chartShokai'), {
    type: 'bar',
    data: {
      labels: shLabels,
      datasets: GRUPOS_SHOKAI.map(g => ({
        label: g.label,
        data: shLabels.map(s => shGrupoMap[s]?.[g.label] || 0),
        backgroundColor: g.color,
      })),
    },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: true, position: 'bottom', labels: { boxWidth: 12, font: { size: 10 } } } },
      scales: {
        x: { stacked: true, beginAtZero: true, ticks: { precision: 0 } },
        y: { stacked: true, ticks: { autoSkip: false } },
      }
    }
  })
}

function carregarChartFabricaFilter() {
  const sel = document.getElementById('chartFabrica')
  sel.innerHTML = '<option value="">全体</option>'
  todasFabricas.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o) })
}

document.addEventListener('click', e => {
  const box = document.getElementById('stageFilterBox')
  if (box && !e.target.closest('#stageFilterBox') && !e.target.closest('[onclick="toggleStageFilter()"]')) {
    box.style.display = 'none'
  }
})

function toggleSidebar() {
  const sidebar  = document.getElementById('sidebar')
  const overlay  = document.getElementById('sidebarOverlay')
  const isOpen   = sidebar.classList.toggle('mobile-open')
  overlay.style.display = isOpen ? 'block' : 'none'
}

function setBottomNav(btn) {
  document.querySelectorAll('.bnav-btn').forEach(b => b.classList.remove('active'))
  if (btn) btn.classList.add('active')
}

// Fecha sidebar ao clicar em fábrica no mobile
const origFiltrar = filtrarFabrica
filtrarFabrica = function(fabrica, el) {
  origFiltrar(fabrica, el)
  if (window.innerWidth <= 768 || document.body.classList.contains('force-mobile')) {
    document.getElementById('sidebar').classList.remove('mobile-open')
    document.getElementById('sidebarOverlay').style.display = 'none'
  }
}

// ─── LEADS DO SITE ────────────────────────────────────────────
const LEAD_STAGES = [
  { key: 'renrakumae', label: '連絡前',    cls: 'lead-stage-renrakumae' },
  { key: 'taiochu',    label: '対応中',    cls: 'lead-stage-taiochu'    },
  { key: 'indicado',   label: '担当者紹介', cls: 'lead-stage-indicado'   },
  { key: 'stock',      label: 'ストック',   cls: 'lead-stage-stock'      },
  { key: 'ng',         label: 'NG',        cls: 'lead-stage-ng'         },
  { key: 'black',      label: 'ブラック',   cls: 'lead-stage-black'      },
]
const _leadExpanded = new Set()

function getLeadsStage(c) {
  if (c.is_blacklisted)              return 'black'
  if (c.origem === 'web_indicado')   return 'indicado'
  if (c.origem === 'web_stock')      return 'stock'
  if (c.dt_ng)                       return 'ng'
  if (c.dt_taiochu)                  return 'taiochu'
  return 'renrakumae'
}

// admin ve apenas os leads sem shokaisha atribuido (o valor generico da empresa);
// os demais (com shokai_nome no perfil) so veem os proprios
function shokaiFiltroLeads() {
  return currentProfile?.role === 'admin' ? 'ヒューマンシステム（西留）' : currentProfile?.shokai_nome
}

function podeAgirLeads() {
  return currentProfile?.role === 'admin' || currentProfile?.role === 'tantousha' || currentProfile?.role === 'jimusho'
}

function getLeadsFiltrados() {
  const fabFilter = document.getElementById('leadsFilter')?.value || ''
  const search = document.getElementById('searchInput')?.value.toLowerCase() || ''
  const sexo   = document.getElementById('filterSexo')?.value || ''
  const jp     = document.getElementById('filterJP')?.value || ''
  const idade  = parseInt(document.getElementById('filterIdade')?.value) || null
  const f = activeFilters
  return todosOsCandidatos.filter(c => {
    if (c.origem !== 'web' && c.origem !== 'web_indicado' && c.origem !== 'web_stock') return false
    if (c.shokai !== shokaiFiltroLeads()) return false
    if (!dentroDoPeriodo(c)) return false
    if (fabFilter && c.fabrica !== fabFilter) return false
    if (sexo   && c.sexo !== sexo)                                            return false
    if (jp     && c.nivel_japones !== jp)                                     return false
    if (idade  && c.idade > idade)                                            return false
    if (search && !c.shimei?.toLowerCase().includes(search) && !c.telefone?.includes(search) && !String(c.numero_cadastro ?? '').includes(search)) return false
    if (f.jp?.length    && !f.jp.includes(c.nivel_japones))     return false
    if (f.stage?.length && !f.stage.includes(getLeadsStage(c))) return false
    if (f.emp?.length   && !f.emp.includes(c.esta_empregado))    return false
    if (f.nac?.length   && !f.nac.includes(c.nacionalidade))     return false
    if (f.pref?.length  && !f.pref.includes(c.prefecture))       return false
    if (f.turno?.length  && !asArr(c.turnos_possiveis).some(t => f.turno.includes(t)))   return false
    if (f.menkyo?.length && !asArr(c.habilitacao).some(m => f.menkyo.includes(m)))       return false
    if (f.exp?.length    && !asArr(c.experiencia).some(e => f.exp.includes(e)))          return false
    if (f.apt            && String(c.precisa_apartamento) !== f.apt)                    return false
    if (f.sexo           && c.sexo !== f.sexo)                                          return false
    if (f.move           && String(c.pode_mudar) !== f.move)                            return false
    if (f.ageMax         && (c.idade > f.ageMax))                                       return false
    return true
  })
}

function renderLeads() {
  const sel = document.getElementById('leadsFilter')

  // Popula dropdown de fábricas
  const allLeads = todosOsCandidatos.filter(c =>
    (c.origem === 'web' || c.origem === 'web_indicado' || c.origem === 'web_stock') &&
    c.shokai === shokaiFiltroLeads()
  )
  const fabs = [...new Set(allLeads.map(c => c.fabrica).filter(Boolean))].sort()
  const cur  = sel?.value || ''
  if (sel) sel.innerHTML = '<option value="">Todas as fábricas</option>' + fabs.map(f => `<option value="${f}" ${f===cur?'selected':''}>${f}</option>`).join('')

  const leads = getLeadsFiltrados()

  const grouped = {}
  LEAD_STAGES.forEach(s => grouped[s.key] = [])
  leads.forEach(c => { const stg = getLeadsStage(c); if (grouped[stg]) grouped[stg].push(c) })

  document.getElementById('leads-count').textContent = `(${leads.length})`

  const colHeader = `<div class="lead-col-header"><span>Nome</span><span>Telefone</span><span>Fábrica</span><span>Estado</span><span>Cidade</span><span>G</span><span>Idade</span><span>Japonês</span><span>Apto</span><span>Ações</span></div>`

  document.getElementById('leadsStages').innerHTML = LEAD_STAGES.map(stage => {
    const list = grouped[stage.key]
    const expanded = _leadExpanded.has(stage.key)
    const show = expanded ? list : list.slice(0, 5)
    const hasMore = list.length > 5 && !expanded

    const agir = podeAgirLeads()
    let rows = ''
    if (list.length === 0) {
      rows = '<div style="padding:10px 16px;color:#aaa;font-size:12px;font-style:italic">候補者なし</div>'
    } else {
      rows = colHeader + show.map(c => {
        let actions = ''
        if (stage.key === 'renrakumae' && agir) {
          actions = `<div class="lead-actions">
            <button class="btn-lead amber"  onclick="moverParaTaiochu('${c.id}')">対応中</button>
            <button class="btn-lead green"  onclick="enviarParaFabrica('${c.id}')">担当者紹介</button>
            <button class="btn-lead blue"   onclick="moverParaStock('${c.id}')">ストック</button>
            <button class="btn-lead orange" onclick="moverNG('${c.id}')">NG</button>
            <button class="btn-lead red"    onclick="bloquearLead('${c.id}')">Bloquear</button>
          </div>`
        } else if (stage.key === 'taiochu' && agir) {
          actions = `<div class="lead-actions">
            <button class="btn-lead green"  onclick="enviarParaFabrica('${c.id}')">担当者紹介</button>
            <button class="btn-lead blue"   onclick="moverParaStock('${c.id}')">ストック</button>
            <button class="btn-lead orange" onclick="moverNG('${c.id}')">NG</button>
            <button class="btn-lead red"    onclick="bloquearLead('${c.id}')">Bloquear</button>
          </div>`
        } else if (stage.key === 'stock' && agir) {
          actions = `<div class="lead-actions">
            <button class="btn-lead green"  onclick="enviarParaFabrica('${c.id}')">担当者紹介</button>
            <button class="btn-lead orange" onclick="moverNG('${c.id}')">NG</button>
          </div>`
        } else if (stage.key === 'indicado') {
          actions = `<span style="font-size:11px;color:#2e7d32;font-weight:600">✓ Encaminhado</span>`
        }
        return `<div class="lead-row">
          <span class="${isTelDuplicado(c) ? 'dup-tel' : ''}" style="font-weight:600;cursor:pointer;color:#1e88e5" onclick="abrirModal('${c.id}')">${c.shimei || '—'}</span>
          <span>${c.telefone || '—'}</span>
          <span style="font-size:11px">${c.fabrica || '—'}</span>
          <span style="font-size:11px">${c.prefecture || '—'}</span>
          <span style="font-size:11px">${c.city || '—'}</span>
          <span>${c.sexo === '男性' ? 'M' : c.sexo === '女性' ? 'F' : '—'}</span>
          <span>${c.idade || '—'}</span>
          <span style="font-size:11px">${c.nivel_japones?.split(' ')[0] || '—'}</span>
          <span style="font-size:11px">${c.precisa_apartamento ? '必要' : '不要'}</span>
          <span>${actions}</span>
        </div>`
      }).join('') + (hasMore ? `<div style="padding:7px 16px;font-size:12px;color:#1e88e5;cursor:pointer" onclick="_leadExpanded.add('${stage.key}');renderLeads()">+ さらに ${list.length - 5} 件</div>` : '')
    }

    return `<div class="lead-stage-section ${stage.cls}">
      <div class="lead-stage-header">${stage.label} <span class="lead-stage-count">${list.length}</span></div>
      <div class="lead-stage-body">${rows}</div>
    </div>`
  }).join('')
}

async function enviarParaFabrica(id) {
  const c = todosOsCandidatos.find(x => x.id === id)
  if (!c) return
  if (!c.fabrica && !confirm('Este lead não tem fábrica atribuída. Enviar assim mesmo?')) return
  const hoje = new Date().toISOString().split('T')[0]
  const updates = {
    origem:        'web_indicado',
    dt_shokai:     hoje,
    dt_taiochu:    null,
    dt_mensetsu:   null,
    mensetsu_hora: null,
    dt_kengaku:    null,
    dt_stock:      null,
    dt_ng:         null,
  }
  const { error } = await sb.from('candidates').update(updates).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  Object.assign(c, updates)
  renderLeads()
  carregarSidebar()
  renderPipeline()
}

async function moverParaTaiochu(id) {
  const hoje = new Date().toISOString().split('T')[0]
  const { error } = await sb.from('candidates').update({ dt_taiochu: hoje }).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c.dt_taiochu = hoje
  renderLeads()
}

async function moverParaStock(id) {
  const { error } = await sb.from('candidates').update({ origem: 'web_stock' }).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c.origem = 'web_stock'
  renderLeads()
}

async function moverNG(id) {
  const hoje = new Date().toISOString().split('T')[0]
  const c = todosOsCandidatos.find(x => x.id === id)
  const updates = { dt_ng: hoje, origem: 'web' }
  if (!c?.dt_stock_geral) updates.dt_stock_geral = hoje
  const { error } = await sb.from('candidates').update(updates).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  if (c) Object.assign(c, updates)
  renderLeads()
}

async function bloquearLead(id) {
  if (!confirm('Bloquear este lead?')) return
  const { error } = await sb.from('candidates').update({ is_blacklisted: true }).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c.is_blacklisted = true
  renderLeads()
}

// ─── STOCK POOL ───────────────────────────────────────────────
function renderStockPool() {
  const jp   = document.getElementById('poolFilterJP')?.value   || ''
  const sexo = document.getElementById('poolFilterSexo')?.value || ''

  let pool = todosOsCandidatos.filter(c => c.origem === 'web_stock' || c.dt_stock_geral)
  if (jp)   pool = pool.filter(c => c.nivel_japones === jp)
  if (sexo) pool = pool.filter(c => c.sexo === sexo)

  document.getElementById('pool-count').textContent = `(${pool.length})`
  const body = document.getElementById('poolBody')

  if (!pool.length) {
    body.innerHTML = '<div style="padding:30px;color:#aaa;font-size:13px;text-align:center">Nenhum candidato no pool</div>'
    return
  }

  body.innerHTML = pool.map(c => `
    <div class="pool-row">
      <span style="font-weight:600;cursor:pointer;color:#1e88e5" onclick="abrirModal('${c.id}')">${c.shimei || '—'}</span>
      <span>${c.telefone || '—'}</span>
      <span style="font-size:11px">${c.fabrica || '—'}</span>
      <span style="font-size:10px">${c.visa?.split('（')[0] || '—'}</span>
      <span>${c.sexo === '男性' ? 'M' : c.sexo === '女性' ? 'F' : '—'}</span>
      <span>${c.idade || '—'}</span>
      <span style="font-size:11px">${c.nivel_japones?.split(' ')[0] || '—'}</span>
      <span><button class="btn-atribuir" onclick="atribuirParaFabrica('${c.id}')">Atribuir fábrica</button></span>
    </div>
  `).join('')
}

async function kengakuNG(e, id) {
  e.stopPropagation()
  if (!confirm('NGにしますか？')) return
  const hoje = hojeISO()
  const { error } = await sb.from('candidates').update({ dt_ng: hoje }).eq('id', id)
  if (error) { alert('エラー: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c.dt_ng = hoje
  renderPipeline()
}

async function kengakuNaitei(e, id) {
  e.stopPropagation()
  const hoje = hojeISO()
  const { error } = await sb.from('candidates').update({ dt_naitei: hoje }).eq('id', id)
  if (error) { alert('エラー: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c.dt_naitei = hoje
  renderPipeline()
}

async function taisha(e, id) {
  e.stopPropagation()
  if (!confirm('退社して全体ストックに移しますか？')) return
  const hoje = hojeISO()
  const { error } = await sb.from('candidates').update({ dt_stock_geral: hoje }).eq('id', id)
  if (error) { alert('エラー: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c.dt_stock_geral = hoje
  renderPipeline()
  renderStockPool()
}

async function avancarEtapa(e, id, field, confirmMsg) {
  e.stopPropagation()
  if (confirmMsg && !confirm(confirmMsg)) return
  const hoje = hojeISO()
  const { error } = await sb.from('candidates').update({ [field]: hoje }).eq('id', id)
  if (error) { alert('エラー: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) c[field] = hoje
  renderPipeline()
}

// rank: 0 = mais avançado (NG). -1 = ブラック (mais avançado que tudo).
// STAGE_CHAIN.length = 連絡前 (nada preenchido, menos avançado que tudo).
function getStageRank(c) {
  if (c.is_blacklisted) return -1
  const idx = STAGE_CHAIN.findIndex(s => s.key === getStage(c))
  return idx === -1 ? STAGE_CHAIN.length : idx
}

function classificarMovimentoMassa(c, targetKey) {
  const targetRank = STAGE_CHAIN.findIndex(s => s.key === targetKey)
  return getStageRank(c) > targetRank ? 'backward' : 'forward'
}

// Sempre limpa tudo que está "acima" do alvo na cadeia (e o flag de ブラック) —
// é seguro pra todo mundo, avançando ou voltando: quem já não tinha esses
// campos preenchidos simplesmente recebe null de novo (no-op).
function construirAtualizacaoMassa(targetKey) {
  const targetIdx = STAGE_CHAIN.findIndex(s => s.key === targetKey)
  const target = STAGE_CHAIN[targetIdx]
  const updates = { [target.fields[0]]: hojeISO(), is_blacklisted: false }
  STAGE_CHAIN.slice(0, targetIdx).forEach(s => s.fields.forEach(f => { updates[f] = null }))
  return updates
}

async function executarMovimentacaoEmMassa() {
  const targetKey = document.getElementById('bulkMoveTarget').value
  if (!targetKey) { alert('移動先のステージを選んでください。'); return }
  const target = STAGE_CHAIN.find(s => s.key === targetKey)
  const ids = [..._selecionadosImpressao]
  if (ids.length === 0) return
  const candidatos = ids.map(id => todosOsCandidatos.find(c => c.id === id)).filter(Boolean)

  let forwardCount = 0, backwardCount = 0
  candidatos.forEach(c => {
    if (classificarMovimentoMassa(c, targetKey) === 'backward') backwardCount++
    else forwardCount++
  })

  let msg = null
  if (candidatos.length === 1) {
    if (backwardCount === 1) msg = `この候補者を「${target.label}」に戻します。それより後の日付（内定日など）は削除されます。よろしいですか？`
  } else if (backwardCount === 0) {
    msg = `${candidatos.length}人の候補者を「${target.label}」に移動しますか？`
  } else if (forwardCount === 0) {
    msg = `${candidatos.length}人の候補者を「${target.label}」に戻します。それより後の日付は削除されます。よろしいですか？`
  } else {
    msg = `${forwardCount}人が前進、${backwardCount}人が後退します（後退する候補者は、それより後の日付が削除されます）。実行しますか？`
  }

  if (msg && !confirm(msg)) return

  const updates = construirAtualizacaoMassa(targetKey)
  const { error } = await sb.from('candidates').update(updates).in('id', ids)
  if (error) { alert('エラー: ' + error.message); return }
  candidatos.forEach(c => Object.assign(c, updates))

  _selecionadosImpressao.clear()
  document.getElementById('bulkMoveTarget').value = ''
  recalcularDuplicados()
  renderPipeline()
  carregarSidebar()
}

async function atribuirParaFabrica(id) {
  const fabricasSel = todasFabricas.length ? todasFabricas : [...new Set(todosOsCandidatos.filter(x => x.fabrica).map(x => x.fabrica))].sort()
  const lista = fabricasSel.map((f, i) => `${i+1}. ${f}`).join('\n')
  const resp = prompt('Selecione a fábrica:\n' + lista + '\n\nDigite o número:')
  if (!resp) return
  const fabrica = fabricasSel[parseInt(resp) - 1]
  if (!fabrica) { alert('Número inválido'); return }
  const { error } = await sb.from('candidates').update({ fabrica, origem: 'indicado', dt_stock_geral: null }).eq('id', id)
  if (error) { alert('Erro: ' + error.message); return }
  const c = todosOsCandidatos.find(x => x.id === id)
  if (c) { c.fabrica = fabrica; c.origem = 'indicado'; c.dt_stock_geral = null }
  renderStockPool()
  carregarSidebar()
  renderPipeline()
}

let currentProfile = null

async function fazerLogin() {
  const email = document.getElementById('loginEmail').value.trim()
  const pass  = document.getElementById('loginPass').value
  const btn   = document.getElementById('loginBtn')
  const err   = document.getElementById('loginErr')

  if (!email || !pass) { err.textContent = 'メールとパスワードを入力してください'; return }

  btn.disabled = true
  btn.textContent = 'ログイン中...'
  err.textContent = ''

  const { error } = await sb.auth.signInWithPassword({ email, password: pass })

  btn.disabled = false
  btn.textContent = 'ログイン'

  if (error) {
    err.textContent = 'メールまたはパスワードが違います'
    return
  }
  await iniciarDashboard()
}

function toggleEsqueciSenha() {
  const box = document.getElementById('forgotBox')
  box.style.display = box.style.display === 'none' ? 'block' : 'none'
  document.getElementById('forgotEmail').value = document.getElementById('loginEmail').value.trim()
  document.getElementById('forgotMsg').textContent = ''
}

async function enviarRecuperacao() {
  const email = document.getElementById('forgotEmail').value.trim()
  const btn   = document.getElementById('forgotBtn')
  const msg   = document.getElementById('forgotMsg')

  if (!email) { msg.textContent = 'メールアドレスを入力してください'; return }

  btn.disabled = true
  btn.textContent = '送信中...'

  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + window.location.pathname,
  })

  btn.disabled = false
  btn.textContent = '送信'

  msg.style.color = error ? '#c62828' : '#2e7d32'
  if (error) console.error('resetPasswordForEmail:', error)
  msg.textContent = error
    ? `エラー: ${error.message || 'もう一度お試しください。'}`
    : 'メールを送信しました。届いたリンクからパスワードを再設定してください。'
}

async function salvarNovaSenha() {
  const p1  = document.getElementById('novaSenha1').value
  const p2  = document.getElementById('novaSenha2').value
  const btn = document.getElementById('resetBtn')
  const err = document.getElementById('resetErr')

  if (!p1 || p1.length < 6) { err.textContent = '6文字以上のパスワードを入力してください'; return }
  if (p1 !== p2)            { err.textContent = 'パスワードが一致しません'; return }

  btn.disabled = true
  btn.textContent = '保存中...'

  const { error } = await sb.auth.updateUser({ password: p1 })

  btn.disabled = false
  btn.textContent = '保存する'

  if (error) { err.textContent = 'エラーが発生しました。もう一度お試しください。'; return }

  document.getElementById('resetScreen').style.display = 'none'
  history.replaceState(null, '', window.location.pathname)
  await iniciarDashboard()
}

async function fazerLogout() {
  await sb.auth.signOut()
  currentProfile = null
  document.getElementById('loginScreen').style.display = 'flex'
  document.getElementById('userNome').textContent = ''
}

async function iniciarDashboard() {
  const { data: { user } } = await sb.auth.getUser()
  if (!user) return

  const { data: profile } = await sb.from('profiles').select('*').eq('id', user.id).single()
  currentProfile = profile

  document.getElementById('loginScreen').style.display = 'none'
  document.getElementById('userNome').textContent = profile?.nome || user.email

  if (profile?.role === 'admin') {
    document.getElementById('btnShokaiTab').style.display = ''
  }
  if (profile?.role === 'admin' || profile?.shokai_nome) document.getElementById('btnLeadsTab').style.display = ''
  document.getElementById('btnPoolTab').style.display = ''
  if (profile?.shokai_nome) document.getElementById('btnVagasLinkTab').style.display = ''
  if (profile?.role === 'jimusho' && profile?.jimusho) {
    document.getElementById('btnJimushoMatome').style.display = ''
    document.getElementById('jimushoMatomeLabel').textContent = profile.jimusho + 'まとめ'
  }
  if (profile?.role === 'jimusho' || profile?.role === 'admin') {
    document.getElementById('btnOrderStatusTab').style.display = ''
  }

  // Período padrão: 3 meses atrás → hoje (登録日)
  const iso = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const hoje = new Date()
  const tresMeses = new Date(hoje)
  tresMeses.setMonth(tresMeses.getMonth() - 3)
  document.getElementById('filterDtIni').value = iso(tresMeses)
  document.getElementById('filterDtFim').value = iso(hoje)

  showTab('pipeline')
  await carregarDados()
  iniciarAutoAtualizacao()
}

// ─── Atualização automática dos dados (a cada 10 min) ────────
let autoAtualizacaoId = null
function iniciarAutoAtualizacao() {
  if (autoAtualizacaoId) clearInterval(autoAtualizacaoId)
  autoAtualizacaoId = setInterval(() => {
    if (document.getElementById('modal').style.display === 'flex') return // não atualiza com o modal aberto, pra não perder edição em andamento
    carregarDados()
  }, 10 * 60 * 1000)
}

// Verifica sessão ao carregar
// (se for um link de recuperação de senha, o evento PASSWORD_RECOVERY abaixo cuida da tela — não abre o dashboard direto)
sb.auth.getSession().then(({ data: { session } }) => {
  const isRecovery = window.location.hash.includes('type=recovery')
  if (session && !isRecovery) {
    iniciarDashboard()
  } else if (!session) {
    document.getElementById('loginScreen').style.display = 'flex'
  }
})

// Escuta mudanças de auth
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    document.getElementById('loginScreen').style.display = 'flex'
  }
  if (event === 'PASSWORD_RECOVERY') {
    document.getElementById('loginScreen').style.display = 'none'
    document.getElementById('resetScreen').style.display = 'flex'
  }
})