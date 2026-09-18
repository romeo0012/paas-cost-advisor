const { convert } = require('./currency')

const GCP_MACHINE_PRICES = {
  'us-central1': {
    'e2-micro': 0.0085,
    'e2-medium': 0.0335,
    'e2-standard-2': 0.0670,
    'e2-standard-4': 0.1340,
  },
}
const GCP_APP_ENGINE_PRICES = {
  'us-central1': {
    F1: 0.0500,
    F2: 0.1000,
    F4: 0.2000,
    F4_1G: 0.4000,
  },
}

const STORAGE_PRICES = {
  aws: { gp3: 0.08, gp2: 0.10 },
  azure: { ssd: 0.08, hdd: 0.04 },
  gcp: { 'pd-ssd': 0.17, 'pd-standard': 0.04 },
}

const INSTANCE_PATTERNS = {
  aws: /\b(t3\.\w+|t4g\.\w+|m5\.\w+|c5\.\w+)\b/,
  azure: /\b([A-Z]\d+\w*)\b/,
  gcp: /\b(e2-[\w-]+)\b/,
}

function priceFromOnDemand(data, instanceType) {
  const candidates = Object.entries(data.products).filter(
    ([, p]) => p.attributes?.instanceType === instanceType
  )

  const score = (attrs) => {
    let s = 0
    if (attrs.operatingSystem === 'Linux') s += 10
    if (attrs.tenancy === 'Shared') s += 5
    if (attrs.preInstalledSw === 'NA') s += 3
    if (attrs.capacityStatus === 'Used') s += 2
    return s
  }

  candidates.sort((a, b) => score(b[1].attributes) - score(a[1].attributes))

  for (const [sku] of candidates) {
    const term = data.terms?.OnDemand?.[sku]
    if (!term) continue
    for (const termObj of Object.values(term)) {
      for (const dim of Object.values(termObj.priceDimensions)) {
        const rate = parseFloat(dim.pricePerUnit.USD)
        if (rate > 0) return rate
      }
    }
  }
  return null
}

const GCP_SERVICE_ID = '6F81-5844-456A'
// Shared-core E2 types bill a fraction of a vCPU (RAM is billed in full).
const GCP_SHARED_CORE = { 'e2-micro': 0.25, 'e2-small': 0.5, 'e2-medium': 1.0 }

