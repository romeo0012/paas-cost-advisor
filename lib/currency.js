const RATES = { USD: 1, CZK: 23, EUR: 0.92 }

function convert(amount, from, to) {
  if (!amount || from === to) return amount
  const inUsd = from === 'USD' ? amount : amount / RATES[from]
  return Math.round((to === 'USD' ? inUsd : inUsd * RATES[to]) * 100) / 100
}

function format(amount, currency) {
  if (currency === 'CZK') return `${amount} Kč`
  if (currency === 'EUR') return `${amount} €`
  return `$${amount}`
}

module.exports = { convert, format, RATES }
