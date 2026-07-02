const { createClient } = supabase
const sb = createClient('https://xzxfwrbebkwagnropgfb.supabase.co','sb_publishable_rPu8_l2pdy3XtOTAus6Mxw_rp2HO_XE')

let todosOsCandidatos = []
let todasFabricas = []
let fabricaAtiva = null
let shokaiAtivo = null
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
let calYear = new Date().getFullYear()
let calMonth = new Date().getMonth()

const STAGES = [
  { key:'renrakumae', label:'連絡前',  cls:'stage-renrakumae' },
  { key:'taiochu',   label:'対応中',  cls:'stage-taiochu'    },
  { key:'mensetsu',  label:'面接',    cls:'stage-mensetsu'   },
  { key:'kengaku',   label:'見学・ヒアリング済み',    cls:'stage-kengaku'    },
  { key:'naitei',    label:'内定',    cls:'stage-naitei'     },
  { key:'nyusha',    label:'入社',    cls:'stage-nyusha'     },
  { key:'zaiseki',   label:'在籍',    cls:'stage-zaiseki'    },
  { key:'stock',     label:'工場ストック', cls:'stage-stock'     },
  { key:'ng',        label:'NG',      cls:'stage-ng'         },
  { key:'black',     label:'ブラック', cls:'stage-black'     },
]

function hojeISO() {
  const n = new Date()
  return `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-${String(n.getDate()).padStart(2,'0')}`
}

function getStage(c) {
  if (c.is_blacklisted) return 'black'
  if (c.dt_ng)          return 'ng'
  if (c.dt_stock)       return 'stock'
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
  if (c.dt_mensetsu)    return 'mensetsu'
  if (c.dt_taiochu)     return 'taiochu'
  return 'renrakumae'
}

function diasNaEtapa(c) {
  const stage = getStage(c)
  const dateMap = { renrakumae: c.created_at, taiochu: c.dt_taiochu, mensetsu: c.dt_mensetsu, kengaku: c.dt_kengaku, naitei: c.dt_naitei, nyusha: c.dt_nyusha, zaiseki: c.dt_nyusha, stock: c.dt_stock, ng: c.dt_ng, black: c.created_at }
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
  let locQuery = sb.from('locations').select('nome').eq('tipo', '工場').order('nome')
  if (currentProfile?.role !== 'admin') locQuery = locQuery.eq('ativo', true)
  const [res1, res2] = await Promise.all([
    sb.from('candidates').select('*').eq('is_deleted', false).order('created_at', { ascending: false }),
    locQuery
  ])
  todosOsCandidatos = res1.data || []
  todasFabricas     = (res2.data || []).map(f => f.nome)
  recalcularDuplicados()
  carregarSidebar()
  carregarCalFabricaFilter()
  carregarChartFabricaFilter()
  renderAlerts()
  renderPipeline()
  renderCalendar()
}

// 工場２が設定されている場合はそちらを優先
function fabricaEfetiva(c) { return c.fabrica2 || c.fabrica }

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
}

function carregarCalFabricaFilter() {
  const sel = document.getElementById('calFabricaFilter')
  sel.innerHTML = '<option value="">全工場</option>'
  todasFabricas.forEach(f => { const o = document.createElement('option'); o.value = f; o.textContent = f; sel.appendChild(o) })
}

function filtrarFabrica(fabrica, el) {
  fabricaAtiva = fabrica
  shokaiAtivo = null
  // se estava em Leads do Site / 全体ストック, volta para o painel 状況
  if (document.getElementById('leadsView').style.display === 'flex' || document.getElementById('stockPoolView').style.display === 'flex') {
    document.getElementById('leadsView').style.display     = 'none'
    document.getElementById('stockPoolView').style.display = 'none'
    document.getElementById('pipeline').style.display      = 'block'
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelector('.tab-btn').classList.add('active')
  }
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
  if (el) el.classList.add('active')
  // sincroniza filtros do calendário e gráficos
  const calSel = document.getElementById('calFabricaFilter')
  const chSel  = document.getElementById('chartFabrica')
  if (calSel) calSel.value = fabrica || ''
  if (chSel)  chSel.value  = fabrica || ''
  renderPipeline()
  renderCalendar()
  renderCharts()
}

