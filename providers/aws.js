const plans = [
  { name: 'AWS IaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 9, currency: 'USD', note: 't3.micro + 10 GB EBS gp3' },
  { name: 'AWS IaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 33, currency: 'USD', note: 't3.medium + 30 GB EBS gp3' },
  { name: 'AWS IaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 66, currency: 'USD', note: 't3.xlarge + 60 GB EBS gp3' },
  { name: 'AWS IaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 131, currency: 'USD', note: 't3.2xlarge + 120 GB EBS gp3' },
  { name: 'AWS PaaS (Start)', cpu: '1 vCPU', ram: '1 GB', storage: '10 GB SSD', pricePerMonth: 24, currency: 'USD', note: 'EB t3.micro + ALB' },
  { name: 'AWS PaaS (Standard)', cpu: '2 vCPU', ram: '4 GB', storage: '30 GB SSD', pricePerMonth: 54, currency: 'USD', note: 'EB t3.medium + ALB' },
  { name: 'AWS PaaS (Premium)', cpu: '4 vCPU', ram: '8 GB', storage: '60 GB SSD', pricePerMonth: 87, currency: 'USD', note: 'EB t3.xlarge + ALB' },
  { name: 'AWS PaaS (Enterprise)', cpu: '8 vCPU', ram: '16 GB', storage: '120 GB SSD', pricePerMonth: 152, currency: 'USD', note: 'EB t3.2xlarge + ALB' },
]

function getAdvice() {
  return {
    provider: 'AWS',
    region: 'us-east-1',
    plans: plans.map(p => ({ ...p, provider: 'AWS' })),
    recommendations: [],
  }
}

module.exports = { getAdvice, plans }
