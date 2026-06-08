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

// ─── Google Contacts ──────────────────────────────────────────
async function getAccessToken() {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
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
