'use strict'

const fs = require('fs')
const path = require('path')
const { convert } = require('./currency')
const bc = require('./businesscloud')

const CATALOG = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'instances.json'), 'utf-8'))
const GHZ_PER_VCPU = Number(process.env.TOPO_GHZ_PER_VCPU) || CATALOG.ghzPerVcpu || 2.6
const HOURS_PER_MONTH = CATALOG.hoursPerMonth || 730

function round2(n) {
  return Math.round(n * 100) / 100
}

function readData(file) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', file), 'utf-8'))
}

function parseNum(s) {
  const m = String(s == null ? '' : s).match(/(\d+(\.\d+)?)/)
  return m ? Number(m[1]) : 0
}

// Build a PaaS catalog (managed offerings: AWS Elastic Beanstalk, GCP App Engine,
// Azure App Service, Business Cloud PaaS) from the shared tier specs + provider plans.
// Read fresh so admin edits are picked up without a restart.
function buildPaasCatalog() {
  let specs = {}
  for (const t of readData('tiers.json')) {
    if (t.category !== 'PaaS') continue
    specs[String(t.id).toLowerCase()] = { vcpu: parseNum(t.cpu), ramGiB: parseNum(t.ram) }
  }
  const providers = readData('providers.json')
  const catalog = {}
  for (const [pid, prov] of Object.entries(providers)) {
    const entries = []
    for (const plan of prov.plans || []) {
      if (!plan.tierId || plan.active === false) continue
      const spec = specs[String(plan.tierId).toLowerCase()]
      if (!spec) continue
      entries.push({
        tierId: plan.tierId,
        name: plan.name,
        note: plan.note || plan.name || '',
        vcpu: spec.vcpu,
        ramGiB: spec.ramGiB,
        priceCZK: Number(plan.pricePerMonth) || 0,
      })
    }
    catalog[pid] = entries
  }
  return catalog
}

// Cheapest PaaS plan that covers the VM. When nothing fits, scale out the largest plan.
function paasForNode(entries, node) {
  if (!entries || !entries.length) return null
  const vcpuNeeded = Math.max(1, Math.ceil(node.cpuGHz / GHZ_PER_VCPU))
  const ramNeeded = Math.max(1, Math.ceil(node.ramGB))
  let best = null
  for (const e of entries) {
    if (e.vcpu >= vcpuNeeded && e.ramGiB >= ramNeeded) {
      if (!best || e.priceCZK < best.priceCZK) best = e
    }
  }
  if (best) return { ...best, count: 1, reqVcpu: vcpuNeeded, reqRam: ramNeeded }
  let max = null
  for (const e of entries) {
    if (!max || e.vcpu * e.ramGiB > max.vcpu * max.ramGiB) max = e
  }
  if (!max) return null
  const count = Math.max(1, Math.ceil(Math.max(vcpuNeeded / max.vcpu, ramNeeded / max.ramGiB)))
  return { ...max, count, reqVcpu: vcpuNeeded, reqRam: ramNeeded }
}

// Accept both the raw topology file (envName/commitment/nodes) and wrapped {data:{...}}.
function normalize(topologyInput) {
  const data = (topologyInput && typeof topologyInput === 'object' && topologyInput.data)
    ? topologyInput.data
    : topologyInput
  if (!data || !Array.isArray(data.nodes)) throw new Error('Topology must contain a nodes array')

  const nodes = data.nodes
    .filter(n => n && typeof n === 'object')
    .map(n => ({
      name: n.name || n.label || 'VM',
      group: n.group || 'other',
      label: n.label || '',
      cpuGHz: Number(n.cpuGHz) || 0,
      ramGB: Number(n.ramGB) || 0,
      diskGB: Number(n.diskGB) || 0,
      diskTier: (n.diskTier || 'standard').toLowerCase(),
      excludeIaaS: !!n.excludeIaaS,
    }))
    .filter(n => n.cpuGHz > 0 || n.ramGB > 0 || n.diskGB > 0)

  const commitment = data.commitment != null ? Number(data.commitment) : 36

  return {
    envName: data.envName || data.name || '',
    commitment: bc.normalizeCommitment(commitment),
    remoteBackupGB: data.remoteBackupGB != null ? Number(data.remoteBackupGB) : null,
    nodes,
  }
}

