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

    const token    = await getAccessToken()
    const gRes     = await fetch('https://people.googleapis.com/v1/people:createContact', {
      method:  'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify(contact),
    })
    const gData = await gRes.json()

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
