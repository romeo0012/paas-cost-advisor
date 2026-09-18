const BP = window.BASE_PATH || ''
const DEFAULT_UTILIZATION = Number(window.PAAS_UTILIZATION) || 40
const socket = io({ path: BP + '/socket.io' })
const selected = new Set()
let tiers = []
let priceByTier = {} // { provider: { tierId: {price, currency, note, maxInstances} } }
let lastBudget = Infinity
let lastCurrency = 'CZK'
let lastTopologyResult = null
let lastTopologyInput = null
let methodologyData = null

async function loadTiers() {
  tiers = await fetch(BP + '/api/admin/tiers').then(r => r.json())
}

function fetchAdvice() {
  const budget = document.getElementById('budget').value
  const currency = document.getElementById('currency').value
  const utilization = document.getElementById('utilization').value
  lastBudget = budget ? Number(budget) : Infinity
  lastCurrency = currency
  socket.emit('getAdvice', { maxBudget: lastBudget, currency, utilizationPct: Number(utilization) || DEFAULT_UTILIZATION, rates: getRates() }, (results) => {
    renderResults(results, currency)
  })
}

function formatPrice(amount, currency) {
  const n = Math.round(Number(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  if (currency === 'CZK') return `${n} Kč`
  if (currency === 'EUR') return `${n} €`
  return `$${n}`
}

function getRates() {
  const rateCZK = parseFloat(document.getElementById('rateCZK').value)
  const rateEUR = parseFloat(document.getElementById('rateEUR').value)
  const base = (methodologyData && methodologyData.rates) || { USD: 1, CZK: 23, EUR: 0.92 }
  return { USD: 1, CZK: Number.isFinite(rateCZK) && rateCZK > 0 ? rateCZK : base.CZK, EUR: Number.isFinite(rateEUR) && rateEUR > 0 ? rateEUR : base.EUR }
}

function convertMoney(amount, from, to) {
  if (amount == null || from === to) return amount
  const rates = getRates()
  const inUsd = from === 'USD' ? amount : amount / (rates[from] || 1)
  return to === 'USD' ? inUsd : inUsd * (rates[to] || 1)
}

function formatMoney(amount, currency, decimals = 0) {
  const fixed = (Number(amount) || 0).toFixed(decimals)
  const parts = fixed.split('.')
  const n = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + (parts[1] ? '.' + parts[1] : '')
  if (currency === 'CZK') return `${n} Kč`
  if (currency === 'EUR') return `${n} €`
  return `$${n}`
}

function esc(s) {
  return String(s ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

function renderResults(results, currency) {
  const container = document.getElementById('providers')
  container.innerHTML = ''

  if (!results.length || !results[0].plans.length) {
    container.innerHTML = `<p class="empty">${i18n.t('noActivePlans')}</p>`
    return
  }

  const planCount = results[0].plans.length

  priceByTier = {}
  for (const p of results) {
    priceByTier[p.provider] = {}
    for (const plan of p.plans) {
      if (!plan.tierId) continue
      priceByTier[p.provider][plan.tierId.toLowerCase()] = {
        pricePerMonth: plan.pricePerMonth,
        currency: plan.currency,
        note: plan.note,
        maxInstances: plan.maxInstances,
      }
    }
  }

  if (selected.size === 0) {
    for (let i = 0; i < planCount; i++) {
      for (const p of results) {
        if (p.plans[i]) selected.add(`${p.provider}:${i}`)
      }
    }
  }

  const tierOpts = tiers.map(t =>
    `<option value="${t.id}" data-cpu="${esc(t.cpu)}" data-ram="${esc(t.ram)}" data-storage="${esc(t.storage)}" data-cat="${esc(t.category)}">
      ${t.category} ${t.name} ${t.cpu} ${t.ram} ${t.storage}
    </option>`
  ).join('')

  const groups = []
  for (let i = 0; i < planCount; i++) {
    const cat = tiers[i] ? tiers[i].category : ''
    if (!groups.find(g => g.cat === cat)) groups.push({ cat, indices: [] })
    groups.find(g => g.cat === cat).indices.push(i)
  }

  const colCount = 1 + results.length

  let html = `<table class="compare-table"><thead><tr><th>${i18n.t('tier')}</th>`
  for (const p of results) {
    html += `<th>${p.provider}<br><span class="region">${p.region}</span></th>`
  }
  html += '</tr></thead><tbody>'

  for (const group of groups) {
    html += `<tr class="section-divider"><th colspan="${colCount}">${group.cat}</th></tr>`

    for (const i of group.indices) {
      const sample = results[0].plans[i]
      if (!sample) continue

      html += `<tr class="tier-row" data-row="${i}">`
      html += `<td class="tier-name">
        <select class="tier-select" data-row="${i}">
          ${tierOpts}
        </select>
        <div class="tier-specs" id="tierSpecs${i}"></div>
      </td>`

      for (const p of results) {
        const plan = p.plans[i]
        if (!plan) { html += '<td>—</td>'; continue }

        const key = `${p.provider}:${i}`
        const checked = selected.has(key)
        const price = formatPrice(plan.pricePerMonth, plan.currency)
        const badge = plan.note ? `<span class="badge">${plan.note}</span>` : ''
        const instances = plan.maxInstances > 0
          ? `<span class="instances">${i18n.t('upTo')} ${plan.maxInstances}×</span>`
          : `<span class="instances instances--zero">${i18n.t('overBudget')}</span>`

        html += `<td class="plan-cell ${checked ? '' : 'plan-unselected'}" data-key="${key}" data-provider="${p.provider}" data-price="${plan.pricePerMonth}" data-currency="${plan.currency}">
          <label class="plan-check-label">
            <input type="checkbox" class="plan-check" ${checked ? 'checked' : ''} data-key="${key}">
            <div class="cell-price">${price}</div>
            <div class="cell-meta">${instances} ${badge}</div>
          </label>
        </td>`
      }

      html += '</tr>'
    }
  }

  html += '</tbody></table>'
  container.innerHTML = html

  container.querySelectorAll('.plan-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.dataset.key
      if (cb.checked) selected.add(key)
      else selected.delete(key)
      applySelection()
      updateTotal()
    })
  })

  for (let i = 0; i < planCount; i++) {
    const sel = container.querySelector(`.tier-select[data-row="${i}"]`)
    if (sel) {
      const defaultTier = tiers.find(t => t.id === (results[0].plans[i] && results[0].plans[i].tierId)) || tiers[i]
      if (defaultTier) sel.value = defaultTier.id
      updateTierSpecs(sel)
      sel.addEventListener('change', () => {
        updateTierSpecs(sel)
        updateRowPrices(sel)
      })
    }
  }

  document.getElementById('selectionToolbar').style.display = ''
  applySelection()
  updateTotal()
}

// ---- Topology comparison ----

async function priceTopology(topology) {
  lastTopologyInput = topology
  const currency = document.getElementById('currency').value
  const utilizationPct = Number(document.getElementById('utilization').value) || DEFAULT_UTILIZATION
  const commitmentMonths = Number(document.getElementById('commitment').value)
  const res = await fetch(BP + '/api/topology/price', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topology, currency, utilizationPct, commitmentMonths, rates: getRates() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${res.status}`)
  }
  return res.json()
}

function renderTopology(result) {
  lastTopologyResult = result
  const currency = document.getElementById('currency').value
  const t = i18n.t
  const summary = document.getElementById('topologySummary')
  summary.innerHTML = `<strong>${t('topologyName', result.envName)}</strong>
    · ${t('topologyNodes', result.nodeCount)} · ${t('commitment')}: ${result.commitmentMonths} měs.`

  const cols = result.totals.perProvider.map(pp => pp.name)
  let html = `<div class="providers"><table class="compare-table"><thead><tr>`
  html += `<th></th>`
  for (const name of cols) {
    const pp = result.totals.perProvider.find(x => x.name === name)
    html += `<th>${name}<br><span class="region">${pp.region}</span></th>`
  }
  html += `<th>${t('businessCloud')}<br><span class="region">${t('bcModel')}</span></th>`
  html += '</tr></thead><tbody>'

  html += `<tr class="section-divider"><th colspan="${2 + cols.length}">${t('modeTopology')}</th></tr>`

  const cell = (iaasHtml, paasHtml) => {
    let s = '<td class="plan-cell">'
    s += `<div class="cell-line"><span class="cell-tag">${t('iaasTag')}</span>${iaasHtml}</div>`
    s += paasHtml
    s += '</td>'
    return s
  }

  for (const node of result.perNode) {
    const specs = `${node.cpuGHz} GHz · ${node.ramGB} GB RAM · ${node.diskGB} GB (${esc(node.diskTierLabel)})`
    html += `<tr>`
    html += `<td class="tier-name"><div class="tier-label">${esc(node.name)}</div><div class="cell-specs">${specs}</div></td>`
    for (const name of cols) {
      const pid = result.totals.perProvider.find(x => x.name === name).id
      const hs = node.hyperscalers[pid]
      const q = node.paas[pid]
      const iaas = hs
        ? `<span class="cell-price">${formatPrice(hs.total, currency)}</span></div><div class="cell-meta">${t('matching', esc(hs.instance), hs.vcpu, hs.ramGiB)}</div>`
        : `—</div>`
      const paas = q
        ? `<div class="cell-line"><span class="cell-tag">${t('paasTag')}</span><span class="cell-price">${formatPrice(q.total, currency)}</span></div><div class="cell-meta">${esc(t('paasMatching', q.note, q.count))}</div>`
        : ''
      html += cell(iaas, paas)
    }
    const qt = node.paas.tcloud
    const bcIaaS = `<span class="cell-price">${formatPrice(node.businessCloud.total, currency)}</span></div><div class="cell-meta">${t('bcModel')}</div>`
    const bcPaaS = qt
      ? `<div class="cell-line"><span class="cell-tag">${t('paasTag')}</span><span class="cell-price">${formatPrice(qt.total, currency)}</span></div><div class="cell-meta">${esc(t('paasMatching', qt.note, qt.count))}${qt.utilizationPct != null ? ` · ${qt.utilizationPct} %` : ''}</div>`
      : ''
    html += cell(bcIaaS, bcPaaS)
    html += '</tr>'
  }

  html += `<tr class="total-row">`
  html += `<td class="tier-name"><strong>${t('totalRow')}</strong></td>`
  for (const pp of result.totals.perProvider) {
    const saving = t('savingPct', pp.savingPct)
    const q = result.totals.paas[pp.id]
    const iaas = `<span class="cell-price">${formatPrice(pp.total, currency)}</span></div><div class="${pp.savingPct >= 0 ? 'badge badge-save' : 'badge badge-more'}">${saving}</div>`
    const paas = q
      ? `<div class="cell-line"><span class="cell-tag">${t('paasTag')}</span><span class="cell-price">${formatPrice(q.total, currency)}</span></div>`
      : ''
    html += cell(iaas, paas)
  }
  const bc = result.totals.businessCloud
  const bcTotalCZK = result.totals.paas.tcloud
  html += cell(`<span class="cell-price">${formatPrice(bc.total, currency)}</span></div>`, bcTotalCZK
    ? `<div class="cell-line"><span class="cell-tag">${t('paasTag')}</span><span class="cell-price">${formatPrice(bcTotalCZK.total, currency)}</span></div>`
    : '')
  html += '</tr>'

  html += '</tbody></table></div>'
  document.getElementById('topologyResults').innerHTML = html
}

function handleTopologyFile(file) {
  const reader = new FileReader()
  reader.onload = async () => {
    try {
      const topology = JSON.parse(reader.result)
      const result = await priceTopology(topology)
      renderTopology(result)
    } catch (e) {
      alert(e.message)
    }
  }
  reader.readAsText(file)
}

async function loadSampleTopology() {
  try {
    const sample = await fetch(BP + '/api/topology/sample').then(r => r.json())
    const result = await priceTopology(sample)
    renderTopology(result)
  } catch (e) {
    alert(e.message)
  }
}

// ---- Sources & methodology ----

async function loadMethodology() {
  const el = document.getElementById('instanceTables')
  if (!el) return
  try {
    methodologyData = await fetch(BP + '/api/catalog').then(r => r.json())
  } catch (e) {
    return
  }
  const r = methodologyData.rates || {}
  if (r.CZK) document.getElementById('rateCZK').value = r.CZK
  if (r.EUR) document.getElementById('rateEUR').value = r.EUR
  renderMethodology()
}

function renderMethodology() {
  const rateEl = document.getElementById('bcRateTable')
  const instEl = document.getElementById('instanceTables')
  if (!methodologyData || !rateEl || !instEl) return
  const t = i18n.t
  const cur = document.getElementById('currency').value
  const bc = methodologyData.businessCloud
  const hours = methodologyData.hoursPerMonth || 730
  const cmLabel = (cm) => cm === 0 ? t('noCommitment') : cm + ' m.'
  const money = (v, from = 'CZK', decimals = 2) => formatMoney(convertMoney(v, from, cur), cur, decimals)
  const tierRate = (tier, cm) => (bc.diskTiers[tier] && bc.diskTiers[tier].rates[cm] != null) ? bc.diskTiers[tier].rates[cm] : null

  rateEl.innerHTML = `<table class="rate-table"><thead><tr>
    <th>${t('rateCommitment')}</th>
    <th>${t('rateCpu', cur)}</th>
    <th>${t('rateRam', cur)}</th>
    <th>${t('diskSuperFast')}</th>
    <th>${t('diskFast')}</th>
    <th>${t('diskStandard')}</th>
    <th>${t('diskBasic')}</th>
  </tr></thead><tbody>${bc.commitments.map(cm => `<tr>
    <td><strong>${cmLabel(cm)}</strong></td>
    <td>${money(bc.cpu[cm])}</td>
    <td>${money(bc.ram[cm])}</td>
    <td>${tierRate('superfast', cm) != null ? money(tierRate('superfast', cm)) : ''}</td>
    <td>${tierRate('fast', cm) != null ? money(tierRate('fast', cm)) : ''}</td>
    <td>${tierRate('standard', cm) != null ? money(tierRate('standard', cm)) : ''}</td>
    <td>${tierRate('basic', cm) != null ? money(tierRate('basic', cm)) : ''}</td>
  </tr>`).join('')}</tbody></table>`

  const providers = methodologyData.providers
  const bcStorageRow = `<tr><td><strong>${esc(`${t('businessCloud')} (${cmLabel(36)})`)}</strong></td>${
    ['superfast', 'fast', 'standard', 'basic'].map(tier => `<td>${money(bc.diskTiers[tier].rates[36])}</td>`).join('')
  }</tr>`
  const storageRows = Object.entries(methodologyData.storage).map(([pid, s]) => {
    const name = providers[pid] ? providers[pid].name : pid
    const cell = (v) => formatMoney(convertMoney(v, 'USD', cur), cur, 2)
    return `<tr><td><strong>${esc(name)}</strong></td><td>${cell(s.superfast)}</td><td>${cell(s.fast)}</td><td>${cell(s.standard)}</td><td>${cell(s.basic)}</td></tr>`
  }).join('')

  const tables = Object.values(providers).map(prov => {
    const rows = prov.instances.map(i => `<tr><td>${esc(i.type)}</td><td>${i.vcpu}</td><td>${i.ramGiB}</td><td>${formatMoney(convertMoney(i.usdPerHour * hours, 'USD', cur), cur, 0)}</td></tr>`).join('')
    return `<div class="inst-block"><h6>${esc(prov.name)} – ${esc(prov.region)}</h6>
      <table class="rate-table"><thead><tr><th>${t('colInstance')}</th><th>${t('colVcpu')}</th><th>${t('colRam')}</th><th>${t('colInstancePrice', cur)}</th></tr></thead><tbody>${rows}</tbody></table></div>`
  }).join('')

  instEl.innerHTML = `<div class="inst-block"><h6>${t('storageRates', cur)}</h6>
    <table class="rate-table"><thead><tr><th></th><th>Super Fast</th><th>Fast</th><th>Standard</th><th>Basic</th></tr></thead><tbody>${bcStorageRow}${storageRows}</tbody></table></div>${tables}`
}

function updateTierSpecs(sel) {
  const row = sel.closest('tr')
  const opt = sel.options[sel.selectedIndex]
  if (!opt) return
  const specs = row.querySelector('.tier-specs')
  if (specs) {
    specs.innerHTML = ''
  }
}

function updateRowPrices(sel) {
  const row = sel.closest('tr')
  const selectedTierId = sel.value
  ;[...row.querySelectorAll('.plan-cell')].forEach(cell => {
    const provider = cell.dataset.provider
    const tierInfo = priceByTier[provider] && priceByTier[provider][selectedTierId.toLowerCase()]
    if (!tierInfo) {
      cell.querySelector('.cell-price').textContent = '—'
      const meta = cell.querySelector('.cell-meta')
      if (meta) meta.innerHTML = ''
      cell.dataset.price = '0'
      return
    }
    const tCurrency = tierInfo.currency || lastCurrency
    cell.dataset.price = tierInfo.pricePerMonth
    cell.dataset.currency = tCurrency
    cell.querySelector('.cell-price').textContent = formatPrice(tierInfo.pricePerMonth, tCurrency)
    const meta = cell.querySelector('.cell-meta')
    if (meta) {
      const badge = tierInfo.note ? `<span class="badge">${esc(tierInfo.note)}</span>` : ''
      const instances = tierInfo.maxInstances > 0
        ? `<span class="instances">${i18n.t('upTo')} ${tierInfo.maxInstances}×</span>`
        : `<span class="instances instances--zero">${i18n.t('overBudget')}</span>`
      meta.innerHTML = `${instances} ${badge}`
    }
  })
  updateTotal()
}

function applySelection() {
  document.querySelectorAll('.plan-cell').forEach(cell => {
    const key = cell.dataset.key
    const checked = selected.has(key)
    cell.classList.toggle('plan-unselected', !checked)
    const cb = cell.querySelector('.plan-check')
    if (cb) cb.checked = checked
  })
}

function updateTotal() {
  let total = 0
  let currency = ''
  let count = 0
  document.querySelectorAll('.plan-cell').forEach(cell => {
    if (selected.has(cell.dataset.key)) {
      total += parseFloat(cell.dataset.price) || 0
      currency = cell.dataset.currency || currency
      count++
    }
  })
  document.getElementById('selectionCount').textContent = i18n.t('selectedCount', count)
  document.getElementById('totalCost').textContent =
    count > 0 ? i18n.t('total', formatPrice(Math.round(total), currency)) : ''
}

document.getElementById('showSelectedOnly').addEventListener('change', () => {
  const showOnly = document.getElementById('showSelectedOnly').checked
  document.querySelectorAll('.tier-row').forEach(row => {
    const cells = row.querySelectorAll('.plan-cell')
    const any = [...cells].some(c => selected.has(c.dataset.key))
    row.style.display = showOnly && !any ? 'none' : ''
  })
})

document.getElementById('selectAllBtn').addEventListener('click', () => {
  document.querySelectorAll('.plan-cell').forEach(cell => {
    selected.add(cell.dataset.key)
  })
  applySelection()
  updateTotal()
})

document.getElementById('deselectAllBtn').addEventListener('click', () => {
  selected.clear()
  applySelection()
  updateTotal()
})

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('utilization').value = String(DEFAULT_UTILIZATION)
  document.getElementById('utilization').addEventListener('change', () => {
    fetchAdvice()
    if (lastTopologyResult) priceTopology(lastTopologyInput).catch(() => {})
  })
  document.getElementById('commitment').addEventListener('change', () => {
    if (lastTopologyResult) priceTopology(lastTopologyInput).catch(() => {})
  })
  const rerates = () => {
    renderMethodology()
    fetchAdvice()
    if (lastTopologyResult) priceTopology(lastTopologyInput).catch(() => {})
  }
  document.getElementById('rateCZK').addEventListener('change', rerates)
  document.getElementById('rateEUR').addEventListener('change', rerates)
  document.getElementById('currency').addEventListener('change', () => {
    renderMethodology()
    if (lastTopologyResult) {
      priceTopology(lastTopologyInput).catch(() => {})
    }
  })
  document.getElementById('ulTopoBtn').addEventListener('click', () => document.getElementById('ulTopoFile').click())
  document.getElementById('ulTopoFile').addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) handleTopologyFile(e.target.files[0])
    e.target.value = ''
  })
  document.getElementById('loadSampleBtn').addEventListener('click', loadSampleTopology)
  await loadTiers()
  await loadMethodology()
  fetchAdvice()
})

i18n.onLangChange.push(() => {
  renderMethodology()
  if (document.getElementById('providers').innerHTML) {
    updateTotal()
    fetchAdvice()
  }
  if (lastTopologyResult) {
    renderTopology(lastTopologyResult)
  }
})
