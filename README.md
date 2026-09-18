# PaaS Cost Advisor

Porovnává měsíční ceny PaaS/IaaS variant mezi **AWS**, **GCP**, **Azure** a **T-Cloud (Business Cloud)**.
Dvě režimy:

1. **Ceníkové tiery** – Start / Standard / Premium / Enterprise pro IaaS i PaaS (data v `data/providers.json`, `data/tiers.json`).
2. **Porovnání podle topologie** – nahraj JSON topologie (export z `iaas-api-mgmt`) a nástroj ocení každé VM zvlášť proti Business Cloud Resource Poolu a proti nejlevnějším instancím AWS/GCP/Azure (+ PaaS varianty EB / App Engine / App Service / T-Cloud PaaS).

## Spuštění

```bash
npm ci && npm start
# http://localhost:3000  (PORT, BASE_PATH, PAAS_UTILIZATION viz .env.example)
```

## Cenotvorba

### Převod měn

Základní měna je USD. Kurzy v `lib/currency.js`: **1 USD = 23 CZK**, **1 USD = 0,92 EUR**. Všechny ceny se zobrazují ve zvolené měně.

### Business Cloud (T-Cloud) – IaaS Resource Pool

Cena se počítá za celou architekturu jako sdílený pool (ne per-VM):

```
celkem = Σ CPU GHz × sazba CPU
       + Σ RAM GB × sazba RAM
       + Σ disk GB × sazba podle tieru daného VM
       + 2 × Σ disk GB × sazba zálohy
       + public IP (jen když je v topologii opnsense)
```

- **CPU se účtuje za celkové GHz zaokrouhlené NAHORU** na celé číslo (např. 36,8 → 37). Per-node řádky zůstávají přesné.
- **Remote backup** = 0,68 Kč/GB/měs, vždy na **2× celkový disk**.
- **Public IP** = 108 Kč/měs, jen pokud topologie obsahuje firewall ve skupině `opnsense`.
- Každé VM má vlastní **disk tier** (Super Fast / Fast / Standard / Basic).

Sazby podle délky závazku (`lib/businesscloud.js`):

| Závazek | CPU (Kč/GHz/měs) | RAM (Kč/GB/měs) | Super Fast | Fast | Standard | Basic |
|---|---|---|---|---|---|---|
| bez závazku (0) | 157,06 | 68,33 | 4,55 | 2,60 | 1,95 | 1,30 |
| 12 měsíců | 108,73 | 47,30 | 3,15 | 1,80 | 1,35 | 0,90 |
| 24 měsíců | 102,69 | 44,68 | 2,98 | 1,70 | 1,28 | 0,85 |
| 36 měsíců | 96,65 | 42,05 | 2,80 | 1,60 | 1,20 | 0,80 |

Disk = Kč/GB/měs. Env override (platí **jen pro závazek 12**): `IaaS_CPU_RATE_CZK_GHZ`, `IaaS_RAM_RATE_CZK_GB`, `IaaS_DISK_RATE_CZK_GB`, `IaaS_PUBLIC_IP_RATE_CZK`, `IaaS_REMOTE_BACKUP_RATE_CZK`.

### AWS / GCP / Azure – IaaS (per-VM matching)

Pro každé VM z topologie se vybere **nejlevnější instance**, která splní vCPU i RAM:

```
vCPU = max(1, ceil(cpuGHz / GHZ_PER_VCPU))   # GHZ_PER_VCPU = 2,6 (env TOPO_GHZ_PER_VCPU)
RAM  = max(1, ceil(ramGB))
cena = usdPerHour × 730 h + diskGB × sazba storage[provider][diskTier]
```

Sazby storage (USD/GB/měs): AWS 0,08 (basic 0,10), GCP 0,17 (basic 0,04), Azure 0,08 (basic 0,04).
Hodnoty drží `data/instances.json` (`hoursPerMonth: 730`).

### PaaS varianty (Elastic Beanstalk / App Engine / App Service / T-Cloud PaaS)

Pro PaaS se každé VM namapuje na nejmenší tier (`data/tiers.json`), který splní vCPU/RAM; když žádný nestačí, použije se největší plán × počet instancí.

| PaaS tier | vCPU | RAM |
|---|---|---|
| Start | 1 | 2 GB |
| Standard | 2 | 4 GB |
| Premium | 4 | 8 GB |
| Enterprise | 8 | 16 GB |

Cena = cena plánu daného poskytovatele z `data/providers.json` (např. `EB t3.xlarge + ALB`, `App Engine F4 730h`, `App Service B3 Windows`).