async function fetchWithTimeout(url, ms = 30000) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), ms)
  try {
    const res = await fetch(url, { signal: ctrl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return res
  } finally {
    clearTimeout(id)
  }
}

// The AWS on-demand index is a large (~hundreds of MB) JSON dump. Cache it for a
// short window so a single "refresh prices" action downloads it only once (plans +
// instance catalog) and rapid re-clicks stay responsive.
const AWS_INDEX_TTL = 10 * 60 * 1000
const awsIndexCache = new Map()

function getAwsIndex(region) {
  const hit = awsIndexCache.get(region)
  if (hit && Date.now() - hit.at < AWS_INDEX_TTL) return hit.promise
  const url = `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonEC2/current/${region}/index.json`
  const promise = fetchWithTimeout(url, 120000)
    .then(r => r.json())
    .catch(e => { awsIndexCache.delete(region); throw e })
  awsIndexCache.set(region, { at: Date.now(), promise })
  return promise
}

async function refreshProviderPrices(providerId) {
  const fs = require('fs')
  const path = require('path')
  const DATA_PATH = path.join(__dirname, '..', 'data', 'providers.json')
  const db = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
  const prov = db[providerId]
  if (!prov) throw new Error('Provider not found')
  if (prov.pricingSource !== 'auto') throw new Error('Provider has manual pricing')

  const pattern = INSTANCE_PATTERNS[providerId]
  const results = []

  const tiersPath = path.join(__dirname, '..', 'data', 'tiers.json')
  const tiers = JSON.parse(fs.readFileSync(tiersPath, 'utf-8'))

  let awsData = null

  for (let i = 0; i < prov.plans.length; i++) {
    const plan = prov.plans[i]

    let note = plan.note || ''
    const tier = tiers.find(t => t.id.toLowerCase() === (plan.tierId || '').toLowerCase())
    if (tier) {
      const storageNum = (tier.storage || '').match(/\d+/)
      if (storageNum) {
        note = note.replace(/\b(\d+)\s*GB/, storageNum[0] + ' GB')
        plan.note = note
      }
    }
    let priceUSD = null

    if (providerId === 'aws') {
      const m = note.match(pattern)
      if (m) {
        if (!awsData) {
          awsData = await getAwsIndex(prov.region)
        }
        const hourly = priceFromOnDemand(awsData, m[1])
        if (hourly !== null) {
          priceUSD = hourly * 730
          if (note.toLowerCase().includes('alb')) {
            priceUSD += 16.43 // ALB base cost ~$0.0225/h × 730h
          }
        }
      }
    } else if (providerId === 'azure') {
      const qtyMatch = note.match(/(\d+)\s*[xX]\s*([A-Z]\d+\w*)/)
      const m = note.match(pattern)
      let skuRaw, multiplier = 1
      if (qtyMatch) {
        skuRaw = qtyMatch[2]
        multiplier = parseInt(qtyMatch[1])
      } else if (m) {
        skuRaw = m[1]
      }
      if (skuRaw) {
        const sku = skuRaw.replace(/_/g, ' ')
        const isAppService = note.toLowerCase().includes('app service')
        const serviceName = isAppService ? 'Azure App Service' : 'Virtual Machines'
        const url = `https://prices.azure.com/api/retail/prices?$filter=serviceName eq '${serviceName}' and armRegionName eq '${prov.region}' and skuName eq '${sku}'`
        const res = await fetchWithTimeout(url)
        const data = await res.json()
        if (data.Items && data.Items.length) {
          const pick = (items) => {
            if (isAppService)
              return items.find(i => i.type === 'Consumption' && !i.productName?.includes('Linux'))
            return items.find(i => i.type === 'Consumption' && i.productName?.startsWith('Virtual Machines') && !i.productName?.includes('Windows'))
          }
          const item = pick(data.Items) || data.Items.find(i => i.type === 'Consumption') || data.Items[0]
          priceUSD = (item.unitOfMeasure?.includes('Hour') ? item.retailPrice * 730 : item.retailPrice) * multiplier
        } else {
          const url2 = `https://prices.azure.com/api/retail/prices?$filter=serviceName eq '${serviceName}' and armRegionName eq '${prov.region}' and contains(skuName, '${sku}')`
          const res2 = await fetchWithTimeout(url2)
          const data2 = await res2.json()
          if (data2.Items && data2.Items.length) {
            const item2 = data2.Items[0]
            priceUSD = (item2.unitOfMeasure?.includes('Hour') ? item2.retailPrice * 730 : item2.retailPrice) * multiplier
          }
        }
      }
    } else if (providerId === 'gcp') {
      const region = prov.region || 'us-central1'
      const machinePrices = GCP_MACHINE_PRICES[region] || GCP_MACHINE_PRICES['us-central1']
      const appEnginePrices = GCP_APP_ENGINE_PRICES[region] || GCP_APP_ENGINE_PRICES['us-central1']
      const m = note.match(pattern)
      if (m) {
        const machine = m[1]
        if (machinePrices[machine]) {
          priceUSD = machinePrices[machine] * 730
        }
      }
      if (priceUSD === null) {
        const ae = note.match(/(F\d+(?:_1G)?)/)
        if (ae && appEnginePrices[ae[1]]) {
          priceUSD = appEnginePrices[ae[1]] * 730
        }
      }
    }

    if (priceUSD !== null) {
      const storageMatch = note.match(/\b(\d+)\s*GB\b/)
      if (storageMatch) {
        const storageGB = parseInt(storageMatch[1])
        let storagePricePerGB = 0
        if (providerId === 'aws' && note.toLowerCase().includes('gp3')) {
          storagePricePerGB = STORAGE_PRICES.aws.gp3
        } else if (providerId === 'azure' && note.toLowerCase().includes('ssd')) {
          storagePricePerGB = STORAGE_PRICES.azure.ssd
        } else if (providerId === 'gcp' && note.toLowerCase().includes('pd-ssd')) {
          storagePricePerGB = STORAGE_PRICES.gcp['pd-ssd']
        }
        priceUSD += storageGB * storagePricePerGB
      }
    }

    if (priceUSD !== null) {
      plan.pricePerMonth = convert(priceUSD, 'USD', 'CZK')
      plan.currency = 'CZK'
      results.push({ tierId: plan.tierId, name: plan.name, priceCZK: plan.pricePerMonth })
    } else {
      results.push({ tierId: plan.tierId, name: plan.name, priceCZK: null, error: 'Could not fetch' })
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), 'utf-8')
  return results
}

// Extract the public on-demand hourly USD price from a Cloud Billing SKU (v1 API).
function skuHourlyPrice(sku) {
  if (!sku.pricingInfo) return null
  for (const pi of sku.pricingInfo) {
    if (pi.aggregateInfo || !pi.pricingExpression) continue
    const tier = (pi.pricingExpression.tieredRates || [])[0]
    if (!tier || !tier.unitPrice) continue
    const conv = pi.currencyConversionRate || 1
    return (tier.unitPrice.units + (tier.unitPrice.nanos || 0) / 1e9) * conv
  }
  return null
}

// Fetch the current regional E2 per-vCPU core and per-GiB RAM hourly rates from the
// public Cloud Billing Catalog API (requires GCP_API_KEY). Returns null when the
// region's SKUs cannot be found.
async function gcpE2Prices(region) {
  const key = process.env.GCP_API_KEY
  const base = `https://cloudbilling.googleapis.com/v1/services/${GCP_SERVICE_ID}/skus?key=${key}&pageSize=5000&currencyCode=USD`
  const skus = []
  let pageToken = ''
  do {
    const url = pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base
    const data = await (await fetchWithTimeout(url, 60000)).json()
    if (data.error) throw new Error((data.error && data.error.message) || 'GCP API error')
    skus.push(...(data.skus || []))
    pageToken = data.nextPageToken || ''
  } while (pageToken)

  const out = { core: null, ram: null }
  for (const sku of skus) {
    let field = null
    if (sku.description && /^E2 Instance Core running in /.test(sku.description)) field = 'core'
    else if (sku.description && /^E2 Instance Ram running in /.test(sku.description)) field = 'ram'
    if (!field) continue
    if (!sku.category || sku.category.resourceFamily !== 'Compute' || sku.category.usageType !== 'OnDemand') continue
    if ((sku.serviceRegions || []).indexOf(region) === -1) continue
    const price = skuHourlyPrice(sku)
    if (price != null && out[field] === null) out[field] = price
  }
  return out.core === null || out.ram === null ? null : out
}

async function azureHourly(region, type) {
  const queries = [
    `armSkuName eq 'Standard_${type}'`,
    `skuName eq '${type.replace(/_/g, ' ')}'`,
    `skuName eq '${type}'`,
  ]
  const isPlain = i =>
    i.type === 'Consumption' &&
    (i.productName || '').startsWith('Virtual Machines') &&
    !/Windows/.test(i.productName || '') &&
    !/(Low Priority|Spot)/.test(i.skuName || '')
  for (const filter of queries) {
    const url = `https://prices.azure.com/api/retail/prices?$filter=serviceName eq 'Virtual Machines' and armRegionName eq '${region}' and ${filter}`
    const data = await (await fetchWithTimeout(url)).json()
    const items = data.Items || []
    if (!items.length) continue
    const armName = `Standard_${type}`
    const item = items.find(i => isPlain(i) && i.skuName === armName)
      || items.find(isPlain)
      || items.find(i => i.type === 'Consumption')
      || items[0]
    if (item && item.retailPrice) {
      return item.unitOfMeasure && item.unitOfMeasure.includes('Hour') ? item.retailPrice : null
    }
  }
  return null
}

// Refresh the per-instance hourly prices in data/instances.json (used by the topology
// comparison and the methodology catalog). Specs (vCPU/RAM) are kept as-is.
async function refreshInstancePrices(providerId) {
  const fs = require('fs')
  const path = require('path')
  const DATA_PATH = path.join(__dirname, '..', 'data', 'instances.json')
  const cat = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'))
  const prov = cat.providers[providerId]
  if (!prov || !Array.isArray(prov.instances)) {
    return { provider: providerId, updated: 0, total: 0, skipped: true, reason: 'notInCatalog' }
  }
  const total = prov.instances.length

  if (providerId === 'gcp') {
    if (!process.env.GCP_API_KEY) {
      return { provider: providerId, updated: 0, total, skipped: true, reason: 'gcpNoKey' }
    }
    const p = await gcpE2Prices(prov.region || 'us-central1')
    if (!p) {
      return { provider: providerId, updated: 0, total, skipped: true, reason: 'gcpNoSku' }
    }
    let updated = 0
    for (const it of prov.instances) {
      const factor = GCP_SHARED_CORE[it.type] ?? it.vcpu
      it.usdPerHour = Math.round((factor * p.core + it.ramGiB * p.ram) * 10000) / 10000
      updated++
    }
    fs.writeFileSync(DATA_PATH, JSON.stringify(cat, null, 2), 'utf-8')
    return { provider: providerId, updated, total }
  }

  let awsData = null
  if (providerId === 'aws') {
    awsData = await getAwsIndex(prov.region || 'us-east-1')
  }

  let updated = 0
  for (const it of prov.instances) {
    try {
      const hourly = providerId === 'aws'
        ? priceFromOnDemand(awsData, it.type)
        : providerId === 'azure' ? await azureHourly(prov.region, it.type) : null
      if (hourly != null && hourly > 0) {
        it.usdPerHour = Math.round(hourly * 10000) / 10000
        updated++
      }
    } catch (e) {
      // keep the existing price for this instance
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(cat, null, 2), 'utf-8')
  return { provider: providerId, updated, total }
}

module.exports = { refreshProviderPrices, refreshInstancePrices }
