# Admin provision CLI Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Admin runs `npm run provision -- <user>` to allocate a free frp port, update `bridge/accounts.json`, and emit colleague-ready `config.json` + `frpc.toml`.

**Architecture:** Single Node ESM script `bridge/provision.mjs`; secrets from `~/.cursor-remote-lite/admin.json`; ledger in-repo; tokenized outputs under gitignored `bridge/out/<user>/`.

**Tech Stack:** Node 22+, no new dependencies.

## Global Constraints

- User must match `/^[a-zA-Z0-9._-]{1,64}$/`
- Ports 18001–18030 (overridable via ledger `portMin`/`portMax`)
- Never commit tokens in `accounts.json`

---

### Task 1: provision.mjs + npm script + gitignore + docs

**Files:**
- Create: `bridge/provision.mjs`
- Create: `bridge/accounts.json` (empty seed)
- Modify: `package.json` scripts
- Modify: `.gitignore` (`bridge/out/`)
- Modify: `使用步骤-Windows-内网使用.md`

- [x] Implement and verify locally with dry logic
- [x] Commit