// Cheapest instance that satisfies BOTH vCPU and RAM requirements.
function nearestInstance(provider, vcpuNeeded, ramNeeded) {
  const instances = CATALOG.providers[provider].instances
  let best = null
  let bestPrice = Infinity
  for (const it of instances) {
    if (it.vcpu >= vcpuNeeded && it.ramGiB >= ramNeeded) {
      const price = it.usdPerHour
      if (price < bestPrice) {
        best = it
        bestPrice = price
      }
    }
  }
  return best
}

// Per-VM hyperscaler estimate. Returns cost in USD plus the matched instance metadata.
function hyperscalerForNode(provider, node) {
  const vcpuNeeded = Math.max(1, Math.ceil(node.cpuGHz / GHZ_PER_VCPU))
  const ramNeeded = Math.max(1, Math.ceil(node.ramGB))
  const inst = nearestInstance(provider, vcpuNeeded, ramNeeded)
  if (!inst) return null
  const computeUSD = inst.usdPerHour * HOURS_PER_MONTH
  const storageRateUSD = CATALOG.storage[provider][node.diskTier] != null
    ? CATALOG.storage[provider][node.diskTier]
    : CATALOG.storage[provider].standard
  const storageUSD = node.diskGB * storageRateUSD
  return {
    instance: inst.type,
    vcpu: inst.vcpu,
    ramGiB: inst.ramGiB,
    reqVcpu: vcpuNeeded,
    reqRam: ramNeeded,
    computeUSD: round2(computeUSD),
    storageUSD: round2(storageUSD),
    totalUSD: round2(computeUSD + storageUSD),
  }
}

