# Phase 4 — Disbursement (انتقال واقعی از خزانه عمومی)

## ورک‌فلو

1. صف FIFO ترتیب تخصیص را تعیین می‌کند (بدون تغییر).
2. ادمین `close` + `allocate` می‌زند → فقط حسابداری DB.
3. **سیستم خودکار** برای هر `network_id` در batch یک `disbursement` می‌سازد:
   - from = GENERAL_POOL.funds[network].address
   - to   = project.funds[network].address
   - amount = جمع slices همان شبکه
4. صاحبان خزانه GENERAL_POOL آن شبکه تأیید می‌کنند (`approve`).
5. وقتی به `required_signatures` رسید → status = `APPROVED`.
6. صاحبان روی زنجیره transfer را اجرا می‌کنند (MultiSig submit/confirm یا تک‌امضا).
7. بعد از موفقیت، `markExecuted` با `execute_tx_hash` زده می‌شود.

## Migration

```bash
wrangler d1 execute <DB_NAME> --file=indexer/db/migrations/0005_disbursements.sql
```

## فایل‌ها

```
indexer/db/migrations/0005_disbursements.sql
indexer/db/DisbursementRepository.js
indexer/services/DisbursementService.js
indexer/worker.js  (Phase 4 routes + auto-prepare after allocate)
```

## API

| Method | Path | نقش |
|--------|------|-----|
| GET | `/api/disburse/pending?network_id=` | لیست در انتظار تأیید |
| GET | `/api/disburse/:id` | جزئیات + approvals |
| POST | `/api/disburse/:id/approve` | body: `{ "approver": "0x..." }` |
| POST | `/api/disburse/:id/executed` | body: `{ "execute_tx_hash": "0x..." }` (ادمین) |
| POST | `/api/disburse/prepare` | body: `{ "allocation_batch_id", "project_id" }` (ادمین) |

## نکات

- Worker کلید خصوصی نگه نمی‌دارد.
- ترتیب پول = ترتیب FIFO در allocate؛ disbursement فقط بسته‌بندی per-network است.
- اگر پروژه روی آن شبکه آدرس نداشته باشد → `NO_DESTINATION`.
- الان GENERAL_POOL تک‌امضا است؛ با MultiSig فقط `required_signatures` و تأیید ownerها زیاد می‌شود.
