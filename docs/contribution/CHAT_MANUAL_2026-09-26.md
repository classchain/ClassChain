# Manual چت ClassChain — 2026-09-26

**تاریخ چت:** 2026-09-26  
**ریپو:** `classchain/ClassChain`  
**برنچ:** `feature/contribution-ledger`  
**موضوع:** تکمیل Phase 5 — اتصال Telegram به سیستم مشارکت عمومی و هماهنگ‌سازی عضویت

> این سند فقط زنجیره کارهای موفق و نهایی‌شده این چت را ثبت می‌کند.  
> تلاش‌های ناموفق، نسخه‌های موقت، conflictها، خطاهای حین کار و نتایج تستی که در طول چت گزارش شده‌اند عمداً در این سند نیامده‌اند.

---

## 1. نقطه شروع

در ابتدای این چت، معماری مشارکت عمومی ClassChain تا لایه‌های زیر پیش رفته بود:

```
USDT
  ↓
GENERAL_POOL
  ↓
Indexer
  ↓
Contribution Ledger
  ↓
FIFO Queue
  ↓
Allocation
```

نیاز مرحله بعد این بود که وضعیت مالی مشارکت‌کننده با جامعه Telegram هماهنگ شود.

قواعدی که مبنای پیاده‌سازی قرار گرفت:

- مشارکت‌کننده عمومی با `unallocated > 0` عضو جامعه عمومی محسوب می‌شود.
- بعد از تخصیص سهم به یک پروژه، ارتباط او با جامعه عمومی باید مطابق وضعیت باقی‌مانده‌اش اصلاح شود.
- تخصیص مالی همچنان توسط سیستم Ledger/FIFO انجام می‌شود؛ Telegram فقط لایه جامعه و ارتباط با کاربر است.
- Wallet ↔ Telegram باید قبل از عملیات جامعه قابل شناسایی باشد.
- Worker نباید کلید خصوصی نگه دارد.
- منطق باید برای چند شبکه قابل استفاده باشد.
- یک مشارکت‌کننده چندشبکه‌ای نباید صرفاً به دلیل تخصیص در یک شبکه، از General خارج شود اگر هنوز در شبکه دیگری `unallocated` دارد.

---

## 2. تکمیل زیرساخت Phase 5

در اولین مرحله، اجزای اصلی Phase 5 در ریپو قرار گرفتند:

```
indexer/db/migrations/0006_telegram_community.sql
indexer/db/TelegramGroupRepository.js
indexer/services/TelegramBotClient.js
indexer/services/TelegramSyncService.js
indexer/services/TelegramBotHandler.js
indexer/services/WalletLinkService.js
```

### مسئولیت هر بخش

**TelegramGroupRepository**

نگهداری گروه‌های Telegram و وضعیت عضویت کاربران در آنها.

**TelegramBotClient**

لایه ارتباط با Telegram Bot API.

**TelegramBotHandler**

پردازش updateهای دریافتی از Telegram و اتصال آنها به منطق ClassChain.

**TelegramSyncService**

هماهنگ‌سازی وضعیت مالی مشارکت‌کنندگان با گروه‌های Telegram.

**WalletLinkService**

پیاده‌سازی کامل اتصال Wallet به Telegram با استفاده از امضای پیام و nonce.

Commit مبنا:

`84ceffe7` — `feat(phase5): Telegram community sync — migration, services, WalletLink implementation`

---

## 3. طراحی Migration مربوط به Telegram

Migration:

`indexer/db/migrations/0006_telegram_community.sql`

دو جدول اصلی اضافه شد.

### telegram_groups

برای نگهداری گروه‌های فعال:

- `GENERAL`
- `PROJECT`

و برای هر گروه:

- `project_id`
- `chat_id`
- `title`
- `invite_link`
- `active`

### telegram_memberships

برای نگهداری وضعیت عضویت Telegram User در هر گروه:

- `ACTIVE`
- `REMOVED`
- `PENDING_INVITE`

همچنین محدودیت یکتا روی ترکیب:

```
telegram_user_id + chat_id
```

قرار گرفت تا رکورد عضویت تکراری ایجاد نشود.

---

## 4. ثبت گروه واقعی General Pool

گروه عمومی واقعی ClassChain به عنوان گروه نوع `GENERAL` ثبت شد.

Migration از ابتدا به صورت additive طراحی شد و ثبت گروه با:

```
INSERT OR IGNORE
```

انجام شد تا اجرای مجدد migration باعث ایجاد رکورد تکراری نشود.

در ادامه برای اطمینان بیشتر، migration جداگانه زیر نیز اضافه شد:

`indexer/db/migrations/0007_telegram_general_seed.sql`

این migration فقط مسئول اطمینان از وجود رکورد General Pool است و آن را به صورت idempotent ثبت می‌کند.

Commit:

`7463d1ed` — `feat(phase5): add idempotent General Pool seed migration`

---

## 5. اتصال Telegram به Worker

بعد از آماده شدن سرویس‌ها، Worker به Telegram متصل شد.

Routeهای نهایی:

```
POST /telegram/webhook
POST /api/telegram/sync-general
POST /api/telegram/groups
GET  /api/telegram/groups
```

### /telegram/webhook

updateهای Telegram را دریافت می‌کند و به `TelegramBotHandler` می‌دهد.

### /api/telegram/sync-general

برای هماهنگ‌سازی جامعه General Pool استفاده می‌شود.

این endpoint مدیریتی است.

### /api/telegram/groups

برای ثبت یا به‌روزرسانی گروه‌های Telegram استفاده می‌شود.

### GET /api/telegram/groups

گروه‌های فعال ثبت‌شده را برمی‌گرداند.

Commitهای این زنجیره:

- `f96d5b3b` — اتصال webhook، sync و onAllocated
- `548e3cf0` — بازسازی صحیح Worker و اتصال routeهای Telegram
- `02fb86b5` — تکمیل routeهای جامعه Telegram

---

## 6. اتصال Allocation به Telegram

یک تغییر مهم این بود که Telegram نباید سیستم مالی مستقلی داشته باشد.

بنابراین بعد از انجام Allocation، Worker از نتیجه Allocation، donorهای تخصیص‌یافته را استخراج می‌کند و آنها را به:

```
TelegramSyncService.onAllocated(...)
```

می‌دهد.

در نتیجه زنجیره به شکل زیر درآمد:

```
Allocation
    ↓
donors allocated
    ↓
TelegramSyncService
    ↓
اصلاح وضعیت General / Project membership
```

این کار باعث شد Telegram به Ledger و Allocation متصل باشد، بدون اینکه Telegram وارد محاسبات مالی شود.

---

## 7. جلوگیری از دعوت‌های تکراری

منطق دعوت Telegram اصلاح شد تا برای یک کاربر، دعوت تکراری تولید نشود.

برای این منظور وضعیت عضویت `PENDING_INVITE` نیز وارد منطق sync شد.

زنجیره:

```
eligible contributor
       ↓
بررسی membership
       ↓
اگر قبلاً invite pending وجود دارد
       ↓
invite جدید ساخته نمی‌شود
```

Commit:

`6548f557` — `fix(phase5): prevent repeated Telegram invites and track joins`

---

## 8. ثبت واقعی Join از طریق Telegram

صرف ارسال invite برای تشخیص عضویت کافی نبود.

بنابراین eventهای عضویت Telegram نیز در منطق Bot پردازش شدند تا ورود واقعی کاربر به گروه قابل ثبت باشد.

وضعیت membership از حالت صرفاً `PENDING_INVITE` می‌تواند به وضعیت واقعی عضویت منتقل شود.

Commit:

`adf10782` — `fix(phase5): track Telegram invite-link joins`

---

## 9. مدیریت مشارکت‌کنندگان چندشبکه‌ای

منطق خروج از General برای چندشبکه‌ای‌ها اصلاح شد.

قاعده نهایی:

اگر کاربر در یک شبکه allocation شد ولی در شبکه دیگری هنوز:

```
unallocated > 0
```

دارد، نباید از General خارج شود.

بنابراین membership بر اساس وضعیت مالی باقی‌مانده در تمام شبکه‌های مربوطه تعیین می‌شود، نه صرفاً بر اساس آخرین allocation.

Commit:

`fe5b6910` — `fix(phase5): keep multi-network donors in General`

---

## 10. مدیریت دعوت‌های معلق هنگام Allocation

Allocation ممکن است قبل از کامل شدن فرآیند Join در Telegram اتفاق بیفتد.

برای همین وضعیت:

```
PENDING_INVITE
```

در هنگام Allocation نیز در نظر گرفته شد.

