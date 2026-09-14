(function () {
  const STORAGE_KEY = 'paasLang'

  const translations = {
    cs: {
      // index.html static
      'title': 'PaaS Cost Advisor',
      'subtitle': 'Porovnej ceny PaaS řešení napříč poskytovateli',
      'adminLink': 'Správa →',
      'maxBudget': 'Maximální měsíční rozpočet:',
      'currency': 'Měna:',
      'compare': 'Porovnat',
      'utilization': 'Využití PaaS:',
      'showSelectedOnly': 'Zobrazit pouze vybrané',
      'selectAll': 'Vybrat vše',
      'deselectAll': 'Odznačit vše',
      'sources': 'Zdroje e metodika',
      'provider': 'Poskytovatel',
      'iaasBasedOn': 'IaaS vychází z',
      'paasBasedOn': 'PaaS vychází z',
      'awsIaas': 'EC2 T3 on-demand + EBS gp3 (us-east-1)',
      'awsPaas': 'Elastic Beanstalk (EC2 + ALB, bez poplatku za EB)',
      'gcpIaas': 'Compute Engine E2 on-demand + pd-ssd (us-central1)',
      'gcpPaas': 'App Engine Standard F1–F4 (730 h/měs, scale-to-zero nezapočítán)',
      'azureIaas': 'B-series VMs on-demand + managed disk (eastus)',
      'azurePaas': 'App Service Basic B1–B3 (Windows, pay-as-you-go)',
      'tcloudPrices': 'Ceny poskytnuté T-Mobile CZ (T-Cloud IaaS a PaaS ceník)',
      'notes': 'Poznámky:',
      'noteRates': 'Převodní kurzy: 1 USD = 23 CZK, 1 USD = 0,92 EUR, 1 EUR = 25 CZK.',
      'noteRound': 'U AWS/GCP/Azure jsou ceny zaokrouhleny, zahrnují compute + storage.',
      'noteGcp': 'GCP IaaS Start (e2-micro) má sdílené jádro — výkonově není srovnatelný s dedikovaným 1 vCPU.',
      'noteAppEngine': 'App Engine ceny předpokládají 730 h/měs běhu (neškálují se do nuly).',
      'noteAzure': 'Azure App Service jsou uvedeny za Windows ceny (Linux je levnější).',
      'noteDiscl': 'Ceny jsou orientační, vždy ověřte v oficiální kalkulačce providera.',
      // main.js dynamic
      'noActivePlans': 'Žádné aktivní plány.',
      'tier': 'Tier',
      'upTo': 'až',
      'overBudget': '0× (nad rozpočet)',
      'selectedCount': (n) => `${n} vybraných`,
      'total': (n) => `Celkem: ${n}`,
      // admin.html / admin.js
      'adminTitle': 'Správa',
      'backToCompare': '← Zpět na srovnání',
      'addProvider': '+ Přidat providera',
      'saveProvider': 'Uložit providera',
      'refreshCloud': '🔄 Obnovit ceny z cloudu',
      'plans': 'Plány',
      'addPlan': '+ Přidat plán',
      'tiers': 'Tiers',
      'addTier': '+ Přidat tier',
      'plansCount': (n) => `${n} plánů`,
      'selectProvider': 'Vyber providera',
      'name': 'Název',
      'tier': 'Tier',
      'spec': 'Spec',
      'pricePerMonth': 'Cena/měs',
      'currencySelect': 'Měna',
      'note': 'Poznámka',
      'activeShow': 'Aktivní (zobrazit v porovnání)',
      'newPlan': 'Nový plán',
      'id': 'ID',
      'category': 'Kategorie',
      'storage': 'Storage',
      'planSaved': 'Plán uložen',
      'planDeleted': 'Plán smazán',
      'planAdded': 'Plán přidán',
      'providerAdded': 'Provider přidán',
      'providerSaved': 'Provider uložen',
      'tierSaved': 'Tier uložen',
      'tierDeleted': 'Tier smazán',
      'tierAdded': 'Tier přidán',
      'deletePlanQ': 'Smazat tento plán?',
      'deleteTierQ': 'Smazat tento tier?',
      'providerIdPrompt': 'ID providera (např. oracle):',
      'providerNamePrompt': 'Název (např. Oracle Cloud):',
      'providerNewName': 'Nový název providera:',
      'tierIdPrompt': 'ID tieru (např. iaas-custom):',
      'confirmRefresh': (name) => `Obnovit ceny z cloudu pro ${name}?`,
      'loading': '⏳ Načítám...',
      'refreshBtn': '🔄 Obnovit ceny z cloudu',
      'pricesRefreshed': (ok, failed) => failed
        ? `Ceny obnoveny: ${ok} OK, ${failed.length} selhalo: ${failed.map(f => f.name).join(', ')}`
        : `Ceny obnoveny: ${ok} OK`,
    },
    en: {
      // index.html static
      'title': 'PaaS Cost Advisor',
      'subtitle': 'Compare PaaS pricing across providers',
      'adminLink': 'Admin →',
      'maxBudget': 'Max monthly budget:',
      'currency': 'Currency:',
      'compare': 'Compare',
      'utilization': 'PaaS utilization:',
      'showSelectedOnly': 'Show selected only',
      'selectAll': 'Select all',
      'deselectAll': 'Deselect all',
      'sources': 'Sources & methodology',
      'provider': 'Provider',
      'iaasBasedOn': 'IaaS based on',
      'paasBasedOn': 'PaaS based on',
      'awsIaas': 'EC2 T3 on-demand + EBS gp3 (us-east-1)',
      'awsPaas': 'Elastic Beanstalk (EC2 + ALB, no EB fee)',
      'gcpIaas': 'Compute Engine E2 on-demand + pd-ssd (us-central1)',
      'gcpPaas': 'App Engine Standard F1–F4 (730 h/mo, scale-to-zero not included)',
      'azureIaas': 'B-series VMs on-demand + managed disk (eastus)',
      'azurePaas': 'App Service Basic B1–B3 (Windows, pay-as-you-go)',
      'tcloudPrices': 'Prices provided by T-Mobile CZ (T-Cloud IaaS and PaaS price list)',
      'notes': 'Notes:',
      'noteRates': 'Exchange rates: 1 USD = 23 CZK, 1 USD = 0.92 EUR, 1 EUR = 25 CZK.',
      'noteRound': 'AWS/GCP/Azure prices are rounded and include compute + storage.',
      'noteGcp': 'GCP IaaS Start (e2-micro) has a shared core — not comparable in performance to a dedicated 1 vCPU.',
      'noteAppEngine': 'App Engine prices assume 730 h/mo runtime (no scale to zero).',
      'noteAzure': 'Azure App Service prices are Windows (Linux is cheaper).',
      'noteDiscl': 'Prices are indicative; always verify with the provider\'s official calculator.',
      // main.js dynamic
      'noActivePlans': 'No active plans.',
      'tier': 'Tier',
      'upTo': 'up to',
      'overBudget': '0× (over budget)',
      'selectedCount': (n) => `${n} selected`,
      'total': (n) => `Total: ${n}`,
      // admin.html / admin.js
      'adminTitle': 'Admin',
      'backToCompare': '← Back to comparison',
      'addProvider': '+ Add provider',
      'saveProvider': 'Save provider',
      'refreshCloud': '🔄 Refresh prices from cloud',
      'plans': 'Plans',
      'addPlan': '+ Add plan',
      'tiers': 'Tiers',
      'addTier': '+ Add tier',
      'plansCount': (n) => `${n} plans`,
      'selectProvider': 'Select provider',
      'name': 'Name',
      'tier': 'Tier',
      'spec': 'Spec',
      'pricePerMonth': 'Price/month',
      'currencySelect': 'Currency',
      'note': 'Note',
      'activeShow': 'Active (show in comparison)',
      'newPlan': 'New plan',
      'id': 'ID',
      'category': 'Category',
      'storage': 'Storage',
      'planSaved': 'Plan saved',
      'planDeleted': 'Plan deleted',
      'planAdded': 'Plan added',
      'providerAdded': 'Provider added',
      'providerSaved': 'Provider saved',
      'tierSaved': 'Tier saved',
      'tierDeleted': 'Tier deleted',
      'tierAdded': 'Tier added',
      'deletePlanQ': 'Delete this plan?',
      'deleteTierQ': 'Delete this tier?',
      'providerIdPrompt': 'Provider ID (e.g. oracle):',
      'providerNamePrompt': 'Name (e.g. Oracle Cloud):',
      'providerNewName': 'New provider name:',
      'tierIdPrompt': 'Tier ID (e.g. iaas-custom):',
      'confirmRefresh': (name) => `Refresh prices from cloud for ${name}?`,
      'loading': '⏳ Loading...',
      'refreshBtn': '🔄 Refresh prices from cloud',
      'pricesRefreshed': (ok, failed) => failed
        ? `Prices refreshed: ${ok} OK, ${failed.length} failed: ${failed.map(f => f.name).join(', ')}`
        : `Prices refreshed: ${ok} OK`,
    },
  }

  function getLang() {
    let lang = localStorage.getItem(STORAGE_KEY)
    if (lang !== 'cs' && lang !== 'en') lang = 'cs'
    return lang
  }

  function setLang(lang) {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.lang = lang === 'en' ? 'en' : 'cs'
    applyTranslations()
    updateFlags()
  }

  function t(key, ...args) {
    const dict = translations[getLang()] || translations.cs
    const val = dict[key] !== undefined ? dict[key] : translations.cs[key]
    return typeof val === 'function' ? val(...args) : (val !== undefined ? val : key)
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n')
      const val = t(key)
      if (typeof val === 'string') el.textContent = val
    })
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      el.placeholder = t(el.getAttribute('data-i18n-placeholder'))
    })
  }

  function updateFlags() {
    document.querySelectorAll('.flag-btn').forEach(btn => {
      const lang = btn.getAttribute('data-lang')
      const active = getLang() === lang
      btn.classList.toggle('active', active)
      btn.setAttribute('aria-pressed', active)
    })
  }

  window.i18n = { t, getLang, setLang, applyTranslations, updateFlags, onLangChange: [] }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.flag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        setLang(btn.getAttribute('data-lang'))
        window.i18n.onLangChange.forEach(fn => fn())
      })
    })
    document.documentElement.lang = getLang() === 'en' ? 'en' : 'cs'
    applyTranslations()
    updateFlags()
  })
})()
