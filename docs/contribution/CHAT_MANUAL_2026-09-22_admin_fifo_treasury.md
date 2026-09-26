# Manual — Admin FIFO & GENERAL_POOL Treasury UI

**تاریخ چت:** ۱۴۰۵/۰۶/۳۱ · **2026-09-22**  
**برنچ:** `feature/contribution-ledger`  
**محدوده:** فقط کارهای موفق این جلسه (از ابتدا تا انتها)

---

## نقطه شروع → نقطه پایان

| | |
|---|---|
| **شروع** | فرض اشتباه «GENERAL_POOL در Projects.json نیست» + هدر FIFO با بیضی مرحله‌۱ و بدون اطلاعات خزانه |
| **پایان** | تأیید وجود خزانه عمومی روی هر دو شبکه + پنل موجودی زنجیره‌ای در ادمین + جدول همه واریزی‌های ایندکس‌شده |

---

## گام ۱ — تأیید وجود خزانه `GENERAL_POOL`

**هدف:** مشخص شود آیا باید آدرس جدید ساخته شود یا از قبل ثبت شده.

**نتیجه موفق:** entry در `frontend/data/Projects.json` وجود دارد.

| فیلد | مقدار (در زمان چت) |
|------|---------------------|
| `ProjectID` | `GENERAL_POOL` |
| نام پروژه | خزانه عمومی |
| `targetAmount(USDT)` | `0` (open pool) |
| **polygon_amoy** | `0xf0A747a45576c37a959078D688d4ad6044E9Ca76` |
| **tron_nile** | آدرس ثبت‌شده در `funds.tron_nile.address` |

ثابت در ایندکسر:

```js
export const GENERAL_PROJECT_ID = 'GENERAL_POOL';
```

**پیامد معماری:** Indexer pure می‌ماند؛ واریزی به آدرس‌های `GENERAL_POOL` وارد ledger و صف FIFO می‌شود. Vote Preference ≠ Financial Allocation.

---

## گام ۲ — جایگزینی بیضی مرحله‌۱ با اطلاعات خزانه در ادمین

**صفحه:** `Admin/index.html` → بخش `section-pre-vote` (منوی «صف FIFO»)

**قبل:** `div.workflow-step` (بیضی «۱ · آماده‌سازی»)

**بعد:** پنل `#generalPoolTreasuryInfo` داخل همان `workflow-hero`

ساختار HTML موفق:

```html
<section id="section-pre-vote" class="section" style="display:none;">
  <div class="workflow-hero">
    <div>
      <span class="workflow-kicker">خزانه عمومی · GENERAL_POOL</span>
      <h2>صف FIFO</h2>
      <p>موجودی واریزی‌ها و صف تخصیص خزانه عمومی روی همه شبکه‌ها.</p>
    </div>
    <div id="generalPoolTreasuryInfo" class="treasury-info-panel">
      <div class="treasury-info-loading muted">در حال بارگذاری اطلاعات خزانه…</div>
    </div>
  </div>
  <!-- ... -->
</section>
```

استایل کلیدی (کلاس‌های پنل):

```css
.treasury-info-panel{min-width:240px;max-width:360px;background:#fff;border:1px solid #dce7e2;border-radius:14px;padding:12px 14px;font-size:12px;line-height:1.55}
.treasury-info-panel .ti-title{font-weight:700;color:#13866f;margin-bottom:6px;font-size:13px}
.treasury-info-panel .ti-row{display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px dashed #e8eef0}
.treasury-info-panel .ti-net{font-weight:600;color:#2c3e50}
.treasury-info-panel .ti-addr{font-family:ui-monospace,monospace;font-size:11px;color:#5a6570;direction:ltr;text-align:left}
.treasury-info-panel .ti-bal{font-weight:800;color:#167b67;font-size:14px}
.treasury-info-panel .ti-meta{color:#89929a;font-size:11px;margin-top:6px}
```

فراخوانی هنگام باز شدن تب:

```js
import { loadQueue, loadGeneralPoolTreasuryInfo } from './js/community.js';
// ...
if (section === 'pre-vote') {
  loadGeneralPoolTreasuryInfo();
  loadQueue();
  loadVotingRounds();
}
```

---

## گام ۳ — تشخیص علت موجودی ۰ در ادمین در برابر عدد صفحه مشارکت

| صفحه | منبع داده | چرا عدد فرق داشت |
|------|-----------|------------------|
| `frontend` donate | زنجیره: `ClassChainRaisedReader.getProjectRaisedUSDT` (`balanceOf` USDT) | موجودی واقعی روی شبکه |
| ادمین FIFO (نسخه اول) | دفترکل: `GET /api/contributors` → جمع `unallocated` | ledger خالی بود → ۰ |

API مفید برای واریزی‌های ایندکس‌شده:

```http
GET /api/transfers?projectId=GENERAL_POOL
```

(و در صورت نیاز: `GET /api/sync-status` برای وضعیت scan هر treasury)

---

## گام ۴ — موجودی درست + همه واریزی‌ها روی همه شبکه‌ها

### ۴.۱ وابستگی‌های صفحه ادمین

در `Admin/index.html` (قبل از ماژول‌ها):

```html
<script src="https://cdn.jsdelivr.net/npm/web3@1.10.0/dist/web3.min.js"></script>
<script src="../frontend/js/network-config.js"></script>
<script src="../frontend/js/raised-reader.js"></script>
```

### ۴.۲ بلوک جدول واریزی‌ها

