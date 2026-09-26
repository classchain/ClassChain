# ClassChain — Phase 0 & Phase 1 Implementation Guide

## نتیجه بررسی Projects.json (به‌روزشده)

**خزانه عمومی از قبل در Projects.json وجود دارد.**

| فیلد | مقدار |
|------|--------|
| **ProjectID** | `GENERAL_POOL` |
| **نام پروژه** | خزانه عمومی |
| **polygon_amoy** | `0xf0A747a45576c37a959078D688d4ad6044E9Ca76` |
| **tron_nile** | `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` |

ثابت در کد: `GENERAL_PROJECT_ID = 'GENERAL_POOL'`

نیازی به ساخت آدرس یا ویرایش Projects.json نیست. Indexer در اسکن بعدی این دو treasury را کشف می‌کند.

---

## فایل‌های این فاز

```
indexer/
├── db/
│   ├── migrations/0002_contribution_ledger.sql
│   ├── ContributionBalanceRepository.js
│   ├── AllocationQueueRepository.js
│   ├── TransferRepository.js          (patched)
│   └── schema.sql                     (appended)
├── services/
│   └── ContributionLedgerService.js
└── worker.js                          (patched)

docs/contribution/PHASE0_PHASE1.md
```

### مراحل استقرار

1. Migration را روی D1 اجرا کنید:
   ```bash
   wrangler d1 execute <DB_NAME> --file=indexer/db/migrations/0002_contribution_ledger.sql
   ```

2. Worker را deploy کنید.

3. یک USDT تستی به یکی از آدرس‌های GENERAL_POOL واریز کنید:
   - polygon_amoy: `0xf0A747a45576c37a959078D688d4ad6044E9Ca76`
   - tron_nile: `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb`

4. `POST /sync` بزنید.

5. چک کنید:
   - ردیف در `transfers` با `project_id = 'GENERAL_POOL'`
   - ردیف در `contribution_balances`
   - ردیف در `allocation_queue` با status = OPEN

6. `GET /api/contributor?donor=...&network_id=...` را صدا بزنید.

---

## رفتار Phase 1

```
واریز USDT به آدرس GENERAL_POOL
        ↓
Indexer (بدون تغییر منطق اصلی) transfer را در جدول transfers ثبت می‌کند
        ↓
TransferRepository.insert → inserted === true
        ↓
ContributionLedgerService.onTransferInserted
        ├── contribution_balances را credit می‌کند
        └── یک ردیف در allocation_queue (FIFO) می‌سازد
```

اگر ledger خطا بدهد، Indexer همچنان موفق است (eventually consistent).

---

## APIهای جدید

| Method | Path | توضیح |
|--------|------|--------|
| GET | `/api/contributor?donor=0x...&network_id=polygon_amoy` | موجودی یک donor |
| GET | `/api/queue?limit=50&network_id=...` | صف FIFO فعلی |
| GET | `/api/contributors?limit=100&network_id=...` | لیست کسانی که unallocated > 0 دارند |

---

## نکات مهم

- همه مبالغ به صورت string (base units) ذخیره می‌شوند.
- `transfer_uid` برای idempotency استفاده می‌شود.
- ثابت `GENERAL_PROJECT_ID = 'GENERAL_POOL'` در `ContributionLedgerService.js` تعریف شده است.
- فاز ۲ (Allocation Engine + Voting) هنوز پیاده نشده است.
