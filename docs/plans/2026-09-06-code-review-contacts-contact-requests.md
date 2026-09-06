# 代码审查修复计划（联系人 / 好友请求 / 用户主页）

> **For Claude:** 本计划对应的修复已全部落地于工作区，此处用于沉淀审查结论与待办。实现阶段参考 superpowers:executing-plans。

**Goal:** 对 `qulinquan-code` 的联系人、好友请求、用户主页相关模块做代码审查，修复分页口径不一致、配额查询缺索引、重复实现耦合、未登录误判、类型文件被忽略等问题，并明确遗留项。

**Scope:** `admin/lib/contacts.ts`、`admin/lib/contact-requests.ts`、`admin/lib/interest-events.ts`、`admin/db/schema.ts`；`frontend_uniapp/src/pages/user-home/user-home.vue`、`.gitignore`、`src/types/index.ts`。

**Tech Stack:** Next.js · Drizzle ORM · PostgreSQL（admin）；uni-app · Vue3 · alova（frontend_uniapp）。

---

## 关键文件速查

| 文件 | 动作 |
| --- | --- |
| `admin/lib/interest-events.ts` | MODIFY: 新增并导出 `startOfChinaDay(now)` 共享纯函数 |
| `admin/lib/contacts.ts` | MODIFY: 删除本地 `startOfChinaDay`，改从 `interest-events` 导入 |
| `admin/lib/contact-requests.ts` | MODIFY: `listContactRequests` 改为「取全量 + 内存分页」 |
| `admin/db/schema.ts` | MODIFY: 新增复合索引 `contact_requests_from_created_idx (from_user_id, created_at)` |
| `frontend_uniapp/src/pages/user-home/user-home.vue` | MODIFY: `fetchProfile` 区分 401 跳登录而非误显示「用户不存在」 |
| `frontend_uniapp/.gitignore` | MODIFY: 增加 `!src/types/index.ts` 例外 |
| `frontend_uniapp/src/types/index.ts` | 已被 gitignore 忽略 → 强制 `git add -f` 纳入版本控制 |

---

## 审查发现与处置（Issue 1–7）

### Issue 1 — `src/types/index.ts` 被 .gitignore 忽略（已修复）
- **现象**：手工维护的全量类型入口 `frontend_uniapp/src/types/index.ts` 落入 `.gitignore` 的 `src/types` 规则，未纳入版本控制，团队成员拉取后缺失。
- **修复**：`.gitignore` 增加 `!src/types/index.ts` 例外；已 `git add -f frontend_uniapp/src/types/index.ts`（`A` 状态）。

### Issue 2 — 好友请求列表分页末页漏项（已修复）
- **现象**：`listContactRequests` 原用「DB 计数 + DB 分页 + 内存过滤已注销用户」。当末页某行引用已注销用户被过滤后，`total` 与过滤后 `list` 口径不一致，前端因 `res.list.length < PAGE_SIZE` 提前 `finished`，漏掉后续页数据。
- **修复**：改为「一次性取该用户全部匹配行 → 批量补齐用户信息 → 内存统一过滤 → 内存分页」，保证 `total` 与 `list` 口径一致，与 `users/followed` 范式对齐。单用户好友请求量级很小，内存分页可接受。

### Issue 3 — 每日配额按时间窗查询缺索引（已修复）
- **现象**：每日联系配额按「发起方 + 创建时间范围」扫描 `contact_requests`，原索引仅覆盖 `(from_user_id, status)`，随历史请求增长会退化为全表扫描。
- **修复**：`schema.ts` 新增复合索引 `contact_requests_from_created_idx (from_user_id, created_at)`，支撑时间窗查询。

### Issue 4 — 关注列表 `users/followed` 内存分页扩展性（遗留）
- **现象**：`GET /api/users/followed` 当前为内存分页，其 `total` 与 `list` 口径本就一致（无 Issue 2 那种 bug），仅在大关注量下存在扩展性损耗。
- **处置**：考虑到与既有 `circles/followed` 范式一致、且联系人量级通常很小，**本次未改动**，留作后续按需优化。

### Issue 5 — 用户主页未登录误显示「用户不存在」（已修复）
- **现象**：`user-home.vue` 的 `fetchProfile` 捕获错误后一律 `notFound = true`，未登录命中 401 时被误判为「用户不存在」。
- **修复**：捕获块区分 `HttpError.statusCode === 401` → `toLoginPage()` 引导登录；其余错误才置 `notFound`。

### Issue 6 — `resolveUserContact` 的 `!targetRow` 分支（保留）
- **现象**：审查标记为疑似死代码。
- **处置**：复核后保留。该分支是必要的空值防御——调用方虽已 404，但该函数契约需对可空 `targetRow` 容错；直接删除会因 `targetRow` 可空触发 TS 报错。

### Issue 7 — `startOfChinaDay` 重复定义耦合 `chinaDay`（已修复）
- **现象**：`contacts.ts` 本地重复实现 `startOfChinaDay`，与 `interest-events.ts` 的 `chinaDay` 存在隐式口径耦合，易漂移。
- **修复**：在 `interest-events.ts` 新增并导出 `startOfChinaDay(now = new Date())` 共享纯函数，`contacts.ts` 改为导入复用，删除本地副本。

---

## 待办（必做 / 后续）

1. **数据库迁移（必做）**：`schema.ts` 新增索引尚未生成迁移 SQL，请在 `admin/` 执行：
   ```
   pnpm db:generate && pnpm db:migrate
   ```
   （`db:generate` 会基于当前 schema 与最新迁移的差异产出含 `CREATE INDEX` 的新迁移文件。）

2. **Issue 4 后续优化**：在关注量显著增长的场景下，评估将 `users/followed` 改为数据库层分页。

3. **验证**：跑 `admin` 的 `pnpm type-check` 与前端构建确认无误；确认 `src/types/index.ts` 已随提交入库。
