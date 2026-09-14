const BP = window.BASE_PATH || ''
const DEFAULT_UTILIZATION = Number(window.PAAS_UTILIZATION) || 40
const socket = io({ path: BP + '/socket.io' })
const selected = new Set()
let tiers = []
let priceByTier = {} // { provider: { tierId: {price, currency, note, maxInstances} } }
let lastBudget = Infinity
let lastCurrency = 'CZK'

async function loadTiers() {
  tiers = await fetch(BP + '/api/admin/tiers').then(r => r.json())
}

function fetchAdvice() {
  const budget = document.getElementById('budget').value
  const currency = document.getElementById('currency').value
  const utilization = document.getElementById('utilization').value
  lastBudget = budget ? Number(budget) : Infinity
  lastCurrency = currency
  socket.emit('getAdvice', { maxBudget: lastBudget, currency, utilizationPct: Number(utilization) || DEFAULT_UTILIZATION }, (results) => {
    renderResults(results, currency)
  })
}

function formatPrice(amount, currency) {
  const n = Math.round(Number(amount)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  if (currency === 'CZK') return `${n} Kč`
  if (currency === 'EUR') return `${n} €`
  return `$${n}`
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

function esc(s) {
  return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;')
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
  document.getElementById('utilization').addEventListener('change', fetchAdvice)
  await loadTiers()
  fetchAdvice()
})

i18n.onLangChange.push(() => {
  if (document.getElementById('providers').innerHTML) {
    updateTotal()
    fetchAdvice()
  }
})