- **T-Cloud PaaS se násobí využitím** (`utilizationPct / 100`, výchozí **40 %** dle `PAAS_UTILIZATION` / přepínače „Využití PaaS“).
- PaaS u AWS/GCP/Azure se v topologii počítá v plné ceně.

### Ceníkové tiery

Ceny plánů jsou v `data/providers.json` (měna CZK); specifikace tierů v `data/tiers.json`. V tomto režimu se **PaaS cena všech poskytovatelů násobí využitím** (`providers/index.js` → `getAdvice`, výchozí 40 %).

## Dostupné instance

Zdroj: `data/instances.json`. Páruje se nejlevnější vyhovující instance (on-demand, ceny USD/hod). Web i README sekce „Zdroje a metodika“ zobrazují **měsíční cenu (USD/hod × 730) převedenou do zvolené měny**.

### Obnova cen z cloudu (admin)

Tlačítko **„🔄 Obnovit ceny z cloudu“** v adminu (`POST /api/admin/refresh-prices/:providerId`) obnoví **ceny plánů** (`data/providers.json`) i **aktuální ceny instancí** (`data/instances.json`) daného poskytovatele. Specifikace instancí (vCPU/RAM) se nemění, aktualizuje se jen `usdPerHour`.

| Poskytovatel | Zdroj cen | Logika |
|---|---|---|
| **AWS** | EC2 on-demand index (`pricing.us-east-1.amazonaws.com`) | Pro daný region se najde nejlepší on-demand SKU instance (Linux, Shared tenancy, OnDemand) a vezme jeho hodinová cena. Index se cachuje 10 minut (velký soubor). |
| **Azure** | Retail Prices API (`prices.azure.com`) | Vytáhne se SKU dle `armSkuName='Standard_<typ>'` (fallback na `skuName` s podtržítky → mezery); vybere se položka `Consumption`, product `Virtual Machines`, bez Windows a bez Spot/Low Priority, hodinová cena. |
| **GCP** | Cloud Billing Catalog API | Cena e2 instance se **spočítá** ze dvou regionálních SKU (viz níže). Vyžaduje `GCP_API_KEY` v `.env` – bez klíče se GCP katalog přeskočí. |

**GCP logika** (Compute Engine, service id `6F81-5844-456A`, paginace přes `pageToken`, měna USD):

```
cena = účetní_vCPU × core  +  ramGiB × ram

core = SKU "E2 Instance Core running in ..." s serviceRegions = <region>  (USD za vCPU / h)
ram  = SKU "E2 Instance Ram running in ..."  s serviceRegions = <region>  (USD za GiB / h)
```

Shared-core typy se účtují jen zlomkem vCPU (RAM celá): `e2-micro` = **0,25** vCPU, `e2-small` = **0,5** vCPU, `e2-medium` = **1,0** vCPU. Ostatní e2 typy používají plný `vcpu` z katalogu. Příklad (region `us-central1`): `e2-standard-2` = 2 × core + 8 × ram.

### Předpoklady k instancím

