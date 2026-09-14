const fs = require('fs')
const path = require('path')
const { convert, RATES } = require('../lib/currency')

const DATA_PATH = path.join(__dirname, '..', 'data', 'providers.json')
const TIERS_PATH = path.join(__dirname, '..', 'data', 'tiers.json')

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
}

function saveData(data) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function mergeTierSpecs(plan) {
  if (!plan.tierId) return plan
  const tiers = loadTiers()
  const tier = tiers.find(t => t.id.toLowerCase() === plan.tierId.toLowerCase())
  if (!tier) return plan

  const storageNum = (tier.storage || '').match(/\d+/)
  let note = plan.note || ''
  if (storageNum) {
    note = note.replace(/\b(\d+)\s*GB/, storageNum[0] + ' GB')
  }

  return { ...plan, cpu: tier.cpu, ram: tier.ram, storage: tier.storage, note }
}

function convertPlans(plans, target) {
  return plans.map(p => ({
    ...p,
    pricePerMonth: p.pricePerMonth ? convert(p.pricePerMonth, p.currency, target) : p.pricePerMonth,
    currency: target,
  }))
}

function getAllPlans(targetCurrency = 'CZK') {
  const db = loadData()
  const result = {}
  for (const [key, prov] of Object.entries(db)) {
    result[key] = convertPlans(prov.plans.filter(p => p.active !== false).map(mergeTierSpecs), targetCurrency)
  }
  return result
}

function addInstances(plans, maxBudget) {
  return plans.map(p => ({
    ...p,
    maxInstances: maxBudget === Infinity ? Infinity : Math.floor(maxBudget / p.pricePerMonth),
  }))
}

function isPaasTier(tierId) {
  const t = loadTiers().find(x => x.id.toLowerCase() === String(tierId || '').toLowerCase())
  return t ? t.category === 'PaaS' : /^paas[\s-]/i.test(String(tierId || ''))
}

function getAdvice(requirements) {
  const db = loadData()
  const targetCurrency = requirements.currency || 'CZK'
  const maxBudget = requirements.maxBudget || Infinity
  const utilizationPct = requirements.utilizationPct != null ? Number(requirements.utilizationPct) : (Number(process.env.PAAS_UTILIZATION) || 40)
  const utilFactor = utilizationPct / 100
  const results = []
  for (const [key, prov] of Object.entries(db)) {
    const res = {
      provider: prov.name,
      region: prov.region,
      plans: prov.plans.filter(p => p.active !== false).map(p => {
        const plan = mergeTierSpecs({ ...p, provider: prov.name })
        if (isPaasTier(plan.tierId) && plan.pricePerMonth != null) {
          plan.pricePerMonth = plan.pricePerMonth * utilFactor
        }
        return plan
      }),
      recommendations: [],
    }
    res.plans = addInstances(convertPlans(res.plans, targetCurrency), maxBudget)
    const filtered = res.plans.filter(p => p.maxInstances > 0)
    res.recommendations = filtered.length > 0 ? filtered : [{ message: 'No plans within budget', provider: res.provider }]
    results.push(res)
  }
  return results
}

function listProviders() {
  const db = loadData()
  return Object.entries(db).map(([key, prov]) => ({
    id: key,
    name: prov.name,
    region: prov.region,
    pricingSource: prov.pricingSource,
    plans: prov.plans,
  }))
}

function updatePlan(providerId, planIdx, updates) {
  const db = loadData()
  if (!db[providerId]) return null
  const plan = db[providerId].plans[planIdx]
  if (!plan) return null
  Object.assign(plan, updates)
  saveData(db)
  return plan
}

function addPlan(providerId, plan) {
  const db = loadData()
  if (!db[providerId]) return null
  db[providerId].plans.push(plan)
  saveData(db)
  return plan
}

function deletePlan(providerId, planIdx) {
  const db = loadData()
  if (!db[providerId]) return null
  const removed = db[providerId].plans.splice(planIdx, 1)
  saveData(db)
  return removed[0] || null
}

function updateProvider(providerId, updates) {
  const db = loadData()
  if (!db[providerId]) {
    db[providerId] = { name: providerId, region: '', plans: [] }
  }
  const { plans, ...safe } = updates
  Object.assign(db[providerId], safe)
  saveData(db)
  return db[providerId]
}

function loadTiers() {
  return JSON.parse(fs.readFileSync(TIERS_PATH, 'utf-8'))
}

function saveTiers(data) {
  fs.writeFileSync(TIERS_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

function listTiers() {
  return loadTiers()
}

function updateTier(tierId, updates) {
  const tiers = loadTiers()
  const tier = tiers.find(t => t.id === tierId)
  if (!tier) return null
  Object.assign(tier, updates)
  saveTiers(tiers)
  return tier
}

function addTier(tier) {
  const tiers = loadTiers()
  tiers.push(tier)
  saveTiers(tiers)
  return tier
}

function deleteTier(tierId) {
  const tiers = loadTiers()
  const idx = tiers.findIndex(t => t.id === tierId)
  if (idx === -1) return null
  const removed = tiers.splice(idx, 1)
  saveTiers(tiers)
  return removed[0]
}

module.exports = {
  getAllPlans, getAdvice, listProviders,
  updatePlan, addPlan, deletePlan, updateProvider,
  listTiers, updateTier, addTier, deleteTier,
  RATES,
}
