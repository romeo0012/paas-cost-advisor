const plans = [
  { name: 'GCP IaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 7, currency: 'USD', note: 'e2-micro + 10 GB pd-ssd' },
  { name: 'GCP IaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 27, currency: 'USD', note: 'e2-medium + 30 GB pd-ssd' },
  { name: 'GCP IaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 54, currency: 'USD', note: 'e2-standard-2 + 60 GB pd-ssd' },
  { name: 'GCP IaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 108, currency: 'USD', note: 'e2-standard-4 + 120 GB pd-ssd' },
  { name: 'GCP PaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 37, currency: 'USD', note: 'App Engine F1 730h' },
  { name: 'GCP PaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 73, currency: 'USD', note: 'App Engine F2 730h' },
  { name: 'GCP PaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 146, currency: 'USD', note: 'App Engine F4 730h' },
  { name: 'GCP PaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 292, currency: 'USD', note: 'App Engine F4_1G 730h' },
]

function getAdvice() {
  return {
    provider: 'GCP',
    region: 'us-central1',
    plans: plans.map(p => ({ ...p, provider: 'GCP' })),
    recommendations: [],
  }
}

module.exports = { getAdvice, plans }
