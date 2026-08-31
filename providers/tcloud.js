const plans = [
  { name: 'T-Cloud IaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 157, currency: 'CZK' },
  { name: 'T-Cloud IaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 597, currency: 'CZK' },
  { name: 'T-Cloud IaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 795, currency: 'CZK' },
  { name: 'T-Cloud IaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 1590, currency: 'CZK' },
  { name: 'T-Cloud PaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 1059, currency: 'CZK' },
  { name: 'T-Cloud PaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 4516, currency: 'CZK' },
  { name: 'T-Cloud PaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 8922, currency: 'CZK' },
  { name: 'T-Cloud PaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 17476, currency: 'CZK' },
]

function getAdvice() {
  return {
    provider: 'T-Cloud',
    region: 'Czech Republic',
    plans: plans.map(p => ({ ...p, provider: 'T-Cloud' })),
    recommendations: [],
  }
}

module.exports = { getAdvice, plans }