function filtrarMeuShokai(el) {
  if (!currentProfile?.shokai_nome) {
    alert('プロフィールに紹介者名（shokai_nome）が設定されていません。管理者に確認してください。')
    return
  }
  fabricaAtiva = null
  shokaiAtivo = currentProfile.shokai_nome
  // se estava em Leads do Site / 全体ストック, volta para o painel 状況
  if (document.getElementById('leadsView').style.display === 'flex' || document.getElementById('stockPoolView').style.display === 'flex') {
    document.getElementById('leadsView').style.display     = 'none'
    document.getElementById('stockPoolView').style.display = 'none'
    document.getElementById('pipeline').style.display      = 'block'
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
    document.querySelector('.tab-btn').classList.add('active')
  }
  document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'))
  if (el) el.classList.add('active')
  // limpa filtros de fábrica do calendário e gráficos
  const calSel = document.getElementById('calFabricaFilter')
  const chSel  = document.getElementById('chartFabrica')
  if (calSel) calSel.value = ''
  if (chSel)  chSel.value  = ''
  renderPipeline()
  renderCalendar()
  renderCharts()
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
  const fab = fabricaAtiva ? `【${fabricaAtiva}】` : '【全体】'
  const candidatos = getFiltrados()
  const stagesVisiveis = getStagesVisiveis()

  const linhas = STAGES
    .filter(s => stagesVisiveis.includes(s.key))
    .map(stage => {
      const list = candidatos.filter(c => getStage(c) === stage.key)
      if (!list.length) return ''
      return `<tr class="stage-row"><td colspan="7">${stage.label}（${list.length}名）</td></tr>` +
        list.map((c, i) => `<tr class="${i%2===0?'even':''}">
          <td>${c.shimei||'—'}</td>
          <td>${c.telefone||'—'}</td>
          <td>${c.fabrica||'—'}</td>
          <td>${c.shokai||'—'}</td>
          <td>${c.nivel_japones?.split('〜')[0]||'—'}</td>
          <td>${c.prefecture||'—'}</td>
          <td>${c.city||'—'}</td>
        </tr>`).join('')
    }).join('')

  const w = window.open('', '_blank')
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
      <thead><tr><th>氏名</th><th>電話番号</th><th>工場</th><th>紹介者</th><th>日本語</th><th>都道府県</th><th>市区町村</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></body></html>`)
  w.document.close()
}

function imprimirPDFLeads() {
  const fabFilter = document.getElementById('leadsFilter')?.value || ''
  const fab = fabFilter ? `【${fabFilter}】` : '【全体】'
  const search = document.getElementById('searchInput')?.value.toLowerCase() || ''
  const f = activeFilters
  const leads = todosOsCandidatos.filter(c => {
    if (c.origem !== 'web' && c.origem !== 'web_indicado' && c.origem !== 'web_stock') return false
    if (fabFilter && c.fabrica !== fabFilter) return false
    if (search && !c.shimei?.toLowerCase().includes(search) && !c.telefone?.includes(search)) return false
    if (f.jp?.length    && !f.jp.includes(c.nivel_japones))     return false
    if (f.emp?.length   && !f.emp.includes(c.esta_empregado))    return false
    if (f.nac?.length   && !f.nac.includes(c.nacionalidade))     return false
    if (f.pref?.length  && !f.pref.includes(c.prefecture))       return false
    if (f.turno?.length  && !(c.turnos_possiveis||[]).some(t => f.turno.includes(t)))   return false
    if (f.menkyo?.length && !(c.habilitacao||[]).some(m => f.menkyo.includes(m)))       return false
    if (f.exp?.length    && !(c.experiencia||[]).some(e => f.exp.includes(e)))          return false
    if (f.apt            && String(c.precisa_apartamento) !== f.apt)                    return false
    if (f.sexo           && c.sexo !== f.sexo)                                          return false
    if (f.move           && String(c.pode_mudar) !== f.move)                            return false
    if (f.ageMax         && (c.idade > f.ageMax))                                       return false
    return true
  })

  const linhas = LEAD_STAGES.map(stage => {
    const list = leads.filter(c => getLeadsStage(c) === stage.key)
    if (!list.length) return ''
    return `<tr class="stage-row"><td colspan="7">${stage.label}（${list.length}名）</td></tr>` +
      list.map((c, i) => `<tr class="${i%2===0?'even':''}">
        <td>${c.shimei||'—'}</td>
        <td>${c.telefone||'—'}</td>
        <td>${c.fabrica||'—'}</td>
        <td>${c.prefecture||'—'}</td>
        <td>${c.city||'—'}</td>
        <td>${c.nivel_japones?.split('〜')[0]||'—'}</td>
        <td>${c.precisa_apartamento ? '必要' : '不要'}</td>
      </tr>`).join('')
  }).join('')

  const w = window.open('', '_blank')
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
      <thead><tr><th>氏名</th><th>電話番号</th><th>工場</th><th>都道府県</th><th>市区町村</th><th>日本語</th><th>アパート</th></tr></thead>
      <tbody>${linhas}</tbody>
    </table></body></html>`)
  w.document.close()
}

