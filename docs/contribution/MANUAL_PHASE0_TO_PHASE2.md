# Manual عملیاتی ClassChain
## از مشارکت عمومی تا تخصیص FIFO (فاز ۰ → ۱ → ۲)

**تاریخ مستندسازی:** ۲۰۲۶-۰۹-۲۶  
**بازه اجرای عملی:** ۲۰۲۶-۰۹-۱۷ تا ۲۰۲۶-۰۹-۱۹  
**ریپو:** `classchain/ClassChain`  
**برنچ کار:** `feature/contribution-ledger`  
**Worker:** `https://classchain-indexer.classchain.workers.dev`  
**D1:** `classchain-indexer`

> این سند فقط مسیر **موفق و تأیید‌شده** را ثبت می‌کند. مسیرهای شکست‌خورده و خطاهای موقت حذف شده‌اند.

---

## اصل معماری (ثابت در تمام فازها)

| لایه | مسئولیت |
|------|---------|
| **Indexer** | فقط واقعیت زنجیره: چه کسی، چقدر، به کدام treasury |
| **Contribution Ledger** | معنی مشارکت: موجودی تخصیص‌نیافته + صف FIFO |
| **Allocation Engine** | مصرف FIFO و تخصیص به پروژه (با تأیید دستی) |

قواعد ثابت:

- مشارکت مستقیم به پروژهٔ مشخص → بدون Queue
- مشارکت به `GENERAL_POOL` → Ledger + Queue
- رأی ≠ تخصیص مالی
- فقط USDT
- یک آدرس GENERAL per network
- تأیید دستی قبل از allocate
- Indexer نباید برای لایه مشارکت خراب شود (hook غیرمسدودکننده)

---

## گام ۱ — برنچ و کد فاز ۰ / ۱

برنچ `feature/contribution-ledger` از `Mobile` ساخته شد.

فایل‌های اصلی:

- `indexer/db/migrations/0002_contribution_ledger.sql`
- `indexer/db/ContributionBalanceRepository.js`
- `indexer/db/AllocationQueueRepository.js`
- `indexer/services/ContributionLedgerService.js`
- پچ `TransferRepository.js` (hook بعد از insert)
- پچ `worker.js` (APIهای فاز ۱)

ثابت پروژه عمومی:

```js
GENERAL_PROJECT_ID = 'GENERAL_POOL'
```

آدرس‌های خزانه عمومی (از `frontend/data/Projects.json` برنچ Mobile):

| شبکه | آدرس |
|------|------|
| polygon_amoy | `0xf0A747a45576c37a959078D688d4ad6044E9Ca76` |
| tron_nile | `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` |

---

## گام ۲ — Migration فاز ۱ روی D1

```bash
npx wrangler d1 execute classchain-indexer --remote --file=indexer/db/migrations/0002_contribution_ledger.sql
```

جداول ساخته‌شده:

- `contribution_balances`
- `allocation_queue`

---

## گام ۳ — تنظیم `PROJECTS_JSON_URL` روی Mobile

در `wrangler.jsonc` باید این باشد (نه Donation):

```json
"PROJECTS_JSON_URL": "https://raw.githubusercontent.com/classchain/ClassChain/Mobile/frontend/data/Projects.json"
```

سپس:

```bash
npx wrangler deploy
```

بدون این تنظیم، `GENERAL_POOL` discover نمی‌شود.

---

## گام ۴ — فیلتر sync برای سقف subrequest

به‌خاطر محدودیت subrequest کلودفلر، sync فقط برای `GENERAL_POOL`:

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/sync?projectId=GENERAL_POOL"
```

این قابلیت در `IndexerRunner` و `worker.js` با `options.projectId` پیاده شد.

---

## گام ۵ — جلو بردن cursor اسکن GENERAL_POOL

بعد از discover، treasury idها:

| id | network |
|----|---------|
| 97057 | polygon_amoy |
| 97056 | tron_nile |

```bash
npx wrangler d1 execute classchain-indexer --remote --command="
INSERT INTO sync_state (treasury_id, scan_from_block, last_scanned_block, last_finalized_block, status, error)
VALUES
  (97057, 48004000, 48004000, 48004000, 'PENDING', NULL),
  (97056, 71100000, 71100000, 71100000, 'PENDING', NULL)
ON CONFLICT(treasury_id) DO UPDATE SET
  scan_from_block = excluded.scan_from_block,
  last_scanned_block = excluded.last_scanned_block,
  last_finalized_block = excluded.last_finalized_block,
  status = 'PENDING',
  error = NULL;
"
```

سپس:

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/sync?projectId=GENERAL_POOL"
```

انتظار:

- `synced: 2`
- `status: SUCCESS` برای هر دو شبکه

---

## گام ۶ — APIهای فاز ۱ (خواندن)

```bash
curl -s "https://classchain-indexer.classchain.workers.dev/health"
curl -s "https://classchain-indexer.classchain.workers.dev/api/queue"
curl -s "https://classchain-indexer.classchain.workers.dev/api/contributors"
curl -s "https://classchain-indexer.classchain.workers.dev/api/contributor?donor=0xDONOR&network_id=polygon_amoy"
```

---