```html
<div class="workflow-card">
  <div class="card-header">
    <div>
      <h3>واریزی‌های خزانه عمومی</h3>
      <p>همه واریزی‌های ایندکس‌شده از ابتدای ساخت خزانه، روی همه شبکه‌ها.</p>
    </div>
    <span class="workflow-badge">Transfers</span>
  </div>
  <div id="generalPoolDeposits"></div>
</div>
```

### ۴.۳ منطق موفق در `Admin/js/community.js`

ایدهٔ نهایی:

1. `Projects.json` → پیدا کردن `GENERAL_POOL` و `funds` هر شبکه  
2. `GET /api/transfers?projectId=GENERAL_POOL` → لیست واریزی + جمع ایندکس‌شده  
3. `ClassChainRaisedReader.getProjectRaisedUSDT(general)` → موجودی زنجیره (همان منبع donate)  
4. `GET /api/sync-status` → وضعیت sync هر شبکه (اختیاری برای برچسب UI)

توابع کمکی پایدار:

```js
function findGeneralPool(registry) {
  const features = registry?.features || [];
  for (const f of features) {
    const a = f?.attributes;
    if (a && String(a.ProjectID) === 'GENERAL_POOL') return a;
  }
  return null;
}

function inferNetworkId(row) {
  if (row.network_id) return row.network_id;
  if (row.networkId) return row.networkId;
  const donor = String(row.donor || '');
  if (donor.startsWith('T')) return 'tron_nile';
  if (donor.startsWith('0x') || donor.startsWith('0X')) return 'polygon_amoy';
  return 'unknown';
}

function amountToRaw(row) {
  if (row.amount_raw != null && String(row.amount_raw).trim() !== '') {
    try { return BigInt(String(row.amount_raw)); } catch { /* fall through */ }
  }
  const a = Number(row.amount || 0);
  if (!Number.isFinite(a)) return 0n;
  return BigInt(Math.round(a * 1e6));
}
```

اسکلت `loadGeneralPoolTreasuryInfo` (نسخه موفق نهایی):

```js
export async function loadGeneralPoolTreasuryInfo() {
  const box = el('generalPoolTreasuryInfo');
  const depositsBox = el('generalPoolDeposits');
  if (!box) return;

  const [registry, transfersData, syncData] = await Promise.all([
    loadProjectsRegistry(), // fetch('../frontend/data/Projects.json')
    indexerFetch('/api/transfers?projectId=GENERAL_POOL').catch(() => ({ transfers: [] })),
    indexerFetch('/api/sync-status').catch(() => ({ treasuries: [] })),
  ]);

  const general = findGeneralPool(registry);
  const funds = general.funds || {};
  const transfers = transfersData.transfers || [];

  // جمع ایندکس‌شده per network
  const indexedByNet = {};
  let indexedTotal = 0n;
  for (const t of transfers) {
    const nid = inferNetworkId(t);
    const raw = amountToRaw(t);
    indexedByNet[nid] = (indexedByNet[nid] || 0n) + raw;
    indexedTotal += raw;
  }

  // موجودی زنجیره — همان مسیر صفحه مشارکت
  let chainTotal = null;
  let chainBreakdown = [];
  if (window.ClassChainRaisedReader?.getProjectRaisedUSDT) {
    const result = await window.ClassChainRaisedReader.getProjectRaisedUSDT(general);
    chainTotal = Number(result?.total) || 0;
    chainBreakdown = result?.breakdown || [];
  }

  // رندر پنل موجودی per network + جدول #generalPoolDeposits
  // موجودی اصلی UI = chainTotal در صورت موجود بودن؛ کنارش جمع ایندکس
}
```

نمایش جدول واریزی‌ها: ستون‌های `#`، شبکه، Donor، مبلغ، Tx، بلاک — مرتب‌شده بر اساس `block_number` نزولی.

---

## فایل‌های نهایی این زنجیره

```
Admin/index.html          ← hero خزانه + #generalPoolDeposits + اسکریپت‌های raised-reader
Admin/js/community.js     ← loadGeneralPoolTreasuryInfo (زنجیره + transfers)
frontend/data/Projects.json  ← منبع آدرس‌های GENERAL_POOL (بدون ساخت جدید)
frontend/js/raised-reader.js ← خواندن balanceOf روی همه شبکه‌های فعال
frontend/js/network-config.js
```

Indexer مرتبط (از فازهای قبلی، پیش‌نیاز داده):

```
indexer/services/ContributionLedgerService.js   ← GENERAL_PROJECT_ID = 'GENERAL_POOL'
GET /api/transfers?projectId=GENERAL_POOL
GET /api/sync-status
```

---

## چک‌لیست تأیید بعد از deploy UI

1. ادمین → «صف FIFO»  
2. پنل بالا: موجودی هر شبکه نزدیک عدد صفحهٔ `donate.html?project=GENERAL_POOL`  
3. جدول «واریزی‌های خزانه عمومی» حداقل تراکنش‌های ایندکس‌شده را نشان دهد  
4. اگر جمع ایندکس < زنجیره: `POST /sync?projectId=GENERAL_POOL` (با `X-Indexer-Secret`) برای پر کردن transfers جا‌مانده

---

## یادداشت معماری (ثابت در طول چت)

- Indexer pure می‌ماند؛ تفسیر مالی فقط برای `project_id = GENERAL_POOL`.  
- Vote Preference ≠ Financial Allocation.  
- یک آدرس GENERAL per network؛ فعلاً فقط USDT.  
- UI ادمین برای «موجودی فعلی» باید منبع زنجیره را ترجیح دهد؛ ledger/`unallocated` برای صف تخصیص است نه برای نمایش balance عمومی.
