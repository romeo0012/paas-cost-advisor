'use strict'

// Business Cloud (T-Business / T-Cloud) IaaS is billed as a "Resource Pool":
// total = Σ CPU GHz × rate + Σ RAM GB × rate + Σ disk GB × tier rate + remote backup + public IP.
// Unit rates in Kč/month from the official T-Business calculator, per commitment (0/12/24/36 months).
// The total CPU GHz is rounded UP to a whole number for the pooled bill.

const COMMITMENTS = [0, 12, 24, 36]

const RATES = {
  cpu: { 0: 157.06, 12: 108.73, 24: 102.69, 36: 96.65 },
  ram: { 0: 68.33, 12: 47.30, 24: 44.68, 36: 42.05 },
}

const DISK_TIERS = {
  superfast: { key: 'superfast', label: 'Super Fast', rates: { 0: 4.55, 12: 3.15, 24: 2.98, 36: 2.80 } },
  fast:      { key: 'fast',      label: 'Fast',      rates: { 0: 2.60, 12: 1.80, 24: 1.70, 36: 1.60 } },
  standard:  { key: 'standard',  label: 'Standard',  rates: { 0: 1.95, 12: 1.35, 24: 1.28, 36: 1.20 } },
  basic:     { key: 'basic',     label: 'Basic',     rates: { 0: 1.30, 12: 0.90, 24: 0.85, 36: 0.80 } },
}

const PUBLIC_IP_RATE_CZK = parseFloat(process.env.IaaS_PUBLIC_IP_RATE_CZK) || 108
const REMOTE_BACKUP_RATE_CZK = parseFloat(process.env.IaaS_REMOTE_BACKUP_RATE_CZK) || 0.68
const REMOTE_BACKUP_MULTIPLIER = 2

const ENV = {
  cpu: parseFloat(process.env.IaaS_CPU_RATE_CZK_GHZ),
  ram: parseFloat(process.env.IaaS_RAM_RATE_CZK_GB),
  disk: parseFloat(process.env.IaaS_DISK_RATE_CZK_GB),
}

function commitmentLabel(cm) {
  return cm === 0 ? 'Bez závazku' : cm + ' měs.'
}

function normalizeCommitment(cm) {
  const n = parseInt(cm, 10)
  return COMMITMENTS.includes(n) ? n : 12
}

function rateCpuGHz(cm) {
  const table = RATES.cpu[cm]
  return (Number.isFinite(ENV.cpu) && cm === 12) ? ENV.cpu : table
}

function rateRamGB(cm) {
  const table = RATES.ram[cm]
  return (Number.isFinite(ENV.ram) && cm === 12) ? ENV.ram : table
}

function rateDiskGB() {
  const table = DISK_TIERS.superfast.rates[12]
  return Number.isFinite(ENV.disk) ? ENV.disk : table
}

function diskRateForTier(tier, cm) {
  const t = DISK_TIERS[tier]
  return (t && t.rates[cm]) || rateDiskGB()
}

function diskTierLabel(tier) {
  const t = DISK_TIERS[tier]
  return t ? t.label : DISK_TIERS.superfast.label
}

// Cost breakdown for a single VM using its own disk tier (exact, per-node).
function nodeCost(node, cm) {
  const cpuGHz = node.cpuGHz || 0
  const ramGB = node.ramGB || 0
  const diskGB = node.diskGB || 0
  const tier = node.diskTier || 'superfast'
  const diskRate = diskRateForTier(tier, cm)
  const cpuCost = cpuGHz * rateCpuGHz(cm)
  const ramCost = ramGB * rateRamGB(cm)
  const diskCost = diskGB * diskRate
  const total = cpuCost + ramCost + diskCost
  return {
    name: node.name,
    group: node.group,
    cpuGHz,
    ramGB,
    diskGB,
    diskTier: tier,
    diskTierLabel: diskTierLabel(tier),
    diskRate,
    cpuCostCZK: cpuCost,
    ramCostCZK: ramCost,
    diskCostCZK: diskCost,
    totalCZK: total,
  }
}

// Full pooled "Resource Pool" summary. Nodes with excludeIaaS=true are listed but contribute nothing.
// remoteBackupGB: when provided (incl. 0) uses it as-is; when null/undefined defaults to 2× total disk.
function summarize(nodes, cm = 12, remoteBackupGB = null) {
  const costed = []
  const perNode = nodes.map(n => {
    const c = nodeCost(n, cm)
    if (n.excludeIaaS) {
      return { ...c, iaasExcluded: true, cpuCostCZK: 0, ramCostCZK: 0, diskCostCZK: 0, totalCZK: 0 }
    }
    costed.push(c)
    return c
  })
  const pooled = { cpuGHz: 0, ramGB: 0, diskGB: 0 }
  for (const n of costed) {
    pooled.cpuGHz += n.cpuGHz
    pooled.ramGB += n.ramGB
    pooled.diskGB += n.diskGB
  }
  const cpuGHzCharged = Math.ceil(pooled.cpuGHz)
  const hasOpnsense = costed.some(n => n.group === 'opnsense')
  const rbGB = (remoteBackupGB != null && Number.isFinite(Number(remoteBackupGB)))
    ? Math.max(0, Number(remoteBackupGB))
    : pooled.diskGB * REMOTE_BACKUP_MULTIPLIER
  const totals = {
    cpuGHz: pooled.cpuGHz,
    ramGB: pooled.ramGB,
    diskGB: pooled.diskGB,
    cpuCostCZK: cpuGHzCharged * rateCpuGHz(cm),
    ramCostCZK: pooled.ramGB * rateRamGB(cm),
    diskCostCZK: costed.reduce((s, n) => s + n.diskCostCZK, 0),
    remoteBackupCZK: rbGB * REMOTE_BACKUP_RATE_CZK,
    publicIpCZK: hasOpnsense ? PUBLIC_IP_RATE_CZK : 0,
  }
  totals.totalCZK = totals.cpuCostCZK + totals.ramCostCZK + totals.diskCostCZK + totals.remoteBackupCZK + totals.publicIpCZK
  return {
    commitmentMonths: cm,
    commitmentLabel: commitmentLabel(cm),
    rateCpuGHz: rateCpuGHz(cm),
    rateRamGB: rateRamGB(cm),
    rateDiskGB: rateDiskGB(),
    publicIpRateCZK: PUBLIC_IP_RATE_CZK,
    publicIpCZK: totals.publicIpCZK,
    remoteBackupRateCZK: REMOTE_BACKUP_RATE_CZK,
    remoteBackupCZK: totals.remoteBackupCZK,
    remoteBackupCapacityGB: rbGB,
    perNode,
    totals,
  }
}

module.exports = {
  COMMITMENTS,
  RATES,
  DISK_TIERS,
  PUBLIC_IP_RATE_CZK,
  REMOTE_BACKUP_RATE_CZK,
  REMOTE_BACKUP_MULTIPLIER,
  normalizeCommitment,
  rateCpuGHz, rateRamGB, rateDiskGB,
  diskTiers: DISK_TIERS, diskRateForTier, diskTierLabel,
  nodeCost, summarize,
}