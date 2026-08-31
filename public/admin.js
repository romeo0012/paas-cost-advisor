const BP = window.BASE_PATH || ''
async function api(path, opts = {}) {
  const res = await fetch(BP + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}

let providers = []
let selectedId = null
let tiers = []

function toast(msg, err) {
  const el = document.getElementById('toast')
  el.textContent = msg
  el.className = 'toast visible' + (err ? ' toast--err' : '')
  setTimeout(() => el.className = 'toast', 2500)
}

async function loadProviders() {
  providers = await api('/api/admin/providers')
  const sel = document.getElementById('adminProvider')
  sel.innerHTML = providers.map(p =>
    `<option value="${p.id}">${p.name} (${i18n.t('plansCount', p.plans.length)})</option>`
  ).join('')
  if (!selectedId && providers.length) selectedId = providers[0].id
  if (selectedId) sel.value = selectedId
  renderPlans()
}

function updateRefreshBtn() {
  const prov = providers.find(p => p.id === selectedId)
  const btn = document.getElementById('refreshPricesBtn')
  if (prov && prov.pricingSource === 'auto') {
    btn.style.display = ''
  } else {
    btn.style.display = 'none'
  }
}

function esc(s) { return String(s).replace(/"/g, '&quot;').replace(/</g, '&lt;') }

function renderPlans() {
  updateRefreshBtn()
  const prov = providers.find(p => p.id === selectedId)
  const container = document.getElementById('plansList')
  if (!prov) { container.innerHTML = `<p class="empty">${i18n.t('selectProvider')}</p>`; return }

  container.innerHTML = prov.plans.map((plan, i) => {
    const matched = tiers.find(t => t.id.toLowerCase() === plan.tierId.toLowerCase())
    return `
    <div class="plan-card" data-idx="${i}">
      <div class="plan-fields">
        <label>${i18n.t('name')} <input class="f-name" value="${esc(plan.name)}"></label>
        <label>
          ${i18n.t('tier')}
          <select class="f-tier">
            ${tiers.map(t => `<option value="${esc(t.id)}" ${t.id.toLowerCase() === plan.tierId.toLowerCase() ? 'selected' : ''}>${esc(t.id)}</option>`).join('')}
          </select>
        </label>
        <label>${i18n.t('spec')} <span class="f-spec">${matched ? `${matched.cpu} / ${matched.ram} / ${matched.storage}` : '—'}</span></label>
        <label>${i18n.t('pricePerMonth')} <input class="f-price" type="number" step="0.01" value="${plan.pricePerMonth}"></label>
        <label>
          ${i18n.t('currencySelect')}
          <select class="f-currency">
            <option value="USD" ${plan.currency === 'USD' ? 'selected' : ''}>USD</option>
            <option value="CZK" ${plan.currency === 'CZK' ? 'selected' : ''}>CZK</option>
            <option value="EUR" ${plan.currency === 'EUR' ? 'selected' : ''}>EUR</option>
          </select>
        </label>
        <label>${i18n.t('note')} <input class="f-note" value="${esc(plan.note || '')}"></label>
        <label class="chk-label">
          <input type="checkbox" class="f-active" ${plan.active !== false ? 'checked' : ''}>
          ${i18n.t('activeShow')}
        </label>
      </div>
      <div class="plan-actions">
        <button class="btn-save" data-idx="${i}">💾</button>
        <button class="btn-delete" data-idx="${i}">🗑</button>
      </div>
    </div>`
  }).join('')

  container.querySelectorAll('.btn-save').forEach(btn => {
    btn.addEventListener('click', () => savePlan(parseInt(btn.dataset.idx)))
  })
  container.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deletePlan(parseInt(btn.dataset.idx)))
  })
}

function getPlanFields(idx) {
  const card = document.querySelector(`.plan-card[data-idx="${idx}"]`)
  if (!card) return null
  return {
    name: card.querySelector('.f-name').value,
    tierId: card.querySelector('.f-tier').value,
    pricePerMonth: parseFloat(card.querySelector('.f-price').value) || 0,
    currency: card.querySelector('.f-currency').value,
    note: card.querySelector('.f-note').value,
    active: card.querySelector('.f-active').checked,
  }
}

async function savePlan(idx) {
  const plan = getPlanFields(idx)
  if (!plan) return
  try {
    await api(`/api/admin/plans/${selectedId}/${idx}`, {
      method: 'PUT',
      body: JSON.stringify(plan),
    })
    toast(i18n.t('planSaved'))
    await loadProviders()
  } catch (e) { toast(e.message, true) }
}

async function deletePlan(idx) {
  if (!confirm(i18n.t('deletePlanQ'))) return
  try {
    await api(`/api/admin/plans/${selectedId}/${idx}`, { method: 'DELETE' })
    toast(i18n.t('planDeleted'))
    await loadProviders()
  } catch (e) { toast(e.message, true) }
}

document.getElementById('addPlanBtn').addEventListener('click', async () => {
  const plan = {
    name: i18n.t('newPlan'),
    tierId: tiers.length ? tiers[0].id : '',
    pricePerMonth: 10,
    currency: 'CZK',
    note: '',
    active: true,
  }
  try {
    await api(`/api/admin/plans/${selectedId}`, {
      method: 'POST',
      body: JSON.stringify(plan),
    })
    toast(i18n.t('planAdded'))
    await loadProviders()
  } catch (e) { toast(e.message, true) }
})

