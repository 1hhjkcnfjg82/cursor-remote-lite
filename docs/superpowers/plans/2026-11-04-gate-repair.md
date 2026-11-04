# Gate「重新配对」Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the offline `#gate` retry screen, add a「重新配对」button that clears local pairing and returns to the unpaired paste/scan flow without confirmation.

**Architecture:** Extend the existing `#gate` overlay in `app/index.html`. Extract shared `unpairLocal()` used by the new button and menu logout. i18n via the existing Chinese→English table in `app/i18n.js`.

**Tech Stack:** Vanilla JS in `app/index.html`, `localStorage` (`cr-token` / `cr-key`), `Conn` from `app/conn.js`, MutationObserver i18n.

## Global Constraints

- No confirmation on gate「重新配对」; menu「取消本机配对」keeps `ask(...)`.
- Stop `retryTimer` before clearing state.
- `/api/logout` failures are ignored.
- Do not change Android `setup.html`, pairing protocol, or auto-retry intervals.

---

### Task 1: Gate button + unpairLocal + i18n

**Files:**
- Modify: `app/index.html` (`#gate` markup ~278, `gate()` ~371–392, handlers ~396, menu logout ~947–952)
- Modify: `app/i18n.js` (add `'重新配对': 'Re-pair'` near `'重试'`)

**Interfaces:**
- Produces: `async function unpairLocal()` — clears timer, best-effort logout, clears token/key, `Conn.reset()`, `showUnpaired()`

- [x] **Step 1: Add markup**

In `#gate`, after `#gateRetry`:

```html
<button id="gateRepair">重新配对</button>
```

- [x] **Step 2: Show/hide with retry**

In `gate()`, after the `gateRetry` lines:

```js
$('gateRepair').hidden = !retry;
```

- [x] **Step 3: Add `unpairLocal` and wire click**

Near `autoRetry` / gate handlers:

```js
async function unpairLocal() {
  clearTimeout(retryTimer);
  if (base) await post('/api/logout').catch(() => {});
  store.set('token', null);
  store.set('key', null);
  Conn.reset();
  showUnpaired();
}
$('gateRepair').onclick = () => { unpairLocal(); };
```

Update menu logout:

```js
else if (act === 'logout') {
  if (!await ask('取消本机配对？之后要在电脑上重新运行 npm run pair 才能再用。', '取消配对')) return;
  await unpairLocal();
}
```

- [x] **Step 4: i18n**

In `app/i18n.js` `EN` map, add next to `'重试'`:

```js
'重新配对': 'Re-pair',
```

- [ ] **Step 5: Manual verify**

1. Open paired app with PC offline → gate shows「重试」+「重新配对」.
2. Tap「重新配对」→ unpaired paste UI; `localStorage` has no `cr-token`/`cr-key`; no further auto-retry.
3. Tap「重试」still calls `boot()`.
4. English mode: button reads「Re-pair」.
5. Connected menu「取消本机配对」confirm → unpaired UI.

- [ ] **Step 6: Commit**

```bash
git add app/index.html app/i18n.js
git commit -m "Add re-pair on offline gate so users can switch computers."
```
