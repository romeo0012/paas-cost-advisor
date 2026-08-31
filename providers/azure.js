const plans = [
  { name: 'Azure IaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 9, currency: 'USD', note: 'B1s + 10 GB SSD managed' },
  { name: 'Azure IaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 32, currency: 'USD', note: 'B2s + 30 GB SSD managed' },
  { name: 'Azure IaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 65, currency: 'USD', note: 'B4als_v2 + 60 GB SSD managed' },
  { name: 'Azure IaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 130, currency: 'USD', note: 'B8als_v2 + 120 GB SSD managed' },
  { name: 'Azure PaaS (Start)', cpu: '1 vCPU', ram: '1.75 GB', storage: '10 GB SSD', pricePerMonth: 54, currency: 'USD', note: 'App Service B1 Windows' },
  { name: 'Azure PaaS (Standard)', cpu: '2 vCPU', ram: '3.5 GB', storage: '30 GB SSD', pricePerMonth: 110, currency: 'USD', note: 'App Service B2 Windows' },
  { name: 'Azure PaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 219, currency: 'USD', note: 'App Service B3 Windows' },
  { name: 'Azure PaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 438, currency: 'USD', note: 'App Service 2×B3' },
]

function getAdvice() {
  return {
    provider: 'Azure',
    region: 'eastus',
    plans: plans.map(p => ({ ...p, provider: 'Azure' })),
    recommendations: [],
  }
}

module.exports = { getAdvice, plans }
