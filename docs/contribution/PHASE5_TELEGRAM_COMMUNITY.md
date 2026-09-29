# Phase 5 — Telegram Community Sync

## هدف

- عضویت **خودکار** در گروه `ClassChain General Pool` فقط برای کسانی که:
  - والت را به تلگرام لینک کرده‌اند، و
  - `unallocated > 0` دارند (واریز به GENERAL که هنوز به پروژه‌ای تخصیص نیافته).
- بعد از **allocate** (رای‌گیری / بستن راند):
  - از گروه General خارج می‌شوند،
  - در صورت وجود گروه پروژه، دعوت به آن می‌گیرند.

## پیش‌نیاز (انجام‌شده توسط اپراتور)

| مورد | مقدار |
|------|--------|
| گروه | ClassChain General Pool — **سوپرگروه** |
| Chat ID | `-1003951313123` |
| ربات | ادمین با Invite + Ban |
| Secrets | `TELEGRAM_BOT_TOKEN`, `TELEGRAM_GENERAL_CHAT_ID` |

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_GENERAL_CHAT_ID
# مقدار: -1003951313123
```

## Migration

```bash
wrangler d1 execute classchain-indexer --remote --file=indexer/db/migrations/0006_telegram_community.sql
```

سپس seed گروه General (اگر migration seed نکرد):

```sql
INSERT OR IGNORE INTO telegram_groups (kind, project_id, chat_id, title, active, created_at, updated_at)
VALUES ('GENERAL', NULL, '-1003951313123', 'ClassChain General Pool', 1, datetime('now'), datetime('now'));
```

## فایل‌ها

```
indexer/db/migrations/0006_telegram_community.sql
indexer/db/TelegramGroupRepository.js
indexer/services/TelegramBotClient.js
indexer/services/TelegramSyncService.js
indexer/services/TelegramBotHandler.js
indexer/services/WalletLinkService.js   # جایگزین PLACEHOLDER
```

## APIهای جدید Worker

| Method | Path | نقش |
|--------|------|-----|
| POST | `/telegram/webhook` | دریافت update از تلگرام |
| POST | `/api/telegram/sync-general` | ادمین — reconcile گروه General |
| POST | `/api/telegram/groups` | ادمین — ثبت/به‌روزرسانی گروه (GENERAL یا PROJECT) |
| GET | `/api/telegram/groups` | لیست گروه‌های ثبت‌شده |

Webhook را یک‌بار تنظیم کنید:

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://classchain-indexer.<your-subdomain>.workers.dev/telegram/webhook"
```

(اختیاری: `secret_token` و هدر `X-Telegram-Bot-Api-Secret-Token`)

## جریان کاربر

```
واریز USDT به GENERAL_POOL
        ↓
Indexer → contribution_balances (unallocated > 0)
        ↓
کاربر ربات را /start می‌کند + والت را link می‌کند
        ↓
POST /api/telegram/sync-general  (یا cron)
        ↓
ربات لینک دعوت یک‌بارمصرف DM می‌کند → کاربر join می‌شود
        ↓
allocate به پروژه X
        ↓
TelegramSyncService.onAllocated → kick از General + دعوت به گروه پروژه (اگر chat_id ثبت شده)
```

## ثبت گروه پروژه

```http
POST /api/telegram/groups
X-Indexer-Secret: ...
{
  "kind": "PROJECT",
  "project_id": "1005",
  "chat_id": "-100xxxxxxxxxx",
  "title": "ClassChain Project 1005"
}
```

## محدودیت تلگرام

ربات **نمی‌تواند** کسی را که هرگز با ربات حرف نزده به گروه force-add کند.  
راه‌حل استاندارد: **لینک دعوت شخصی** در DM + kick با ban/unban برای خروج.

## وابستگی npm

برای recover امضای EVM:

```bash
cd indexer && npm install @noble/secp256k1 @noble/hashes
```

`wrangler.jsonc` / `package.json` باید این پکیج‌ها را برای worker ببیند (`nodejs_compat` از قبل فعال است).

## تست دستی

1. Migration + secrets + deploy  
2. ربات: `/start` → `/status`  
3. `POST /api/link/request` + امضا + `verify`  
4. واریز تستی + `POST /sync`  
5. `POST /api/telegram/sync-general` → باید DM دعوت بیاید  
6. بعد از allocate: باید از General خارج شود  

## خارج از این فاز

- UI دکمه «عضویت در گروه» روی `donate.html` بعد از پرداخت موفق  
- وزن رأی بر اساس مبلغ  
- چند ربات / چند شبکه جدا  