// Full comparison: Business Cloud (pooled, CZK) vs AWS/GCP/Azure (per-VM match, USD).
// Returns every money field twice: native currency plus converted to `currency`.
// Business Cloud PaaS is scaled by the PaaS utilization (dynamic cloudlets).
function priceTopology(topologyInput, currency = 'CZK', utilizationPct, commitmentMonths) {
  const topo = normalize(topologyInput)
  const nodes = topo.nodes
  const cm = commitmentMonths != null ? bc.normalizeCommitment(commitmentMonths) : topo.commitment
  const utilPct = utilizationPct != null ? Number(utilizationPct) : (Number(process.env.PAAS_UTILIZATION) || 40)
  const utilFactor = Number.isFinite(utilPct) ? utilPct / 100 : 0.4
  const bcSummary = bc.summarize(nodes, cm, topo.remoteBackupGB)
  const paasCatalog = buildPaasCatalog()

  const providers = ['aws', 'gcp', 'azure']
  const perProvider = providers.map(id => ({
    id,
    name: CATALOG.providers[id].name,
    region: CATALOG.providers[id].region,
    nodeMatches: nodes.map(n => hyperscalerForNode(id, n)),
    totalUSD: 0,
    computeUSD: 0,
    storageUSD: 0,
  }))

  for (const pp of perProvider) {
    pp.totalUSD = round2(pp.nodeMatches.reduce((s, m) => s + (m ? m.totalUSD : 0), 0))
    pp.computeUSD = round2(pp.nodeMatches.reduce((s, m) => s + (m ? m.computeUSD : 0), 0))
    pp.storageUSD = round2(pp.nodeMatches.reduce((s, m) => s + (m ? m.storageUSD : 0), 0))
    pp.totalCZK = round2(convert(pp.totalUSD, 'USD', 'CZK'))
    pp.total = round2(convert(pp.totalUSD, 'USD', currency))
    pp.compute = round2(convert(pp.computeUSD, 'USD', currency))
    pp.storage = round2(convert(pp.storageUSD, 'USD', currency))
  }

  const perNode = nodes.map((n, i) => {
    const bcNode = bcSummary.perNode[i]
    return {
      name: n.name,
      label: n.label,
      group: n.group,
      cpuGHz: n.cpuGHz,
      ramGB: n.ramGB,
      diskGB: n.diskGB,
      diskTier: n.diskTier,
      diskTierLabel: bcNode.diskTierLabel,
      excludeIaaS: n.excludeIaaS,
      businessCloud: {
        cpuCostCZK: bcNode.cpuCostCZK,
        ramCostCZK: bcNode.ramCostCZK,
        diskCostCZK: bcNode.diskCostCZK,
        totalCZK: bcNode.totalCZK,
        total: round2(convert(bcNode.totalCZK, 'CZK', currency)),
      },
      hyperscalers: Object.fromEntries(perProvider.map(pp => {
        const m = pp.nodeMatches[i]
        return [pp.id, m ? {
          instance: m.instance,
          vcpu: m.vcpu,
          ramGiB: m.ramGiB,
          computeUSD: m.computeUSD,
          storageUSD: m.storageUSD,
          totalUSD: m.totalUSD,
          total: round2(convert(m.totalUSD, 'USD', currency)),
        } : null]
      })),
      paas: Object.fromEntries(Object.keys(paasCatalog).map(pid => {
        const m = paasForNode(paasCatalog[pid], n)
        if (!m) return [pid, null]
        const factor = pid === 'tcloud' ? utilFactor : 1
        const totalCZK = round2(m.priceCZK * m.count * factor)
        return [pid, {
          tierId: m.tierId,
          name: m.name,
          note: m.note,
          count: m.count,
          vcpu: m.vcpu,
          ramGiB: m.ramGiB,
          priceCZK: m.priceCZK,
          utilizationPct: factor === 1 ? null : utilPct,
          totalCZK,
          total: round2(convert(totalCZK, 'CZK', currency)),
        }]
      })),
    }
  })

  const bcTotal = bcSummary.totals.totalCZK
  const totals = {
    businessCloud: {
      totalCZK: bcTotal,
      total: round2(convert(bcTotal, 'CZK', currency)),
      cpuCostCZK: bcSummary.totals.cpuCostCZK,
      ramCostCZK: bcSummary.totals.ramCostCZK,
      diskCostCZK: bcSummary.totals.diskCostCZK,
      cpuGHz: bcSummary.totals.cpuGHz,
      ramGB: bcSummary.totals.ramGB,
      diskGB: bcSummary.totals.diskGB,
      commitmentMonths: cm,
      commitmentLabel: bcSummary.commitmentLabel,
    },
    perProvider: perProvider.map(pp => ({
      id: pp.id,
      name: pp.name,
      region: pp.region,
      totalUSD: pp.totalUSD,
      computeUSD: pp.computeUSD,
      storageUSD: pp.storageUSD,
      totalCZK: pp.totalCZK,
      total: pp.total,
      compute: pp.compute,
      storage: pp.storage,
      savingPct: bcTotal > 0 ? Math.round((1 - convert(pp.totalUSD, 'USD', 'CZK') / bcTotal) * 100) : 0,
    })),
    paas: Object.fromEntries(Object.keys(paasCatalog).map(pid => {
      const totalCZK = round2(perNode.reduce((s, n) => s + (n.paas[pid] ? n.paas[pid].totalCZK : 0), 0))
      return [pid, { totalCZK, total: round2(convert(totalCZK, 'CZK', currency)) }]
    })),
  }

  return {
    envName: topo.envName,
    commitmentMonths: cm,
    utilizationPct: utilPct,
    nodeCount: nodes.length,
    perNode,
    totals,
  }
}

function sampleTopology() {
  return {
    envName: '',
    commitment: 36,
    remoteBackupGB: null,
    nodes: [
      { group: 'opnsense', name: 'Sec-01', label: 'Firewall/LoadBalancing', cpuGHz: 4, ramGB: 4, diskGB: 50, diskTier: 'fast' },
      { group: 'app', name: 'App-01', label: '', cpuGHz: 8, ramGB: 4, diskGB: 100, diskTier: 'standard' },
      { group: 'db', name: 'Db-01', label: '', cpuGHz: 4, ramGB: 4, diskGB: 300, diskTier: 'fast' },
    ],
  }
}

module.exports = { normalize, priceTopology, sampleTopology, GHZ_PER_VCPU }