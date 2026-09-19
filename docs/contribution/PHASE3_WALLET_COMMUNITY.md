# ClassChain — Phase 3: Wallet Linking + Community Status

## هدف

- اتصال امن Telegram User ↔ Wallet (با امضای پیام)
- محاسبه وضعیت جوامع از روی داده مالی
- محدودیت «فقط یک راند رأی‌گیری باز»
- آماده‌سازی لیست اعضا برای ربات تلگرام (فاز ۴)

Indexer همچنان فقط واقعیت بلاکچین را ثبت می‌کند.

---

## Migration

```bash
wrangler d1 execute <DB_NAME> --file=indexer/db/migrations/0004_wallet_links.sql
```

جداول جدید:

- `wallet_links` — لینک تأییدشده Telegram ↔ donor
- `link_nonces` — nonce یک‌بارمصرف برای جلوگیری از replay

وابستگی جدید:

- `@noble/secp256k1` — بازیابی آدرس از personal_sign

---

## Wallet Linking

### جریان

```
POST /api/link/request
  { telegram_user_id, network_id }
  → { nonce, message, expires_at }

کاربر message را با والت امضا می‌کند (personal_sign)

POST /api/link/verify
  { telegram_user_id, network_id, donor, signature, message }
  → { ok, link, recovered_address }
```

### قوانین

- هر Telegram در هر شبکه فقط یک والت
- هر والت در هر شبکه فقط به یک Telegram
- Nonce یک‌بارمصرف و TTL حدود ۱۰ دقیقه
- برای شبکه‌های EVM آدرس بازیابی‌شده باید با `donor` یکی باشد

### APIها

| Method | Path | توضیح |
|--------|------|--------|
| POST | `/api/link/request` | صدور nonce + message |
| POST | `/api/link/verify` | تأیید امضا و ثبت لینک |
| GET | `/api/link/status?telegram_user_id=` | وضعیت لینک‌ها |
| POST | `/api/link/unlink` | قطع لینک (ادمین یا با secret) |

---

## Community Status

عضویت از وضعیت مالی استخراج می‌شود:

| جامعه | شرط |
|--------|------|
| Public | حداقل یک wallet_link |
| Contributor | unallocated > 0 |
| Project X | مجموع allocations به X > 0 |

### APIها

| Method | Path | توضیح |
|--------|------|--------|
| GET | `/api/community/status?telegram_user_id=` | وضعیت کامل |
| GET | `/api/community/status?donor=&network_id=` | وضعیت یک والت |
| GET | `/api/community/members?type=contributor` | لیست واجدین جامعه مشارکت‌کنندگان |
| GET | `/api/community/members?type=project&project_id=` | اعضای یک پروژه |

---

## رأی‌گیری

- فقط **یک** راند با `status = OPEN` مجاز است
- تلاش برای باز کردن راند دوم خطا می‌دهد
- واجد شرایط رأی: هر مقدار `unallocated > 0`
- وزن رأی فعلاً یک‌نفر-یک‌رأی

---

## صف تخصیص

پیش‌فرض صف **جهانی** است (`network_id = null` در AllocationEngine):
مرتب‌سازی `contribution_timestamp ASC, id ASC` روی همه شبکه‌ها.

---

## استقرار

1. `npm install` در پوشه indexer (برای `@noble/secp256k1`)
2. اجرای migration `0004`
3. Deploy worker
4. تست:
   - request → sign → verify
   - `GET /api/community/status`
   - باز کردن دو راند پشت‌سرهم (دومی باید fail شود)

---

## خارج از این فاز

- ربات تلگرام و sync خودکار گروه‌ها → فاز ۴
- وزن‌دهی رأی
- منطق بازگشت پول / کنسل پروژه