document.getElementById('addProviderBtn').addEventListener('click', async () => {
  const id = prompt(i18n.t('providerIdPrompt'))
  if (!id) return
  const name = prompt(i18n.t('providerNamePrompt'))
  if (!name) return
  try {
    await api(`/api/admin/providers/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, region: 'Auto', plans: [] }),
    })
    providers = await api('/api/admin/providers')
    selectedId = id
    document.getElementById('adminProvider').value = id
    renderPlans()
    toast(i18n.t('providerAdded'))
  } catch (e) { toast(e.message, true) }
})

document.getElementById('saveProviderBtn').addEventListener('click', async () => {
  const name = prompt(i18n.t('providerNewName'))
  if (!name) return
  try {
    await api(`/api/admin/providers/${selectedId}`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    })
    toast(i18n.t('providerSaved'))
    await loadProviders()
  } catch (e) { toast(e.message, true) }
})

document.getElementById('refreshPricesBtn').addEventListener('click', async () => {
  const prov = providers.find(p => p.id === selectedId)
  if (!prov || prov.pricingSource !== 'auto') return
  if (!confirm(i18n.t('confirmRefresh', prov.name))) return
  const btn = document.getElementById('refreshPricesBtn')
  btn.disabled = true
  btn.textContent = i18n.t('loading')
  try {
    const results = await api(`/api/admin/refresh-prices/${selectedId}`, { method: 'POST' })
    const ok = results.filter(r => r.priceCZK !== null).length
    const failed = results.filter(r => r.priceCZK === null)
    toast(i18n.t('pricesRefreshed', ok, failed), failed.length > 0)
    await loadProviders()
  } catch (e) { toast(e.message, true) }
  btn.disabled = false
  btn.textContent = i18n.t('refreshBtn')
})

document.getElementById('adminProvider').addEventListener('change', () => {
  selectedId = document.getElementById('adminProvider').value
  renderPlans()
})

async function loadTiers() {
  tiers = await api('/api/admin/tiers')
  renderPlans()
  const container = document.getElementById('tiersList')
  container.innerHTML = tiers.map((t, i) => `
    <div class="plan-card" data-tier-id="${t.id}">
      <div class="plan-fields">
        <label>${i18n.t('id')} <input class="tf-id" value="${esc(t.id)}"></label>
        <label>${i18n.t('category')}
          <select class="tf-cat">
            <option value="IaaS" ${t.category === 'IaaS' ? 'selected' : ''}>IaaS</option>
            <option value="PaaS" ${t.category === 'PaaS' ? 'selected' : ''}>PaaS</option>
          </select>
        </label>
        <label>${i18n.t('name')} <input class="tf-name" value="${esc(t.name)}"></label>
        <label>CPU <input class="tf-cpu" value="${esc(t.cpu)}"></label>
        <label>RAM <input class="tf-ram" value="${esc(t.ram)}"></label>
        <label>${i18n.t('storage')} <input class="tf-storage" value="${esc(t.storage)}"></label>
      </div>
      <div class="plan-actions">
        <button class="tier-save" data-id="${t.id}">💾</button>
        <button class="tier-delete" data-id="${t.id}">🗑</button>
      </div>
    </div>
  `).join('')

  container.querySelectorAll('.tier-save').forEach(btn => {
    btn.addEventListener('click', () => saveTier(btn.dataset.id))
  })
  container.querySelectorAll('.tier-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteTier(btn.dataset.id))
  })
}

function getTierFields(id) {
  const card = document.querySelector(`.plan-card[data-tier-id="${id}"]`)
  if (!card) return null
  return {
    id: card.querySelector('.tf-id').value,
    category: card.querySelector('.tf-cat').value,
    name: card.querySelector('.tf-name').value,
    cpu: card.querySelector('.tf-cpu').value,
    ram: card.querySelector('.tf-ram').value,
    storage: card.querySelector('.tf-storage').value,
  }
}

async function saveTier(id) {
  const data = getTierFields(id)
  if (!data) return
  try {
    await api(`/api/admin/tiers/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    toast(i18n.t('tierSaved'))
    await loadTiers()
    await loadProviders()
  } catch (e) { toast(e.message, true) }
}

async function deleteTier(id) {
  if (!confirm(i18n.t('deleteTierQ'))) return
  try {
    await api(`/api/admin/tiers/${id}`, { method: 'DELETE' })
    toast(i18n.t('tierDeleted'))
    await loadTiers()
    await loadProviders()
  } catch (e) { toast(e.message, true) }
}

document.getElementById('addTierBtn').addEventListener('click', async () => {
  const id = prompt(i18n.t('tierIdPrompt'))
  if (!id) return
  try {
    await api('/api/admin/tiers', {
      method: 'POST',
      body: JSON.stringify({ id, category: 'IaaS', name: 'Custom', cpu: '2 vCPU', ram: '4 GB', storage: '50 GB' }),
    })
    toast(i18n.t('tierAdded'))
    await loadTiers()
  } catch (e) { toast(e.message, true) }
})

loadProviders()
loadTiers()

i18n.onLangChange.push(() => {
  loadTiers()
})