**Měsíční cena = hodinová cena × 730 h.** Všechny instance: **Linux, on-demand, bez DPH, bez disků (jen compute), bez veřejné IP, bez datového přenosu**. Ceny se liší **OS a regionem** (uvedené regiony: AWS `us-east-1`, GCP `us-central1`, Azure `eastus`). AWS účtuje EC2 po instance-hours a samostatně **EBS, veřejné IPv4 adresy a datový přenos** ([AWS EC2 pricing](https://aws.amazon.com/ec2/pricing/on-demand/)); Azure má samostatný ceník **Managed Disks** ([Azure Managed Disks pricing](https://azure.microsoft.com/en-us/pricing/details/managed-disks/)). Tabulky jsou tedy **orientační kalkulace compute + raw storage**, ne oficiální nabídka.

### AWS – us-east-1

| Instance | vCPU | RAM (GiB) | USD/h |
|---|---:|---:|---:|
| t3.micro | 2 | 1 | 0,0096 |
| t3.small | 2 | 2 | 0,0208 |
| t3.medium | 2 | 4 | 0,0416 |
| t3.large | 2 | 8 | 0,0832 |
| t3.xlarge | 4 | 16 | 0,1664 |
| t3.2xlarge | 8 | 32 | 0,3328 |
| m5.large | 2 | 8 | 0,0960 |
| m5.xlarge | 4 | 16 | 0,1920 |
| m5.2xlarge | 8 | 32 | 0,3840 |
| m5.4xlarge | 16 | 64 | 0,7680 |
| m5.8xlarge | 32 | 128 | 1,5360 |
| m5.16xlarge | 64 | 256 | 3,0720 |
| m5.24xlarge | 96 | 384 | 4,6080 |
| c5.large | 2 | 4 | 0,0850 |
| c5.xlarge | 4 | 8 | 0,1700 |
| c5.2xlarge | 8 | 16 | 0,3400 |
| c5.4xlarge | 16 | 32 | 0,6800 |
| c5.9xlarge | 36 | 72 | 1,5300 |
| r5.xlarge | 4 | 32 | 0,2520 |
| r5.2xlarge | 8 | 64 | 0,5040 |
| r5.4xlarge | 16 | 128 | 1,0080 |
| r5.8xlarge | 32 | 256 | 2,0160 |

### GCP – us-central1

| Instance | vCPU | RAM (GiB) | USD/h |
|---|---:|---:|---:|
| e2-micro | 1 | 1 | 0,0085 |
| e2-small | 2 | 2 | 0,0168 |
| e2-medium | 2 | 4 | 0,0335 |
| e2-standard-2 | 2 | 8 | 0,0670 |
| e2-standard-4 | 4 | 16 | 0,1340 |
| e2-standard-8 | 8 | 32 | 0,2680 |
| e2-standard-16 | 16 | 64 | 0,5360 |
| e2-standard-32 | 32 | 128 | 1,0720 |
| e2-highmem-2 | 2 | 16 | 0,0808 |
| e2-highmem-4 | 4 | 32 | 0,1616 |
| e2-highmem-8 | 8 | 64 | 0,3232 |
| e2-highmem-16 | 16 | 128 | 0,6464 |
| e2-highcpu-2 | 2 | 2 | 0,0416 |
| e2-highcpu-4 | 4 | 4 | 0,0832 |
| e2-highcpu-8 | 8 | 8 | 0,1664 |

### Azure – eastus

| Instance | vCPU | RAM (GiB) | USD/h |
|---|---:|---:|---:|
| B1s | 1 | 1 | 0,0126 |
| B1ms | 1 | 2 | 0,0252 |
| B2s | 2 | 4 | 0,0504 |
| B2ms | 2 | 8 | 0,1008 |
| B4ms | 4 | 16 | 0,2016 |
| B8ms | 8 | 32 | 0,4032 |
| B12ms | 12 | 48 | 0,6526 |
| B16ms | 16 | 64 | 0,8702 |
| B20ms | 20 | 80 | 1,0877 |
| D2as_v5 | 2 | 8 | 0,0960 |
| D4as_v5 | 4 | 16 | 0,1920 |
| D8as_v5 | 8 | 32 | 0,3840 |
| D16as_v5 | 16 | 64 | 0,7680 |
| D32as_v5 | 32 | 128 | 1,5360 |
| F4s_v2 | 4 | 8 | 0,2154 |
| F8s_v2 | 8 | 16 | 0,4308 |
| E4as_v5 | 4 | 32 | 0,2520 |
| E8as_v5 | 8 | 64 | 0,5040 |
| E16as_v5 | 16 | 128 | 1,0080 |

### Storage disků (Kč/GB/měs bez DPH, kurz 1 USD = 23 Kč)

| Provider | Super Fast | Fast | Standard | Basic |
|---|---:|---:|---:|---:|
| AWS | 1,84 | 1,84 | 1,84 | 2,30 |
| GCP | 3,91 | 3,91 | 3,91 | 0,92 |
| Azure | 1,84 | 1,84 | 1,84 | 0,92 |

Reálné diskové typy (mapování vnitřních tierů): **AWS** `gp3` (Super Fast, Fast, Standard) a `gp2` (Basic); **GCP** `pd-ssd` (Super Fast, Fast, Standard) a `pd-standard` (Basic); **Azure** `Premium SSD` (Super Fast, Fast), `Standard SSD` (Standard), `Standard HDD` (Basic).

Ceny storage **nejsou přímo srovnatelné napříč cloudy**: AWS může účtovat také **IOPS a throughput**, Azure účtuje **předdefinované velikosti disků** (ne přesně za každý GB), GCP rozlišuje **typ disku, region a provisionovanou kapacitu**. Nezahrnuto: snapshoty, zálohy, I/O operace, veřejné IP, datový přenos ani DPH. Kurz viz „Převod měn“.

## API

- `GET /api/plans?currency=` – ceníkové plány
- `POST /api/advice` – `{ maxBudget, currency, utilizationPct }` → doporučení podle tierů
- `GET /api/topology/sample` – vzorová topologie
- `POST /api/topology/price` – `{ topology, currency, utilizationPct }` → ocenění topologie
- `GET|PUT|POST|DELETE /api/admin/...` – správa plánů, tierů a providerů (admin UI)
- Socket.IO `getAdvice` (a `recalc` na klientu) – stejné doporučení přes websocket
