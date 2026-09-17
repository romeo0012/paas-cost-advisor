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

  const commitment = data.commitment != null ? Number(data.commitment) : 12

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
function priceTopology(topologyInput, currency = 'CZK') {
  const topo = normalize(topologyInput)
  const nodes = topo.nodes
  const cm = topo.commitment
  const bcSummary = bc.summarize(nodes, cm, topo.remoteBackupGB)

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
      remoteBackupCZK: bcSummary.totals.remoteBackupCZK,
      publicIpCZK: bcSummary.totals.publicIpCZK,
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
  }

  return {
    envName: topo.envName,
    commitmentMonths: cm,
    nodeCount: nodes.length,
    perNode,
    totals,
  }
}

function sampleTopology() {
  return {
    envName: '',
    commitment: 12,
    remoteBackupGB: null,
    nodes: [
      { group: 'opnsense', name: 'Sec-01', label: 'Firewall/LoadBalancing', cpuGHz: 4, ramGB: 4, diskGB: 50, diskTier: 'fast' },
      { group: 'app', name: 'App-01', label: '', cpuGHz: 8, ramGB: 4, diskGB: 100, diskTier: 'standard' },
      { group: 'db', name: 'Db-01', label: '', cpuGHz: 4, ramGB: 4, diskGB: 300, diskTier: 'fast' },
    ],
  }
}

module.exports = { normalize, priceTopology, sampleTopology, GHZ_PER_VCPU }