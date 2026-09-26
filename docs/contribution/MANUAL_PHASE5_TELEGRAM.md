# Manual — Phase 5: Telegram Community Sync

**تاریخ اجرا / مستندسازی:** ۲۰۲۶-۰۹-۲۶ (۲۶ سپتامبر ۲۰۲۶)  
**ریپو:** `classchain/ClassChain`  
**برنچ مبنا:** `feature/contribution-ledger`  
**هدف:** عضویت خودکار در گروه ClassChain General Pool برای کسانی با `unallocated > 0`، و خروج خودکار بعد از allocate

> این سند فقط مسیر **موفق و نتیجه‌دار** را ثبت می‌کند (زنجیره از ابتدا تا انتها).

---

## پیش‌نیازهای تأییدشده

| مورد | مقدار |
|------|--------|
| گروه | ClassChain General Pool (سوپرگروه) |
| Chat ID | `-1003951313123` |
| ربات | ادمین با دسترسی Invite + Ban |
| Secrets | `TELEGRAM_BOT_TOKEN` ، `TELEGRAM_GENERAL_CHAT_ID` |

---

## گام ۱ — Secrets در Cloudflare Worker

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_GENERAL_CHAT_ID
# مقدار chat id: -1003951313123
```

---

## گام ۲ — فایل‌های Phase 5 روی برنچ

این فایل‌ها روی `feature/contribution-ledger` قرار گرفتند:

```
indexer/db/migrations/0006_telegram_community.sql
indexer/db/TelegramGroupRepository.js
indexer/services/TelegramBotClient.js
indexer/services/TelegramSyncService.js
indexer/services/TelegramBotHandler.js
indexer/services/WalletLinkService.js   # پیاده‌سازی کامل (جایگزین placeholder)
docs/contribution/PHASE5_TELEGRAM_COMMUNITY.md
```

اگر محلی نبودند:

```bash
git stash push -m "local WalletLinkService" -- indexer/services/WalletLinkService.js
git pull origin feature/contribution-ledger
```

تأیید وجود فایل‌ها:

```bash
ls indexer/db/migrations/0006_telegram_community.sql
ls indexer/services/Telegram*.js
```

---

## گام ۳ — Migration + Seed روی D1

```bash
npx wrangler d1 execute classchain-indexer --remote \
  --file=indexer/db/migrations/0006_telegram_community.sql

npx wrangler d1 execute classchain-indexer --remote \
  --command="INSERT OR IGNORE INTO telegram_groups (kind, project_id, chat_id, title, active, created_at, updated_at) VALUES ('GENERAL', NULL, '-1003951313123', 'ClassChain General Pool', 1, datetime('now'), datetime('now'));"
```

---

## گام ۴ — ادغام routeها در `indexer/worker.js`

نسخهٔ سالم مبنا را بگیرید (حدود ۵۷۳ خط)، سپس این اسکریپت را از ریشهٔ ریپو اجرا کنید:

```bash
cat > /tmp/apply_phase5_to_worker.py << 'PY'
from pathlib import Path
p = Path('indexer/worker.js')
text = p.read_text()

old_hdr = """ * Phase 4:
 *   GET  /api/disburse/pending
 *   GET  /api/disburse/:id
 *   POST /api/disburse/:id/approve
 *   POST /api/disburse/:id/executed      (admin)
 *   POST /api/disburse/prepare           (admin)
 *
 * Sync filter:
 *   POST /sync?projectId=GENERAL_POOL
 */"""
new_hdr = """ * Phase 4:
 *   GET  /api/disburse/pending
 *   GET  /api/disburse/:id
 *   POST /api/disburse/:id/approve
 *   POST /api/disburse/:id/executed      (admin)
 *   POST /api/disburse/prepare           (admin)
 *
 * Phase 5:
 *   POST /telegram/webhook
 *   POST /api/telegram/sync-general      (admin)
 *   POST /api/telegram/groups            (admin)
 *   GET  /api/telegram/groups
 *
 * Sync filter:
 *   POST /sync?projectId=GENERAL_POOL
 */"""
if old_hdr not in text:
    raise SystemExit('header block not found — abort')
text = text.replace(old_hdr, new_hdr, 1)