function getFiltrados() {
  const search = document.getElementById('searchInput').value.toLowerCase()
  const sexo   = document.getElementById('filterSexo').value
  const jp     = document.getElementById('filterJP').value
  const idade  = parseInt(document.getElementById('filterIdade').value) || null
  const f = activeFilters

  return todosOsCandidatos.filter(c => {
    if (c.origem === 'web' || c.origem === 'web_stock') return false
    if (c.dt_stock_geral && !c.dt_ng) return false
    if (fabricaAtiva && fabricaEfetiva(c) !== fabricaAtiva) return false
    if (shokaiAtivo && c.shokai !== shokaiAtivo) return false
    if (sexo   && c.sexo !== sexo)                                            return false
    if (jp     && c.nivel_japones !== jp)                                     return false
    if (idade  && c.idade > idade)                                            return false
    if (search && !c.shimei?.toLowerCase().includes(search) && !c.telefone?.includes(search)) return false
    // filtros do painel
    if (f.jp?.length    && !f.jp.includes(c.nivel_japones))     return false
    if (f.stage?.length && !f.stage.includes(getStage(c)))       return false
    if (f.emp?.length   && !f.emp.includes(c.esta_empregado))    return false
    if (f.nac?.length   && !f.nac.includes(c.nacionalidade))     return false
    if (f.pref?.length  && !f.pref.includes(c.prefecture))       return false
    if (f.turno?.length  && !(c.turnos_possiveis||[]).some(t => f.turno.includes(t)))   return false
    if (f.menkyo?.length && !(c.habilitacao||[]).some(m => f.menkyo.includes(m)))       return false
    if (f.exp?.length    && !(c.experiencia||[]).some(e => f.exp.includes(e)))          return false
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

const _expandedStages = new Set()

function renderPipeline() {
  const candidatos = getFiltrados()
  const grouped = {}
  STAGES.forEach(s => grouped[s.key] = [])
  candidatos.forEach(c => grouped[getStage(c)].push(c))

  document.getElementById('s-total').textContent    = candidatos.length
  document.getElementById('s-renraku').textContent  = grouped.renrakumae.length
  document.getElementById('s-taiochu').textContent  = grouped.taiochu.length
  document.getElementById('s-mensetsu').textContent = grouped.mensetsu.length
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
    const showNyushaCol  = stage.key === 'nyusha' || stage.key === 'naitei'
    const showKengakuCol = stage.key === 'kengaku'
    const showZaisekiCol = stage.key === 'zaiseki'
    const showActions4   = stage.key === 'renrakumae'
    const showActions3   = stage.key === 'taiochu' || stage.key === 'mensetsu'
    if (showNyushaCol || showZaisekiCol) list.sort((a, b) => (a.dt_nyusha || '').localeCompare(b.dt_nyusha || ''))
    if (showKengakuCol) list.sort((a, b) => (b.dt_kengaku || '').localeCompare(a.dt_kengaku || ''))
    const expanded = _expandedStages.has(stage.key)
    const show = expanded ? list : list.slice(0, 5)
    const hasMore = list.length > 5 && !expanded
    let colClass = ''
    if (showNyushaCol)       colClass = ' col-nyusha'
    else if (showKengakuCol) colClass = ' col-kengaku'
    else if (showZaisekiCol) colClass = ' col-zaiseki'
    else if (showActions4)   colClass = ' col-actions4'
    else if (showActions3)   colClass = ' col-actions3'

    let extraHeader = ''
    if (showNyushaCol)       extraHeader = '<span>入社日</span>'
    else if (showKengakuCol) extraHeader = '<span>見学日</span><span>入社日</span><span>アクション</span>'
    else if (showZaisekiCol) extraHeader = '<span>入社日</span><span></span>'
    else if (showActions4 || showActions3) extraHeader = '<span>アクション</span>'

    const rowsHtml = list.length === 0
      ? `<div class="stage-empty">候補者なし</div>`
      : `<div class="col-header${colClass}"><span>氏名</span><span>紹介者</span><span>電話番号</span><span>工場</span><span>市区町村</span><span>国籍</span><span>性別</span><span>日本語</span><span>経過</span>${extraHeader}</div>` +
        show.map(c => {
          const d = diasNaEtapa(c)
          let extraCols = ''
          if (showNyushaCol)
            extraCols = `<span style="font-size:11px">${fmtDataPT(c.dt_nyusha) || '—'}</span>`
          else if (showKengakuCol)
            extraCols = `<span style="font-size:11px">${fmtDataPT(c.dt_kengaku) || '—'}</span><span style="font-size:11px">${fmtDataPT(c.dt_nyusha) || '—'}</span><span onclick="event.stopPropagation()" style="display:flex;gap:4px;align-items:center"><button class="btn-lead red" onclick="kengakuNG(event,'${c.id}')">NG</button><button class="btn-lead green" onclick="kengakuNaitei(event,'${c.id}')">内定</button></span>`
          else if (showZaisekiCol)
            extraCols = `<span style="font-size:11px">${fmtDataPT(c.dt_nyusha) || '—'}</span><span onclick="event.stopPropagation()"><button class="btn-lead blue" onclick="taisha(event,'${c.id}')">退社</button></span>`
          else if (showActions4)
            extraCols = `<span onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-lead amber" onclick="avancarEtapa(event,'${c.id}','dt_taiochu')">対応中</button><button class="btn-lead green" onclick="avancarEtapa(event,'${c.id}','dt_mensetsu')">面接</button><button class="btn-lead orange" onclick="avancarEtapa(event,'${c.id}','dt_ng','NGにしますか？')">NG</button><button class="btn-lead blue" onclick="avancarEtapa(event,'${c.id}','dt_stock')">ストック</button></span>`
          else if (showActions3) {
            const proxField = stage.key === 'taiochu' ? 'dt_mensetsu' : 'dt_kengaku'
            const proxLabel = stage.key === 'taiochu' ? '面接' : '見学'
            extraCols = `<span onclick="event.stopPropagation()" style="display:flex;gap:4px;flex-wrap:wrap"><button class="btn-lead green" onclick="avancarEtapa(event,'${c.id}','${proxField}')">${proxLabel}</button><button class="btn-lead orange" onclick="avancarEtapa(event,'${c.id}','dt_ng','NGにしますか？')">NG</button><button class="btn-lead blue" onclick="avancarEtapa(event,'${c.id}','dt_stock')">ストック</button></span>`
          }
          return `<div class="candidate-row${colClass}" onclick="abrirModal('${c.id}')">
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
          </div>`
        }).join('') +
        (hasMore ? `<div style="padding:7px 16px;font-size:12px;color:#1e88e5;cursor:pointer" onclick="expandStage('${stage.key}')">+ さらに ${list.length - 5} 件</div>` : '')

    return `<div class="stage-section ${stage.cls}">
      <div class="stage-header" onclick="toggleStage('${stage.key}')">
        ${stage.label} <span class="stage-count">${list.length}</span>
      </div>
      <div class="stage-body" id="body-${stage.key}">${rowsHtml}</div>
    </div>`
  }).join('')
}

function toggleStage(key) { const b = document.getElementById('body-'+key); b.style.display = b.style.display === 'none' ? '' : 'none' }
function expandStage(key)  { _expandedStages.add(key); renderPipeline() }

// ─── CALENDAR ─────────────────────────────────────────────────
function calPrev()  { calMonth--; if (calMonth < 0)  { calMonth = 11; calYear-- } renderCalendar() }
function calNext()  { calMonth++; if (calMonth > 11) { calMonth = 0;  calYear++ } renderCalendar() }
function calToday() { calYear = new Date().getFullYear(); calMonth = new Date().getMonth(); renderCalendar() }

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
  const firstDay  = new Date(calYear, calMonth, 1)
  const lastDay   = new Date(calYear, calMonth + 1, 0)
  const months    = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月']
  const dows      = ['日','月','火','水','木','金','土']
  document.getElementById('calTitle').textContent = calYear + '年 ' + months[calMonth]

  const events = {}
  const add = (dateStr, tipo, nome, fabrica, candidatoId) => {
    if (!dateStr || !calTypesAtivos.has(tipo)) return
    const d = dateStr.split('T')[0]
    const [y, m] = d.split('-').map(Number)
    if (y !== calYear || m - 1 !== calMonth) return
    if (!events[d]) events[d] = []
    events[d].push({ tipo, nome, fabrica, candidatoId })
  }

  todosOsCandidatos
    .filter(c => !fabFilter || fabricaEfetiva(c) === fabFilter)
    .forEach(c => {
      add(c.dt_mensetsu, 'mensetsu', c.shimei, c.fabrica, c.id)
      add(c.dt_kengaku,  'kengaku',  c.shimei, c.fabrica, c.id)
      add(c.dt_nyusha,   'nyusha',   c.shimei, c.fabrica, c.id)
      if (c.alerta_data) add(c.alerta_data, 'alerta', c.shimei, c.fabrica, c.id)
    })

  const tipoLabel = { mensetsu:'面接', kengaku:'見学・ヒアリング済み', nyusha:'入社', alerta:'アラート' }

  // ── GRID (desktop) ──────────────────────────────────────
  const grid = document.getElementById('calGrid')
  let html = dows.map(d => `<div class="cal-day-header">${d}</div>`).join('')
  let startDow = firstDay.getDay()
  for (let i = 0; i < startDow; i++) {
    const d = new Date(calYear, calMonth, -startDow + i + 1)
    html += `<div class="cal-day other-month"><div class="cal-day-num">${d.getDate()}</div></div>`
  }
  for (let d = 1; d <= lastDay.getDate(); d++) {
    const date    = new Date(calYear, calMonth, d)
    const dow     = date.getDay()
    const dateStr = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const isToday = dateStr === todayStr
    const cls = ['cal-day', isToday?'today':'', dow===0?'sunday':'', dow===6?'saturday':''].filter(Boolean).join(' ')
    const evs = (events[dateStr]||[]).map(e => `<div class="cal-event ${e.tipo}" onclick="abrirModal('${e.candidatoId}')" title="${e.nome}">${tipoLabel[e.tipo]}：${e.nome||''}</div>`).join('')
    html += `<div class="${cls}"><div class="cal-day-num">${d}</div>${evs}</div>`
  }
  const rem = 7 - ((startDow + lastDay.getDate()) % 7)
  if (rem < 7) for (let d = 1; d <= rem; d++) html += `<div class="cal-day other-month"><div class="cal-day-num">${d}</div></div>`
  grid.innerHTML = html

  // ── AGENDA (mobile) ──────────────────────────────────────
  const sortedDates = Object.keys(events).sort()
  if (!sortedDates.length) {
    document.getElementById('agendaList').innerHTML =
      `<div class="agenda-empty">📅 ${calYear}年${months[calMonth]}のイベントはありません</div>`
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
        <span class="agenda-chip ${e.tipo}">${tipoLabel[e.tipo]}</span>
        <span class="agenda-nome">${e.nome||'—'}</span>
        <span class="agenda-fab">${e.fabrica||''}</span>
      </div>`).join('')
    return `
      <div class="agenda-day">
        <div class="agenda-day-header">
          <span class="agenda-dow" style="${dowColor}">${dow}</span>
          <span class="agenda-date" style="${dowColor}">${calYear}年${months[calMonth]}${day}日</span>
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
function trPT(map, val)    { return (val && map[val]) || val || '—' }
function trArrPT(map, arr) { return arr?.length ? arr.map(v => map[v] || v).join(', ') : '—' }

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

  const chk = (arr, val) => (arr || []).includes(val) ? 'checked' : ''
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
        <div class="modal-field"><label>応募日</label><input type="text" value="${c.created_at ? fmtDataPT(c.created_at.slice(0,10)) : '—'}" disabled style="background:#f5f5f5;color:#666"></div>
        <div class="modal-field"><label>対応中</label><div class="date-with-btn"><input type="date" id="f_taio" value="${c.dt_taiochu||''}"><button class="btn-hoje" onclick="hoje('f_taio')">今日</button></div></div>
        <div class="modal-field"><label>面接日</label><div class="date-with-btn"><input type="date" id="f_mens" value="${c.dt_mensetsu||''}"><button class="btn-hoje" onclick="hoje('f_mens')">今日</button></div></div>
        <div class="modal-field"><label>面接時間</label><input type="time" id="f_menshora" value="${c.mensetsu_hora||''}"></div>
        <div class="modal-field"><label>見学・ヒアリング日</label><div class="date-with-btn"><input type="date" id="f_keng" value="${c.dt_kengaku||''}"><button class="btn-hoje" onclick="hoje('f_keng')">今日</button></div></div>
        <div class="modal-field"><label>内定日</label><div class="date-with-btn"><input type="date" id="f_nait" value="${c.dt_naitei||''}"><button class="btn-hoje" onclick="hoje('f_nait')">今日</button></div></div>
        <div class="modal-field"><label>入社日</label><div class="date-with-btn"><input type="date" id="f_nyu" value="${c.dt_nyusha||''}"><button class="btn-hoje" onclick="hoje('f_nyu')">今日</button></div></div>
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
  document.getElementById('modal').style.display = 'flex'
}

async function salvarCandidato() {
  if (!candidatoAtivo) return
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
    dt_kengaku:           fab2Mudou ? null : (g('f_keng').value    || null),
    dt_naitei:            fab2Mudou ? null : (g('f_nait').value    || null),
    dt_nyusha:            fab2Mudou ? null : (g('f_nyu').value     || null),
    dt_stock:             fab2Mudou ? null : (g('f_stock').value   || null),
    dt_stock_geral:       fab2Mudou ? null : (g('f_stockgeral').value || g('f_ng').value || null),
    dt_ng:                fab2Mudou ? null : (g('f_ng').value      || null),
    alerta_data:          g('f_alert').value   || null,
    alerta_nota:          g('f_alertnota').value || null,
    comentario:           g('f_com').value     || null,
    tantousha_comentario: g('f_tancom').value  || null,
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
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
  if (tab === 'leads' || tab === 'stockpool' || tab === 'shokai') {
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
}

// ─── SHOKAI ANALYSIS (admin) ─────────────────────────────────
function renderShokaiAnalise() {
  const periodo = document.getElementById('shokaiPeriodo').value
  let corte = null
  if (periodo === 'mes') {
    const h = new Date()
    corte = new Date(h.getFullYear(), h.getMonth(), 1)
  } else if (periodo) {
    corte = new Date()
    corte.setMonth(corte.getMonth() - parseInt(periodo))
  }

  const dados = todosOsCandidatos.filter(c => {
    if (!c.shokai) return false
    if (corte && new Date(c.created_at) < corte) return false
    return true
  })

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
  const fab = document.getElementById('chartFabrica').value
  const candidatosValidos = todosOsCandidatos.filter(c => c.origem !== 'web' && c.origem !== 'web_stock')
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
  const stageLabels = ['連絡前','対応中','面接','見学・ヒアリング済み','内定','入社','在籍','工場ストック','NG','ブラック']
  const stageKeys   = ['renrakumae','taiochu','mensetsu','kengaku','naitei','nyusha','zaiseki','stock','ng','black']
  const stageCounts = stageKeys.map(k => dados.filter(c => getStage(c) === k).length)
  const stageColors = ['#1e88e5','#f57c00','#00897b','#5e35b1','#2e7d32','#7b1fa2','#00695c','#e91e8c','#c62828','#212121']

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

  // Ranking 紹介者
  const shMap = {}
  dados.forEach(c => { if (c.shokai) shMap[c.shokai] = (shMap[c.shokai] || 0) + 1 })
  const shLabels = Object.keys(shMap).sort((a,b) => shMap[b] - shMap[a])
  destroyChart('chartShokai')
  chartInstances['chartShokai'] = new Chart(document.getElementById('chartShokai'), {
    type: 'bar',
    data: { labels: shLabels, datasets: [{ data: shLabels.map(s => shMap[s]), backgroundColor: '#e8621a', borderRadius: 4 }] },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, ticks: { precision: 0 } } } }
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
  if (window.innerWidth <= 768) {
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

function renderLeads() {
  const sel = document.getElementById('leadsFilter')
  const fabFilter = sel?.value || ''

  // Popula dropdown de fábricas
  const allLeads = todosOsCandidatos.filter(c => c.origem === 'web' || c.origem === 'web_indicado' || c.origem === 'web_stock')
  const fabs = [...new Set(allLeads.map(c => c.fabrica).filter(Boolean))].sort()
  const cur  = sel?.value || ''
  if (sel) sel.innerHTML = '<option value="">Todas as fábricas</option>' + fabs.map(f => `<option value="${f}" ${f===cur?'selected':''}>${f}</option>`).join('')

  const search = document.getElementById('searchInput')?.value.toLowerCase() || ''
  const f = activeFilters
  const leads = allLeads.filter(c => {
    if (fabFilter && c.fabrica !== fabFilter) return false
    if (search && !c.shimei?.toLowerCase().includes(search) && !c.telefone?.includes(search)) return false
    if (f.jp?.length    && !f.jp.includes(c.nivel_japones))     return false
    if (f.emp?.length   && !f.emp.includes(c.esta_empregado))    return false
    if (f.nac?.length   && !f.nac.includes(c.nacionalidade))     return false
    if (f.pref?.length  && !f.pref.includes(c.prefecture))       return false
    if (f.turno?.length  && !(c.turnos_possiveis||[]).some(t => f.turno.includes(t)))   return false
    if (f.menkyo?.length && !(c.habilitacao||[]).some(m => f.menkyo.includes(m)))       return false
    if (f.exp?.length    && !(c.experiencia||[]).some(e => f.exp.includes(e)))          return false
    if (f.apt            && String(c.precisa_apartamento) !== f.apt)                    return false
    if (f.sexo           && c.sexo !== f.sexo)                                          return false
    if (f.move           && String(c.pode_mudar) !== f.move)                            return false
    if (f.ageMax         && (c.idade > f.ageMax))                                       return false
    return true
  })

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

    let rows = ''
    if (list.length === 0) {
      rows = '<div style="padding:10px 16px;color:#aaa;font-size:12px;font-style:italic">候補者なし</div>'
    } else {
      rows = colHeader + show.map(c => {
        let actions = ''
        if (stage.key === 'renrakumae') {
          actions = `<div class="lead-actions">
            <button class="btn-lead amber"  onclick="moverParaTaiochu('${c.id}')">対応中</button>
            <button class="btn-lead green"  onclick="enviarParaFabrica('${c.id}')">担当者紹介</button>
            <button class="btn-lead blue"   onclick="moverParaStock('${c.id}')">ストック</button>
            <button class="btn-lead orange" onclick="moverNG('${c.id}')">NG</button>
            <button class="btn-lead red"    onclick="bloquearLead('${c.id}')">Bloquear</button>
          </div>`
        } else if (stage.key === 'taiochu') {
          actions = `<div class="lead-actions">
            <button class="btn-lead green"  onclick="enviarParaFabrica('${c.id}')">担当者紹介</button>
            <button class="btn-lead blue"   onclick="moverParaStock('${c.id}')">ストック</button>
            <button class="btn-lead orange" onclick="moverNG('${c.id}')">NG</button>
            <button class="btn-lead red"    onclick="bloquearLead('${c.id}')">Bloquear</button>
          </div>`
        } else if (stage.key === 'stock') {
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
  const updates = {
    origem:        'web_indicado',
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
    document.getElementById('btnLeadsTab').style.display = ''
    document.getElementById('btnShokaiTab').style.display = ''
  }
  document.getElementById('btnPoolTab').style.display = ''

  showTab('pipeline')
  await carregarDados()
}

// Verifica sessão ao carregar
sb.auth.getSession().then(({ data: { session } }) => {
  if (session) {
    iniciarDashboard()
  } else {
    document.getElementById('loginScreen').style.display = 'flex'
  }
})

// Escuta mudanças de auth
sb.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    document.getElementById('loginScreen').style.display = 'flex'
  }
})