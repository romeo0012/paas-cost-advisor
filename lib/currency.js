const RATES = { USD: 1, CZK: 23, EUR: 0.92 }

// `rates` optionally overrides the default RATES (e.g. user-edited kurs).
function convert(amount, from, to, rates) {
  if (!amount || from === to) return amount
  const r = rates || RATES
  const inUsd = from === 'USD' ? amount : amount / (r[from] || RATES[from])
  return Math.round((to === 'USD' ? inUsd : inUsd * (r[to] || RATES[to])) * 100) / 100
}

function format(amount, currency) {
  if (currency === 'CZK') return `${amount} Kč`
  if (currency === 'EUR') return `${amount} €`
  return `$${amount}`
}

module.exports = { convert, format, RATES }
