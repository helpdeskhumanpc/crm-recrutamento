const express = require('express')
const path    = require('path')

const app = express()

app.use(express.json())
app.use(express.static(path.join(__dirname)))

// CORS para o site WordPress
app.use((req, res, next) => {
  const allowed = ['https://jobs-human.com', 'https://www.jobs-human.com']
  const origin  = req.headers.origin
  if (allowed.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'))
})

// ─── Telegram ─────────────────────────────────────────────────
const VISA = {
  '永住者': 'Permanent Resident', '日本人の配偶者': 'Spouse of Japanese',
  '永住者の配偶者または子': 'Spouse/Child of Permanent Resident',
  '定住者（1・3・5年）': 'Long-term Resident', '家族滞在': 'Dependent',
  '留学': 'Student', '日本国籍': 'Japanese Citizen', '特定活動': 'Designated Activities',
}
const KANA = { '読み書きできる': 'Reading and Writing', '読めるのみ': 'Reading only', 'できない': 'Cannot' }
const SEXO = { '男性': 'Man', '女性': 'Woman', 'その他': 'Other' }
const EMPREGO = {
  '在職中': 'Yes', '離職中': 'No', 'アルバイト中': 'Part-time',
  '退職予定（予告期間中）': 'Giving notice', '無職': 'Unemployed',
}
const HABILITACAO = {
  '所持なし': 'None', '普通自動車': 'Car', 'バイク': 'Motorcycle',
  'フォークリフト': 'Forklift', '玉掛け': 'Tamakake', 'クレーン': 'Crane', '溶接': 'Welding',
}
const EXPERIENCIA = {
  '経験なし': 'None', '組み立て（くみたて）': 'Assembly (Kumitate)', '自動車部品': 'Auto Parts',
  '食品': 'Food', '電子部品': 'Electronics', 'フォークリフト': 'Forklift', '玉掛け': 'Tamakake',
  '検査': 'Inspection (Kensa)', '梱包': 'Packaging (Konpo)', 'プレス': 'Press',
  '溶接': 'Welding (Yosetsu)', '塗装': 'Painting (Toso)', '建設': 'Construction (Kensetsu)',
  '物流': 'Logistics (Butsuryu)', 'コンビニ': 'Konbini', 'スーパー': 'Supermarket', 'ホテル': 'Hotel',
}

function tr(map, val)     { return (val && map[val]) || val || '—' }
function trArr(map, arr)  { return arr?.length ? arr.map(v => map[v] || v).join(', ') : '—' }
function fmtDate(iso) {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}

function buildTelegramMsg(c) {
  const rows = [
    'お疲れ様です。',
    `${c.fabrica || 'ヒューマン'}向け`,
    '',
    `紹介：${c.shokai || '—'}`,
    `氏名：${c.shimei || '—'}`,
    `電話番号：${c.telefone || '—'}`,
    c.postal_code            ? `〒：${c.postal_code}` : null,
    (c.prefecture || c.city) ? `住所：${[c.prefecture, c.city].filter(Boolean).join(' / ')}` : null,
    c.data_nascimento        ? `生年月日：${fmtDate(c.data_nascimento)}` : null,
    c.idade                  ? `年齢：${c.idade}` : null,
    `性別：${tr(SEXO, c.sexo)}`,
    `国籍：${c.nacionalidade || '—'}`,
    `ビザ：${tr(VISA, c.visa)}`,
    `日本語力：${c.nivel_japones || '—'}`,
    c.hiragana ? `ひらがな：${tr(KANA, c.hiragana)}` : null,
    c.katakana ? `カタカナ：${tr(KANA, c.katakana)}` : null,
    `免許：${trArr(HABILITACAO, c.habilitacao)}`,
    `経験：${trArr(EXPERIENCIA, c.experiencia)}`,
    `アパート必要：${c.precisa_apartamento ? 'Yes' : 'No'}`,
    `現在仕事中：${tr(EMPREGO, c.esta_empregado)}`,
    '',
    'よろしくお願いします。',
  ]
  return rows.filter(r => r !== null).join('\n')
}

async function sendTelegram(text) {
  const token  = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ chat_id: chatId, text }),
  })
}

// ─── Supabase app_settings (persistência entre deploys) ──────
const SUPABASE_URL         = 'https://xzxfwrbebkwagnropgfb.supabase.co'
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY

async function loadSettings() {
  if (!SUPABASE_SERVICE_KEY) return {}
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?select=key,value`, {
      headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_KEY}` },
    })
    const rows = await res.json()
    if (!Array.isArray(rows)) { console.warn('app_settings load:', JSON.stringify(rows)); return {} }
    return Object.fromEntries(rows.map(r => [r.key, r.value]))
  } catch (err) {
    console.warn('app_settings load:', err.message)
    return {}
  }
}

