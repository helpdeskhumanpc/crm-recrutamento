const express      = require('express')
const cookieParser = require('cookie-parser')
const path         = require('path')

const app      = express()
const PASSWORD = process.env.PASSWORD || '0246'
const SECRET   = 'crm-human-auth-ok'

app.use(cookieParser())
app.use(express.urlencoded({ extended: true }))

function autenticado(req) {
  return req.cookies.crm_auth === SECRET
}

app.get('/login', (req, res) => {
  const erro = req.query.error ? '<p style="color:red;margin-top:8px">パスワードが違います。</p>' : ''
  res.send(`<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>ログイン — CRM採用管理</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Helvetica Neue',sans-serif;background:#1a1a2e;display:flex;align-items:center;justify-content:center;height:100vh}
      .box{background:white;padding:40px;border-radius:10px;width:320px;box-shadow:0 8px 32px rgba(0,0,0,0.3)}
      h1{font-size:18px;color:#333;margin-bottom:6px}
      p{font-size:13px;color:#888;margin-bottom:24px}
      label{font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:5px}
      input{width:100%;padding:10px 12px;border:1px solid #ddd;border-radius:4px;font-size:15px;margin-bottom:16px;letter-spacing:4px}
      button{width:100%;padding:11px;background:#e8621a;color:white;border:none;border-radius:4px;font-size:15px;font-weight:600;cursor:pointer}
      button:hover{background:#d4571a}
    </style></head>
  <body><div class="box">
    <h1>CRM 採用管理</h1>
    <p>パスワードを入力してください</p>
    <form method="POST" action="/login">
      <label>パスワード</label>
      <input type="password" name="password" autofocus placeholder="••••">
      <button type="submit">ログイン</button>
      ${erro}
    </form>
  </div></body></html>`)
})

app.post('/login', (req, res) => {
  if (req.body.password === PASSWORD) {
    res.cookie('crm_auth', SECRET, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 })
    res.redirect('/')
  } else {
    res.redirect('/login?error=1')
  }
})

app.get('/logout', (req, res) => {
  res.clearCookie('crm_auth')
  res.redirect('/login')
})

app.use((req, res, next) => {
  if (!autenticado(req)) return res.redirect('/login')
  next()
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'))
})

app.use(express.static(path.join(__dirname)))

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`CRM rodando na porta ${PORT}`))