old_imp = "import { DisbursementService } from './services/DisbursementService.js';\nimport { createAdapter } from './adapters/createAdapter.js';"
new_imp = """import { DisbursementService } from './services/DisbursementService.js';
import { TelegramSyncService } from './services/TelegramSyncService.js';
import { TelegramBotHandler } from './services/TelegramBotHandler.js';
import { TelegramGroupRepository } from './db/TelegramGroupRepository.js';
import { createAdapter } from './adapters/createAdapter.js';"""
if old_imp not in text:
    raise SystemExit('import block not found — abort')
text = text.replace(old_imp, new_imp, 1)
text = text.replace("phase: 4,", "phase: 5,", 1)

old_alloc_round = """        } catch (de) {
          disbursement = { ok: false, error: de.message };
        }
        return jsonResponse({ ok: true, ...result, disbursement });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/allocate') {"""
new_alloc_round = """        } catch (de) {
          disbursement = { ok: false, error: de.message };
        }
        let telegram = null;
        try {
          const donors = (result.slices || result.allocations || [])
            .map((s) => s.donor)
            .filter(Boolean);
          const unique = [...new Set(donors)];
          if (unique.length) {
            const sync = new TelegramSyncService(env.DB, env);
            telegram = await sync.onAllocated({
              projectId: result.project_id,
              donors: unique,
            });
          }
        } catch (te) {
          telegram = { ok: false, error: te.message };
        }
        return jsonResponse({ ok: true, ...result, disbursement, telegram });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/allocate') {"""
if old_alloc_round not in text:
    raise SystemExit('allocate-round block not found — abort')
text = text.replace(old_alloc_round, new_alloc_round, 1)

old_alloc = """        } catch (de) {
          disbursement = { ok: false, error: de.message };
        }
        return jsonResponse({ ...result, disbursement });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/link/request') {"""
new_alloc = """        } catch (de) {
          disbursement = { ok: false, error: de.message };
        }
        let telegram = null;
        try {
          const donors = (result.slices || result.allocations || [])
            .map((s) => s.donor)
            .filter(Boolean);
          const unique = [...new Set(donors)];
          if (unique.length) {
            const sync = new TelegramSyncService(env.DB, env);
            telegram = await sync.onAllocated({
              projectId,
              donors: unique,
            });
          }
        } catch (te) {
          telegram = { ok: false, error: te.message };
        }
        return jsonResponse({ ...result, disbursement, telegram });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'POST' && path === '/api/link/request') {"""
if old_alloc not in text:
    raise SystemExit('direct-allocate block not found — abort')
text = text.replace(old_alloc, new_alloc, 1)

old_nf = """    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  },
};
"""
new_routes = """    // ---- Phase 5: Telegram ----
    if (method === 'POST' && path === '/telegram/webhook') {
      const secret = env.TELEGRAM_WEBHOOK_SECRET;
      if (secret) {
        const hdr = request.headers.get('X-Telegram-Bot-Api-Secret-Token');
        if (hdr !== secret) {
          return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
        }
      }
      try {
        const update = await readJsonBody(request);
        if (!update) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
        const handler = new TelegramBotHandler(env.DB, env);
        const result = await handler.handleUpdate(update);
        return jsonResponse({ ok: true, ...result });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/api/telegram/sync-general') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      try {
        const sync = new TelegramSyncService(env.DB, env);
        const summary = await sync.syncGeneral();
        return jsonResponse({ ok: true, summary });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    if (method === 'POST' && path === '/api/telegram/groups') {
      if (!requireAdmin(request, env)) {
        return jsonResponse({ ok: false, error: 'unauthorized' }, 401);
      }
      const body = await readJsonBody(request);
      if (!body) return jsonResponse({ ok: false, error: 'invalid json' }, 400);
      try {
        const repo = new TelegramGroupRepository(env.DB);
        const row = await repo.upsertGroup({
          kind: body.kind,
          projectId: body.project_id || body.projectId || null,
          chatId: body.chat_id || body.chatId,
          title: body.title || null,
          inviteLink: body.invite_link || body.inviteLink || null,
        });
        return jsonResponse({ ok: true, group: row });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 400);
      }
    }

    if (method === 'GET' && path === '/api/telegram/groups') {
      try {
        const repo = new TelegramGroupRepository(env.DB);
        const groups = await repo.listActive();
        return jsonResponse({ ok: true, groups });
      } catch (e) {
        return jsonResponse({ ok: false, error: e.message }, 500);
      }
    }

    return jsonResponse({ ok: false, error: 'not_found' }, 404);
  },
};
"""
if old_nf not in text:
    raise SystemExit('not_found block not found — abort')
