const express = require('express')
const path    = require('path')

const app = express()

app.use(express.static(path.join(__dirname)))

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'))
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log(`CRM rodando na porta ${PORT}`))