## گام ۷ — تست end-to-end فاز ۱

1. واریز USDT تستی به آدرس `GENERAL_POOL` (مثلاً polygon_amoy)
2. Sync:

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/sync?projectId=GENERAL_POOL"
```

3. انتظار:

- `inserted >= 1` در transfers
- یک ردیف `OPEN` در `allocation_queue`
- ردیف در `contribution_balances` با `unallocated > 0`

---

## گام ۸ — کد فاز ۲

فایل‌های اضافه‌شده:

- `indexer/db/migrations/0003_allocation_voting.sql`
- `indexer/db/AllocationRepository.js`
- `indexer/db/VotingRepository.js`
- `indexer/services/AllocationEngine.js`
- `indexer/services/VotingService.js`
- پچ `worker.js` (APIهای فاز ۲)

جداول:

- `allocations`
- `voting_rounds`
- `votes`

---

## گام ۹ — Migration و Deploy فاز ۲

```bash
cd /workspaces/ClassChain/ClassChain
git pull origin feature/contribution-ledger

npx wrangler d1 execute classchain-indexer --remote --file=indexer/db/migrations/0003_allocation_voting.sql

npx wrangler deploy
```

در پرامپت تأیید migration → **Y**

---

## گام ۱۰ — تخصیص مستقیم FIFO (بدون دور رأی)

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/api/allocate" \
  -H "Content-Type: application/json" \
  -d '{
    "project_id": "1004",
    "required_amount_raw": "1000000",
    "network_id": "polygon_amoy"
  }'
```

منطق:

- صف را به‌ترتیب `contribution_timestamp` مصرف می‌کند
- `remaining_raw` کم می‌شود
- `unallocated` debit می‌شود
- ردیف در `allocations` ثبت می‌شود

---

## گام ۱۱ — جریان کامل رأی‌گیری + تخصیص دستی

| مرحله | دستور |
|-------|--------|
| باز کردن دور | `POST /api/voting/rounds` |
| رأی | `POST /api/voting/rounds/:id/vote` |
| بستن + انتخاب پروژه | `POST /api/voting/rounds/:id/close` |
| اجرای FIFO | `POST /api/voting/rounds/:id/allocate` |

### باز کردن دور

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/api/voting/rounds" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test round 1",
    "candidate_projects": ["1004", "1005"],
    "network_id": "polygon_amoy"
  }'
```

### رأی (فقط اگر `unallocated > 0`)

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/api/voting/rounds/1/vote" \
  -H "Content-Type: application/json" \
  -d '{
    "donor": "0xDONOR",
    "network_id": "polygon_amoy",
    "project_id": "1004"
  }'
```

### بستن دور

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/api/voting/rounds/1/close" \
  -H "Content-Type: application/json" \
  -d '{
    "selected_project_id": "1004",
    "required_amount_raw": "1000000"
  }'
```

### تخصیص بعد از close

```bash
curl -s -X POST "https://classchain-indexer.classchain.workers.dev/api/voting/rounds/1/allocate"
```

---

## نقشهٔ API نهایی

| Method | Path | فاز | توضیح |
|--------|------|-----|--------|
| GET | `/health` | — | سلامت |
| POST | `/sync?projectId=GENERAL_POOL` | ۰ | sync فیلترشده |
| GET | `/api/queue` | ۱ | صف FIFO |
| GET | `/api/contributor` | ۱ | موجودی donor |
| GET | `/api/contributors` | ۱ | لیست مشارکت‌کنندگان |
| POST | `/api/allocate` | ۲ | تخصیص مستقیم FIFO |
| GET | `/api/voting/rounds` | ۲ | لیست دورها |
| GET | `/api/voting/rounds/:id` | ۲ | جزئیات + tally |
| POST | `/api/voting/rounds` | ۲ | باز کردن دور (admin) |
| POST | `/api/voting/rounds/:id/vote` | ۲ | ثبت ترجیح |
| POST | `/api/voting/rounds/:id/close` | ۲ | بستن + انتخاب پروژه |
| POST | `/api/voting/rounds/:id/allocate` | ۲ | اجرای FIFO |

Admin routes در صورت وجود `INDEXER_SYNC_SECRET` با هدر `X-Indexer-Secret` محافظت می‌شوند.

---

## زنجیرهٔ نهایی تأیید‌شده

```text
واریز به GENERAL_POOL
    → Indexer ثبت transfer
    → Ledger: credit balance + enqueue FIFO
    → (اختیاری) رأی‌گیری ترجیحی
    → تأیید دستی (close)
    → AllocationEngine مصرف FIFO
    → ثبت allocations + کاهش unallocated
```

---

## وضعیت در زمان مستندسازی (۲۰۲۶-۰۹-۲۶)

| مورد | وضعیت |
|------|--------|
| فاز ۰ / ۱ | تأیید end-to-end با واریز واقعی |
| فاز ۲ کد | روی برنچ `feature/contribution-ledger` |
| Migration `0003` | باید روی D1 اجرا شود (در صورت尚未) |
| Deploy فاز ۲ | بعد از migration |

---

*آخرین به‌روزرسانی سند: ۲۰۲۶-۰۹-۲۶*
