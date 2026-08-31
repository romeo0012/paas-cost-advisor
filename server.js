const express = require('express')
const app = express()
const http = require('http').Server(app)
const fs = require('fs')
const path = require('path')
const BASE_PATH = process.env.BASE_PATH || ''
const { getAllPlans, getAdvice, listProviders, updatePlan, addPlan, deletePlan, updateProvider, listTiers, updateTier, addTier, deleteTier } = require('./providers')
const { refreshProviderPrices } = require('./lib/pricing')
const port = process.env.PORT || 3000

const io = require('socket.io')(http, {
  path: BASE_PATH + '/socket.io',
})

app.use(express.json())

app.use(BASE_PATH, (req, res, next) => {
  const htmlPath = req.path === '/' || req.path === '' ? '/index.html'
    : req.path === '/admin' ? '/admin.html'
    : req.path.endsWith('.html') ? req.path : null
  if (!htmlPath) return next()
  const filePath = path.join(__dirname, 'public', htmlPath)
  fs.readFile(filePath, 'utf-8', (err, html) => {
    if (err) return next()
    const baseTag = BASE_PATH ? `<base href="${BASE_PATH}/">` : ''
    const script = `<script>window.BASE_PATH=${JSON.stringify(BASE_PATH)};</script>`
    res.send(html.replace('</head>', baseTag + script + '</head>'))
  })
})

app.use(BASE_PATH, express.static(__dirname + '/public'))

function p(route) { return BASE_PATH + route }

app.get(p('/api/plans'), (req, res) => {
  const currency = req.query.currency || 'CZK'
  res.json(getAllPlans(currency))
})

app.post(p('/api/advice'), (req, res) => {
  const results = getAdvice(req.body)
  res.json(results)
})

app.get(p('/api/admin/providers'), (_req, res) => {
  res.json(listProviders())
})

app.put(p('/api/admin/providers/:providerId'), (req, res) => {
  const result = updateProvider(req.params.providerId, req.body)
  if (!result) return res.status(404).json({ error: 'Provider not found' })
  res.json(result)
})

app.put(p('/api/admin/plans/:providerId/:planIdx'), (req, res) => {
  const result = updatePlan(req.params.providerId, parseInt(req.params.planIdx), req.body)
  if (!result) return res.status(404).json({ error: 'Plan not found' })
  res.json(result)
})

app.post(p('/api/admin/plans/:providerId'), (req, res) => {
  const result = addPlan(req.params.providerId, req.body)
  if (!result) return res.status(404).json({ error: 'Provider not found' })
  res.json(result)
})

app.delete(p('/api/admin/plans/:providerId/:planIdx'), (req, res) => {
  const result = deletePlan(req.params.providerId, parseInt(req.params.planIdx))
  if (!result) return res.status(404).json({ error: 'Plan not found' })
  res.json(result)
})

app.get(p('/api/admin/tiers'), (_req, res) => {
  res.json(listTiers())
})

app.post(p('/api/admin/refresh-prices/:providerId'), async (req, res) => {
  try {
    const result = await refreshProviderPrices(req.params.providerId)
    res.json(result)
  } catch (e) {
    res.status(400).json({ error: e.message })
  }
})

app.put(p('/api/admin/tiers/:tierId'), (req, res) => {
  const result = updateTier(req.params.tierId, req.body)
  if (!result) return res.status(404).json({ error: 'Tier not found' })
  res.json(result)
})

app.post(p('/api/admin/tiers'), (req, res) => {
  const result = addTier(req.body)
  res.json(result)
})

app.delete(p('/api/admin/tiers/:tierId'), (req, res) => {
  const result = deleteTier(req.params.tierId)
  if (!result) return res.status(404).json({ error: 'Tier not found' })
  res.json(result)
})

io.on('connection', (socket) => {
  socket.on('getAdvice', (requirements, callback) => {
    callback(getAdvice(requirements))
  })
})

http.listen(port, () => console.log('PaaS Cost Advisor running on port ' + port + ' base=' + (BASE_PATH || '/') ))