async function saveSetting(key, value) {
  if (!SUPABASE_SERVICE_KEY) return
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/app_settings`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify([{ key, value, updated_at: new Date().toISOString() }]),
    })
  } catch (err) {
    console.warn('app_settings save:', err.message)
  }
}

// ─── Google Contacts ──────────────────────────────────────────
const REDIRECT_URI      = 'https://crm-recrutamento-production.up.railway.app/oauth/callback'
let currentRefreshToken = process.env.GOOGLE_REFRESH_TOKEN
let reminderTimeout     = null

function scheduleReminder(renewedAt) {
  if (reminderTimeout) clearTimeout(reminderTimeout)
  const SIX_DAYS = 6 * 24 * 60 * 60 * 1000
  const delay    = Math.max(SIX_DAYS - (Date.now() - renewedAt), 0)
  reminderTimeout = setTimeout(() => {
    const link = 'https://crm-recrutamento-production.up.railway.app/reauth'
    sendTelegram(`⚠️ Token Google Contacts vence AMANHÃ!\n\nRenove agora acessando:\n${link}`).catch(console.warn)
  }, delay)
}

// Ao iniciar, recupera token renovado e lembrete do Supabase (sobrevive a redeploy)
loadSettings().then(settings => {
  if (settings.google_refresh_token) {
    currentRefreshToken = settings.google_refresh_token
    console.log('Refresh token carregado do Supabase (app_settings)')
  }
  const renewedAt = parseInt(settings.token_renewed_at)
  if (!isNaN(renewedAt)) scheduleReminder(renewedAt)
})

app.get('/reauth', (req, res) => {
  const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         'https://www.googleapis.com/auth/contacts',
    access_type:   'offline',
    prompt:        'consent',
  })
  res.redirect(url)
})

app.get('/oauth/callback', async (req, res) => {
  const { code, error } = req.query
  if (error || !code) return res.send(`❌ Erro: ${error || 'sem código'}`)
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri:  REDIRECT_URI,
        code,
        grant_type:    'authorization_code',
      }),
    })
    const data = await tokenRes.json()
    if (data.refresh_token) {
      currentRefreshToken = data.refresh_token
      const now      = Date.now()
      const vence    = new Date(now + 7 * 24 * 60 * 60 * 1000)
      const venceStr = `${vence.getFullYear()}/${String(vence.getMonth()+1).padStart(2,'0')}/${String(vence.getDate()).padStart(2,'0')}`
      saveSetting('google_refresh_token', data.refresh_token)
      saveSetting('token_renewed_at', now.toString())
      scheduleReminder(now)
      sendTelegram(`✅ Google Contacts reautorizado!\n\n📅 Lembrete agendado para ${venceStr} (1 dia antes de vencer)`).catch(console.warn)
      res.send(`✅ Google Contacts reautorizado! Token válido até ${venceStr}. Lembrete agendado no Telegram.`)
    } else {
      res.send('⚠️ Token não retornou refresh_token. Tente /reauth novamente.')
    }
  } catch (err) {
    res.send('❌ Erro ao trocar token: ' + err.message)
  }
})

async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: currentRefreshToken,
      grant_type:    'refresh_token',
    }),
  })
  const data = await res.json()
  return data.access_token
}

app.post('/api/google-contact', async (req, res) => {
  try {
    const c = req.body

    const notas = [
      c.sexo            && `Gênero: ${c.sexo}`,
      c.nacionalidade   && `Nacionalidade: ${c.nacionalidade}`,
      c.visa            && `Visto: ${c.visa}`,
      c.nivel_japones   && `Japonês: ${c.nivel_japones}`,
      c.hiragana        && `Hiragana: ${c.hiragana}`,
      c.katakana        && `Katakana: ${c.katakana}`,
      c.fabrica         && `Fábrica: ${c.fabrica}`,
      c.shokai          && `Shokai: ${c.shokai}`,
      c.esta_empregado  && `Situação: ${c.esta_empregado}`,
      c.precisa_apartamento != null && `Precisa apto: ${c.precisa_apartamento ? 'Sim' : 'Não'}`,
      c.pode_mudar      != null && `Pode mudar: ${c.pode_mudar ? 'Sim' : 'Não'}`,
      c.tem_carro       != null && `Tem carro: ${c.tem_carro ? 'Sim' : 'Não'}`,
      c.habilitacao?.length  && `Habilitações: ${c.habilitacao.join(', ')}`,
      c.experiencia?.length  && `Experiência: ${c.experiencia.join(', ')}`,
      c.turnos_possiveis?.length && `Turnos: ${c.turnos_possiveis.join(', ')}`,
      c.comentario      && `Comentário: ${c.comentario}`,
      `Origem: formulário web`,
    ].filter(Boolean).join('\n')

    const contact = {
      names:       [{ givenName: c.shimei || '' }],
      phoneNumbers: c.telefone ? [{ value: c.telefone, type: 'mobile' }] : [],
      addresses:   (c.prefecture || c.city) ? [{
        region: c.prefecture || '', city: c.city || '',
        country: 'Japan', type: 'home',
      }] : [],
      birthdays: c.data_nascimento ? [{
        date: {
          year:  parseInt(c.data_nascimento.split('-')[0]),
          month: parseInt(c.data_nascimento.split('-')[1]),
          day:   parseInt(c.data_nascimento.split('-')[2]),
        }
      }] : [],
      biographies: [{ value: notas, contentType: 'TEXT_PLAIN' }],
    }

    const [gData] = await Promise.all([
      getAccessToken()
        .then(token => fetch('https://people.googleapis.com/v1/people:createContact', {
          method:  'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body:    JSON.stringify(contact),
        })).then(r => r.json()),
      sendTelegram(buildTelegramMsg(c)).catch(err => console.warn('Telegram:', err)),
    ])

    if (gData.error) {
      console.error('Google Contacts erro:', gData.error)
      if (gData.error.status === 'UNAUTHENTICATED' || gData.error.code === 401) {
        sendTelegram(`⚠️ Token Google Contacts EXPIRADO!\n\nRenove agora:\nhttps://crm-recrutamento-production.up.railway.app/reauth`).catch(console.warn)
      }
      return res.status(500).json({ ok: false, error: gData.error.message })
    }

    res.json({ ok: true, resourceName: gData.resourceName })
  } catch (err) {
    console.error('Erro ao criar contato:', err)
    res.status(500).json({ ok: false, error: err.message })
  }
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`CRM rodando na porta ${PORT}`))