در نتیجه Allocation باعث از دست رفتن state مربوط به دعوت نمی‌شود و فرآیند sync می‌تواند آن را در مرحله بعد تکمیل کند.

Commit:

`2c486686` — `fix(phase5): handle pending General invites during allocation`

---

## 11. تکمیل وابستگی Wallet Linking

برای Wallet Linking از:

```
@noble/hashes
```

استفاده شد.

import صحیح به نسخه دارای پسوند `.js` اصلاح شد:

```
@noble/hashes/sha3.js
```

این اصلاح بخشی از مسیر نهایی Worker/WalletLink بود.

Commit:

`20f6f3f0` — `fix(phase5): add missing noble hashes dependency for wallet linking`

و در نسخه نهایی:

`04ba4840` — `feat(phase5): wire Telegram routes + fix noble hashes import`

---

## 12. مدل نهایی Wallet ↔ Telegram

اتصال Wallet و Telegram به صورت زیر طراحی شد:

```
Telegram User
     ↓
/api/link/request
     ↓
nonce + message
     ↓
Wallet personal_sign
     ↓
/api/link/verify
     ↓
WalletLink ثبت‌شده
```

قواعد اصلی:

- nonce یک‌بارمصرف است.
- nonce دارای زمان انقضا است.
- Wallet بازیابی‌شده باید با donor اعلام‌شده تطابق داشته باشد.
- ارتباط Telegram User و Wallet برای هر شبکه محدود و قابل کنترل است.

این لایه قبل از تصمیم‌گیری درباره membership استفاده می‌شود.

---

## 13. مدل نهایی همگام‌سازی جامعه

پس از تکمیل Phase 5، منطق جامعه به شکل زیر تثبیت شد:

```
Wallet
   ↓
Wallet Link
   ↓
Contribution Ledger
   ↓
unallocated
   ↓
TelegramSyncService
   ↓
General Community
```

و پس از تخصیص:

```
FIFO Allocation
       ↓
Project X
       ↓
TelegramSyncService.onAllocated()
       ↓
Project X Community
```

در صورت باقی ماندن موجودی تخصیص‌نیافته:

```
Project allocation
       +
remaining unallocated
       ↓
Project Community + General Community
```

---

## 14. استقرار نهایی

پس از تکمیل تغییرات Phase 5، Worker روی:

```
https://classchain-indexer.classchain.workers.dev
```

مستقر شد.

Migrationهای مربوط به زنجیره مشارکت عمومی و Telegram در D1 به صورت ترتیبی استفاده شدند:

```
0002
0003
0004
0005
0006
0007
```

نسخه نهایی کد روی:

```
origin/feature/contribution-ledger
```

همگام شد.

Commit نهایی کد Phase 5:

`04ba484047709480e56a3e911dbf19a3a4f144f8`

---

# زنجیره نهایی این چت

تمام تغییرات موفق این چت در نهایت به این جریان رسید:

```
GENERAL_POOL
     ↓
Indexer
     ↓
Contribution Ledger
     ↓
unallocated
     ↓
Wallet ↔ Telegram Link
     ↓
Telegram General Community
     ↓
Voting / Allocation
     ↓
FIFO Allocation
     ↓
Project
     ↓
Telegram Project Community
```

و اصل مهم معماری حفظ شد:

```
Blockchain / Indexer
        =
منبع حقیقت مالی

Application
        =
Ledger + FIFO + Allocation + Community state

Telegram
        =
لایه ارتباط و جامعه

Worker
        ≠
نگهدارنده کلید خصوصی
```

---

## نقطه پایان چت

در پایان این چت، Phase 5 از یک مجموعه فایل و route اولیه به یک زنجیره عملیاتی یکپارچه تبدیل شد:

1. Telegram Group ثبت می‌شود.
2. Wallet به Telegram User متصل می‌شود.
3. وضعیت مالی مشارکت‌کننده از Ledger خوانده می‌شود.
4. واجدین شرایط General Community شناسایی می‌شوند.
5. دعوت Telegram به شکل کنترل‌شده انجام می‌شود.
6. Join واقعی ثبت می‌شود.
7. Allocation باعث به‌روزرسانی membership می‌شود.
8. وضعیت چندشبکه‌ای حفظ می‌شود.
9. General Pool seed به صورت idempotent نگهداری می‌شود.
10. Worker و D1 با نسخه نهایی هماهنگ می‌شوند.

**تاریخ سند: 2026-09-26**