text = text.replace(old_nf, new_routes, 1)

p.write_text(text)
assert 'PLACEHOLDER' not in text
assert '/telegram/webhook' in text
print('Patched OK — lines:', text.count(chr(10)) + 1)
PY
python3 /tmp/apply_phase5_to_worker.py
```

تأیید بعد از patch:

```bash
wc -l indexer/worker.js
# انتظار: حدود ۶۷۸–۶۷۹ خط

grep -n "telegram/webhook\|TelegramSyncService\|phase: 5" indexer/worker.js
```

---

## گام ۵ — اصلاح import مربوط به `@noble/hashes`

```bash
sed -i "s|@noble/hashes/sha3'|@noble/hashes/sha3.js'|" indexer/services/WalletLinkService.js
grep -n "noble" indexer/services/WalletLinkService.js
```

باید این باشد:

```js
const { keccak_256 } = await import('@noble/hashes/sha3.js');
```

---

## گام ۶ — Commit و همگام‌سازی با remote

اگر remote جلوتر است و conflict روی `worker.js` پیش آمد، نسخهٔ patch‌شدهٔ محلی را نگه دارید:

```bash
git stash push -u -m "temp before rebase"
git pull --rebase origin feature/contribution-ledger

# در صورت conflict روی worker.js:
git checkout --ours indexer/worker.js
git add indexer/worker.js
GIT_EDITOR=true git rebase --continue

git add indexer/services/WalletLinkService.js indexer/worker.js
git commit -m "feat(phase5): wire Telegram routes + fix noble hashes import"
# یا amend اگر commit محلی از قبل بود

git push origin feature/contribution-ledger
git stash pop   # در صورت نیاز
```

---

## گام ۷ — Deploy

```bash
cd indexer && npx wrangler deploy
```

---

## گام ۸ — تنظیم Webhook تلگرام

```bash
curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
  -d "url=https://classchain-indexer.<your-subdomain>.workers.dev/telegram/webhook"
```

---

## APIهای فعال بعد از deploy

| Method | Path | نقش |
|--------|------|-----|
| POST | `/telegram/webhook` | دریافت update از تلگرام |
| POST | `/api/telegram/sync-general` | ادمین — reconcile گروه General |
| POST | `/api/telegram/groups` | ادمین — ثبت گروه GENERAL یا PROJECT |
| GET | `/api/telegram/groups` | لیست گروه‌های ثبت‌شده |

---

## جریان عملیاتی نهایی

```
واریز USDT به GENERAL_POOL
        ↓
Indexer → contribution_balances (unallocated > 0)
        ↓
کاربر ربات: /start + لینک والت (/link → API request/verify)
        ↓
POST /api/telegram/sync-general
        ↓
ربات لینک دعوت یک‌بارمصرف در DM می‌فرستد → join
        ↓
allocate به پروژه
        ↓
onAllocated → kick از General + دعوت به گروه پروژه (اگر ثبت شده)
```

**محدودیت تلگرام:** ربات نمی‌تواند کسی را که هرگز با ربات حرف نزده force-add کند؛ راه استاندارد همان invite link شخصی در DM است.

---

## تست دستی پیشنهادی

1. Migration + secrets + deploy + webhook  
2. ربات: `/start` → `/status`  
3. `POST /api/link/request` + امضا + `verify`  
4. واریز تستی + `POST /sync`  
5. `POST /api/telegram/sync-general` → DM دعوت  
6. بعد از allocate → خروج از General  

---

## وضعیت در پایان جلسهٔ ۲۰۲۶-۰۹-۲۶

- Migration و seed روی D1 اجرا شده  
- Patch روی `worker.js` محلی موفق (حدود ۶۷۸ خط)  
- اصلاح import `sha3.js` انجام شده  
- Push / deploy در همان جلسه به‌خاطر conflict با remote هنوز نیاز به تکمیل از **گام ۶** داشت  
