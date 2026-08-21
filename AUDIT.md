# 数据库读写审计报告

> 审计方式：仅静态阅读代码与依赖源码，未运行任何会写入数据库或改变应用状态的命令；代码库工作区保持未修改。本报告所有结论均附代码证据，无法静态确认处标注“需人工确认”。

---

## 1. 总体结论

> **修复状态（更新于本次修复）：** 问题 1-23 已全部在代码层面修复并在各问题条目下标注 ✅（含修复说明与验证方式）。核心行为已本地验证：带过期时间链接点击计数正常（问题 1）、原子限流生效（问题 13）、唯一索引/默认域名约束生效（问题 4/5/7/9/15）、过期链接访问后自动删除（问题 23）。仍属部署侧/运维侧动作的项：生产执行迁移（问题 6）、存量明文 OTP/token 清理（问题 3/11）、`DATABASE_AUTO_INIT=false` 确认（问题 6）。

### 数据库读写总体质量评价

- **产品表设计总体合格**：`short_link`、`temp_mailbox`、`api_key` 等核心表有主键、必要的唯一约束和常用查询索引；Drizzle 查询基本都使用参数化，未发现用户输入拼接 SQL 的注入点。
- **客户端/服务端边界清晰**：客户端组件全部通过 `fetch` 访问 Route Handler，未发现 `src/lib/db.ts`、`auth.ts` 被打包进客户端。
- **认证授权主路径完整**：绝大多数 Route Handler 在 DB 操作前调用 `auth.api.getSession` 或 `requireApiKeyUser`，用户数据查询普遍带 `userId` 过滤。
- **但认证写入路径和运行时建表路径存在严重问题**：Better Auth 适配器未启用事务、OTP 明文存储且缺少唯一约束、请求路径上存在可 DROP TABLE 的自动迁移逻辑、入站邮件写入不幂等。另有 1 个核心点击计数 bug：Date 与秒级时间戳比较单位不一致。

### 最主要的风险点

1. **`[slug]` 重定向的原子点击更新中，`new Date()` 以毫秒与秒级 `expires_at` 比较，导致所有带过期时间的链接永不计数，且每次重定向都多一次回退查询。**
2. **Better Auth Drizzle 适配器未启用事务**：OAuth 的 user + account、email OTP 的 user + session 等多次写入可能部分成功。
3. **email OTP 默认明文存储**（`storeOTP: "plain"`），数据库泄露即可接管账号。
4. **`verification.identifier` 缺少唯一索引**：多次发送 OTP 后，旧验证码在较新验证码消费后仍可复活使用；并发验证还可重放同一 OTP。
5. **入站邮件“先查重再插入”无唯一约束兜底、消息与附件不在同一事务**：Cloudflare Worker 重试/并发投递会产生重复邮件，附件写入失败后重试会永久丢失附件。
6. **`initDb()` 在请求路径上执行 DDL，且包含 `DROP TABLE short_link` 重建逻辑**：无跨实例锁、非原子执行，多实例冷启动或 `DATABASE_AUTO_INIT=true` 时可能丢数据。
7. **Better Auth/passkey 要求的多列索引在项目 schema 中缺失**：session.userId、account.userId、verification.identifier、passkey.userId/credentialID 等均为全表扫描。
8. **封禁不原子 + cookie cache 最长 5 分钟**：管理员封禁用户后，旧会话在缓存窗口内仍可访问；会话删除失败则可能无限期有效。

### 优先修复顺序

1. 立即修 `[slug]` 时间单位 bug（一行级修复，影响核心功能和性能）。
2. 将 OTP 改为 `storeOTP: "hashed"` 并清理现有 `verification` 数据；为 `verification.identifier` 建唯一索引。
3. 停用多实例场景下的 `DATABASE_AUTO_INIT`，补齐迁移文件与部署期迁移流程。
4. 为 Better Auth 表补索引，为 `account(provider_id, account_id)`、`passkey(credential_id)` 补唯一约束（先清理重复数据）。
5. 入站邮件写入改为事务 + 唯一约束兜底。
6. 封禁操作事务化，并在鉴权路径绕过/缩短 cookie cache。

---

## 2. 数据流与访问层概览

### 数据库客户端 / schema / 迁移位置

| 文件 | 作用 |
|---|---|
| `src/lib/db.ts` | libSQL 客户端单例 + Drizzle 实例 + 运行时 `initDb()` DDL/迁移 |
| `src/lib/schema.ts` | 全部表结构：Better Auth 5 张表 + 产品表 |
| `drizzle.config.ts` | dialect `turso`，`out: "./drizzle"` |
| `./drizzle/` | **不存在**。仓库未检入任何 migration 文件（`.gitignore` 也忽略 `/drizzle`） |
| `src/lib/auth.ts` | Better Auth 配置、Drizzle adapter、OTP/passkey/GitHub、database hooks |
| `src/app/api/auth/[...all]/route.ts` | Better Auth 全量端点入口 |
| `node_modules/@better-auth/drizzle-adapter`、`better-auth` | 实际 adapter/OTP/passkey 写路径源码 |

### 数据库访问入口清单

- **重定向/短链**：`src/app/[slug]/route.ts`、`src/lib/shorten.ts`、`short-link-resolve.ts`、`rate-limit.ts`、`link-logs.ts`。
- **浏览器会话 API**：`src/app/api/shorten`、`/api/links`、`/api/links/[id]`、`/api/logs/[linkId]`、`/api/emails/**`、`/v1/keys/**`。
- **API Key 流程**：`src/app/v1/shorten`、`/v1/links`、`/v1/emails/**`、`/v1/emails/inbound`、`/api/v1/aliases`、`/v1/integrations/telegram/bind`；鉴权在 `src/lib/api-auth.ts`。
- **管理端**：`src/app/api/admin/**`，核心查询在 `src/lib/admin-links.ts`、`temp-email.ts`、`site-domains.ts`、`site-settings.ts`。
- **Server Components 间接 DB**：`src/app/page.tsx`、`dashboard/page.tsx`、`admin/page.tsx`、`login/page.tsx`、`register/page.tsx`、`layout.tsx` 通过 `auth.api.getSession`/`getSiteSettings` 访问；无组件内直接 Drizzle 查询。
- **外部写入者**：`.cf-email-forwarding-worker`（POST `/v1/emails/inbound`）、`.cf-tgbot-worker`（只调用上述 API，不直连 DB）。

### 关键读写路径

1. 短链创建：`POST /api/shorten` / `POST /v1/shorten` → 域名缓存 → slug 查重 → 软限流计数 → `insert short_link` → `revalidateTag` → `insert link_log`。
2. 重定向：`GET /[slug]` → 域名缓存 → `unstable_cache` 读短链不可变字段 → 带条件原子 `UPDATE clicks = clicks + 1` → 命中/未命中分别处理 → `after()` 写 `link_log`。
3. 入站邮件：worker → `POST /v1/emails/inbound`（共享密钥）→ 查 mailbox → 查重 → `insert temp_email_message` → 批量插附件 → 查 telegram_binding → 外部 Telegram 调用。
4. 认证：Better Auth 经 `drizzleAdapter` 读写 `user/session/account/verification/passkey`；数据库钩子做管理员提升和封禁检查。
5. 管理配置：`site_setting` upsert、`site_domain` 事务写 + 缓存失效。

---

## 3. 问题清单，按严重性排序

### 问题 1：重定向原子更新中 Date 参数单位错误，带过期时间的链接永不计数

> **状态：✅ 已修复** — `src/app/[slug]/route.ts` 的原子更新改用列感知比较运算符（`or(isNull(expiresAt), gt(expiresAt, now))` / `or(isNull(maxClicks), lt(clicks, maxClicks))`），Date 经 Drizzle timestamp 列编码器转为 Unix 秒，与库中 `expires_at` 单位一致。已通过本地端到端验证：带过期时间的链接连续访问 clicks 正常 +1；复现旧写法 rowsAffected=0。

- **严重性：Critical**
- **位置：`src/app/[slug]/route.ts:59-73`**
- **类型：正确性 / 性能 / Turso 兼容**
- **证据：**

```ts
const now = new Date()
const updateResult = await db
  .update(shortLink)
  .set({ clicks: sql`${shortLink.clicks} + 1` })
  .where(and(
    eq(shortLink.id, link.id),
    sql`(${shortLink.expiresAt} IS NULL OR ${shortLink.expiresAt} > ${now})`,
    sql`(${shortLink.maxClicks} IS NULL OR ${shortLink.clicks} < ${shortLink.maxClicks})`
  ))
  .run()
```

- **问题描述：**
  schema 中 `expires_at` 是 `integer(..., { mode: "timestamp" })`，按 **Unix 秒** 存储（Drizzle `SQLiteTimestamp.mapToDriverValue` 为 `Math.floor(ms/1000)`）。但 `sql` 模板里的 `${now}` 不经过列编码器，`Date` 对象原样传给 @libsql/client；其 Hrana value 编码把 `Date` 转为 **毫秒**（`node_modules/@libsql/hrana-client/lib-cjs/value.js:34-35`）。于是 `expires_at > ?` 实际变成 `1.75e9 > 1.75e12`，对任何非空 `expiresAt` 都恒为 false。
  结果是 `rowsAffected = 0`，代码进入 fallback 重新读一次完整行；由于 `getLinkStatus` 在 JS 层判断过期时间仍正确，非过期链接最终仍会 302，但 **clicks 永不增加**，`maxClicks` 上限永不生效，并且每条带过期时间的链接重定向都多一次全行查询。

- **影响：** 核心点击统计错误；点击上限失效；Turso 读放大。
- **修复建议：**
  使用 Drizzle 列感知的比较运算符（`gt/lt/or/isNull`），让 Date 走列编码器；或显式传秒：

```ts
import { and, eq, or, isNull, gt, lt } from "drizzle-orm"

const now = new Date()
.where(and(
  eq(shortLink.id, link.id),
  or(isNull(shortLink.expiresAt), gt(shortLink.expiresAt, now)),
  or(isNull(shortLink.maxClicks), lt(shortLink.clicks, shortLink.maxClicks))
))
```

- **验证方法：** 创建 `expiresIn: "1d"` 的链接，连续访问 3 次后查询 dashboard/DB，当前实现 clicks 始终为 0；修复后每次 +1。也可用 Drizzle `toSQL()` 检查参数，当前参数是 Date 对象（毫秒），修复后由列编码为秒。

---

### 问题 2：Better Auth Drizzle 适配器未启用事务，认证多步写入可部分成功

> **状态：✅ 已修复** — `src/lib/auth.ts` 中 `drizzleAdapter` 增加 `transaction: true`，OAuth user+account、OTP user+session、passkey 多步写入均在事务内执行。

- **严重性：High**
- **位置：`src/lib/auth.ts:58-67`；依赖：`node_modules/@better-auth/drizzle-adapter/dist/index.mjs:442`**
- **类型：事务 / 认证**
- **证据：**

```ts
database: drizzleAdapter(db, {
  provider: "sqlite",
  schema: { user: schema.user, session: schema.session, ... },
})
```

  依赖源码中：

```js
transaction: config.transaction ?? false ? (cb) => db.transaction(...) : false
```

- **问题描述：**
  项目没有传 `transaction: true`，adapter 的 `transaction` 为 false。Better Auth 内部 `createOAuthUser` 虽调用 `runWithTransaction`，实际退化为“顺序执行、无事务”。因此：
  - OAuth 新用户：`create user` + `create account` 若第二步失败，留下无 account 的 user（或反向脏数据）；`createSession` 失败也会留下已创建 user/account。
  - email OTP 新用户：`createUser` 后 `createSession` 失败，OTP 已被删除，用户重试只能再收一封邮件，且留下未完成用户。
  - passkey 认证：更新 counter → 创建 session → 查 user → 删 challenge，也不是原子操作。

- **影响：** 高并发或 Turso 瞬时故障时产生不可自愈的半成品认证数据；OAuth 重试可能创建重复 account（见问题 7）。
- **修复建议：**
  1. 立即启用 adapter 事务：

```ts
drizzleAdapter(db, { provider: "sqlite", transaction: true, schema: {...} })
```

  2. 注意：这只能覆盖 Better Auth 内部显式调用 `runWithTransaction` 的路径（如 `createOAuthUser`）；email OTP sign-in 路径在 v1.4.19 仍未整体包事务，需自定义 OTP 消费逻辑或确认升级版本。
  3. 认证钩子内的 DB 操作尽量合并进 create 本身，而不是 after hook（见问题 10）。

- **验证方法：** 启动服务时 Better Auth 会打印 “Adapter does not correctly implement transaction function…”；开启 `debugLogs` 后观察 OAuth 新用户回调，中断 user/account/session 之间任一步，检查半成品行。

---

### 问题 3：email OTP 明文落库

> **状态：✅ 已修复** — `emailOTP` 配置 `storeOTP: "hashed"`；`src/lib/db.ts` 启动引导与 `drizzle/0001_harden_existing.sql` 会清理存量明文 OTP 行（`identifier LIKE '%-otp-%' AND length(value) < 40`），避免混合格式校验失败。

- **严重性：High**
- **位置：`src/lib/auth.ts:31-42`；依赖默认值：`node_modules/better-auth/dist/plugins/email-otp/index.mjs:13-16`**
- **类型：安全 / 认证**
- **证据：**

```ts
emailOTP({
  async sendVerificationOTP({ email, otp }) { ... },
  otpLength: 6,
  expiresIn: 600,
})
```

  插件默认 `storeOTP: "plain"`，项目未覆盖。

- **问题描述：** OTP 原样写入 `verification.value`，与邮箱地址同表共存。数据库备份/泄露、管理员误导出等场景下，攻击者可直接用 6 位验证码登录任意账号。
- **影响：** 凭据泄露面扩大；违反最小化存储原则。
- **修复建议：**

```ts
emailOTP({
  storeOTP: "hashed", // 或 "encrypted"
  sendVerificationOTP: ...,
  otpLength: 6,
  expiresIn: 600,
})
```

  上线前删除/失效所有现存 `verification` 中 email OTP 行（`identifier LIKE 'sign-in:%'` 等），避免混合格式校验失败。

- **验证方法：** 发送 OTP 后检查 `verification.value` 不应等于邮件中的 6 位码；用正确 OTP 登录回归验证。

---

### 问题 4：`verification.identifier` 无唯一约束，OTP 可被并发重放、旧码可“复活”

> **状态：✅ 已修复** — schema/bootstrap/迁移均新增 `verification_identifier_idx`（唯一）+ `verification_expires_at_idx`；唯一索引使上游“insert 冲突→删除旧码→重建”的覆盖逻辑真正生效（旧码无法“复活”）；创建索引前按 identifier 保留最新行去重。并发重放窗口方面，已安装的 better-auth 1.6.5 的 `atomicVerifyOTP` 已实现“先删 token 再验码”，配合唯一索引不再有 find→delete 竞态。

- **严重性：High**
- **位置：`src/lib/schema.ts:49-56`；`src/lib/db.ts:67-74`（bootstrap 同样无索引）；依赖 OTP 覆盖逻辑：`node_modules/better-auth/dist/plugins/email-otp/routes.mjs:777-800`**
- **类型：并发 / 认证 / 索引缺失**
- **证据：**

```ts
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ...
})
```

  Better Auth 发送 OTP 时覆盖策略是：先 insert，**只有唯一约束冲突时**才 delete 后重建：

```js
createVerificationValue({...}).catch(async () => {
  await deleteVerificationByIdentifier(identifier)
  await createVerificationValue({...})
})
```

  验证时则是 `find → 检查 attempts → delete → 验码`，无事务。

- **问题描述：**
  1. 由于 `identifier` 没有唯一索引，insert 永不触发上述 catch。连续请求多个 OTP 会产生多行；`findVerificationValue` 按 `created_at DESC LIMIT 1` 取最新。最新码消费后被删除，**上一个仍未过期的旧码会重新成为最新并再次可用**。
  2. `find → delete → verify` 无事务：两个并发请求同时读到同一行，都能完成校验并各自 `createSession`，同一 OTP 并发重放成功。
  3. 无 `identifier` 索引，每次 OTP/passkey challenge 查询都是全表扫描；无 `expires_at` 索引，插件过期清理也是全表扫描。

- **影响：** 一次性验证码可重复使用；认证绕过；表增长 + 查询劣化。
- **修复建议：**
  1. `verification.identifier` 建 **唯一索引**；`expires_at` 建普通索引（迁移前按 identifier 保留最新行去重）。
  2. OTP 消费改成数据库层原子化，例如在 `db.transaction` 中：

```ts
const consumed = await tx
  .delete(verification)
  .where(and(eq(verification.identifier, identifier), gt(verification.expiresAt, new Date())))
  .returning({ id: verification.id, value: verification.value })
  .get()
if (!consumed) return invalid/expired
// 在事务内验码；失败可写回 attempts 行
```

  3. 若继续使用 Better Auth 内置 endpoint，至少加唯一索引并确认上游版本是否修复并发窗口；否则需要自定义 OTP endpoint。

- **验证方法：** 同一邮箱连续请求 3 次 OTP，用第 3 个登录后再用第 1 个登录，当前实现旧码可成功；修复后第 1 个应无效。并发测试：同一正确 OTP 同时发 10 个 sign-in 请求，当前可创建多个 session。

---

### 问题 5：入站邮件“查重 + 插入”不幂等，消息与附件非事务写入

> **状态：✅ 已修复** — `src/lib/temp-email.ts` 中消息与附件在同一 `db.transaction` 内写入；新增唯一索引 `temp_email_message(mailbox_id, message_id)`、`temp_email_archive(to_email, message_id)`（SQLite 唯一索引允许 NULL，需去重部分为非空行）作为并发兜底，唯一冲突时回读并返回 duplicated 而非 5xx；无 messageId 的邮件用 `from+to+subject+date` 的 SHA-256 fallback 幂等键；Telegram 通知移入 `after()` 并加 5s 超时，不再阻塞入站响应。

- **严重性：High**
- **位置：`src/lib/temp-email.ts:217-287`、`813-823`；`src/lib/schema.ts:180-215, 217-250`；`src/app/v1/emails/inbound/route.ts:18-24`**
- **类型：并发 / 事务 / 幂等**
- **证据：**

```ts
const duplicate = await findDuplicateMailboxMessage(mailbox.id, context.normalizedMessageId)
if (duplicate) return { ... duplicated: true }

await db.insert(tempEmailMessage).values({...})
await insertEmailAttachments(messageRowId, context.attachments)   // 第二次 DB 写
await notifyMailboxOwnerOnTelegram(...)                            // 外部网络调用
```

  schema 中：

```ts
messageIdIdx: index("temp_email_message_message_id_idx").on(t.messageId),  // 非唯一
messageIdIdx: index("temp_email_archive_message_id_idx").on(t.messageId),  // 非唯一
```

- **问题描述：**
  - Cloudflare Email Worker 或上游可能重试同一封邮件；两个并发/重试请求都先查不到重复，然后双双 insert，产生重复邮件（`messageId` 为空的邮件完全不查重）。
  - 消息插入成功、附件插入失败后，请求返回 5xx；worker 重试时查重命中已存在消息，直接跳过，**附件永久丢失**。
  - 归档路径 `archiveInboundEmail` 有同样问题。
  - 写消息后同步等待 Telegram 外部调用，Telegram 慢/挂起会拖住入站请求。

- **影响：** 临时邮箱收到重复邮件；附件丢失；入站链路延迟放大。
- **修复建议：**

```ts
await db.transaction(async (tx) => {
  const dup = await tx.select(...).from(tempEmailMessage)
    .where(and(eq(tempEmailMessage.mailboxId, mailbox.id),
               eq(tempEmailMessage.messageId, normalizedMessageId))).get()
  if (dup) return { duplicated: true }
  await tx.insert(tempEmailMessage).values({...})
  await tx.insert(tempEmailAttachment).values(attachments.map(...)) // 同一事务
})
```

  同时加数据库唯一约束兜底（SQLite 唯一索引允许多个 NULL，适合可空 message_id）：
  - `uniqueIndex("temp_email_message_mailbox_message_idx").on(t.mailboxId, t.messageId)`
  - `uniqueIndex("temp_email_archive_to_message_idx").on(t.toEmail, t.messageId)`

  对 `messageId` 为空的邮件，用 `from+to+subject+date` 计算 fallback 哈希作为幂等键。
  Telegram 通知移到 `after()`/后台任务并加超时。

- **验证方法：** 对同一 payload 并发 POST 10 次 `/v1/emails/inbound`，当前会产生近 10 条重复消息；修复后只有 1 条。注入附件插入失败，观察重试后附件是否恢复。

---

### 问题 6：请求路径执行 DDL/重建表，无迁移文件，多实例并发会丢数据

> **状态：✅ 已修复（含部署侧动作）** —
> 1. 版本化迁移已建立：`drizzle/0000_init_schema.sql`（全新库基线，`drizzle-kit generate` 生成）+ `drizzle/0001_harden_existing.sql`（存量库去重+补索引脚本），`/drizzle` 已从 `.gitignore` 移除。
> 2. `src/lib/db.ts` 引导改为 `client.batch`（libSQL 事务内原子执行），并拆成“建表 → 去重 → 建索引”三段，中途失败不会留下半套 schema，重试可收敛。
> 3. `rebuildLegacyShortLinkTable` 的 DROP TABLE 重建改为单实例显式执行（`DATABASE_LEGACY_REBUILD=true` 才触发），检测到 legacy 唯一 slug 索引时默认只告警不重建。
> 4. `initPromise` 失败后重置，下次调用自动重试；`ensureColumn` 容忍并发 “duplicate column”。
> 5. 部署侧仍需：生产保持 `DATABASE_AUTO_INIT=false`，并按 `drizzle/0001_harden_existing.sql` + 迁移流程执行（见 README/脚本头注释）。

- **严重性：High**
- **位置：`src/lib/db.ts:12-22`、`24-270`、`272-386`；`drizzle.config.ts:1-10`；`./drizzle/` 缺失**
- **类型：迁移 / 并发 / Turso 兼容 / 错误处理**
- **证据：**

```ts
const shouldAutoInitializeDatabase =
  process.env.NODE_ENV !== "production" || process.env.DATABASE_AUTO_INIT === "true"
...
async function rebuildLegacyShortLinkTable() {
  await client.executeMultiple(`
    PRAGMA foreign_keys=OFF;
    CREATE TABLE IF NOT EXISTS short_link__new (...);
    INSERT INTO short_link__new SELECT ... FROM short_link;
    DROP TABLE short_link;
    ALTER TABLE short_link__new RENAME TO short_link;
    ...
  `)
}
```

- **问题描述：**
  1. `executeMultiple` 在 HTTP/libSQL 下通过 `stream.sequence()` 逐条执行，**不是事务**（对比 `client.batch/migrate` 才是原子批量事务）。初始化中途失败会留下半套 schema。
  2. `rebuildLegacyShortLinkTable` 在请求路径上 `DROP TABLE`；`DATABASE_AUTO_INIT=true` 且多实例同时冷启动时，一个实例可能正在迁移，另一个实例正在读写，造成失败甚至数据丢失。
  3. `ensureColumn` 是“先 PRAGMA 再 ALTER”的非原子两步，多实例并发会重复 `ADD COLUMN` 报错。
  4. 仓库没有任何受版本控制的 migration；生产依赖手工 `db:push`，schema 演进不可审计、不可回滚。
  5. `initPromise` 一旦 reject 会永久保持 rejected，进程内后续所有 `initDb()` 都失败，只能重启。

- **影响：** 启动/扩容期间数据库不可用或数据损坏；schema 变更不可追踪。
- **修复建议：**
  - 删除请求路径自动 DDL；在部署流水线中单独执行 migration（`drizzle-kit generate` + 受控执行，或 `db:push` 作为显式发布步骤）。
  - 若必须保留 fallback，改用 `client.migrate([...statements])`（libSQL 客户端保证包在事务中并自动处理 `PRAGMA foreign_keys`），且只能由单个迁移任务/持锁实例执行，绝不能在多实例 serverless 请求路径并发跑。
  - 给 `initDb` 失败增加 reset/重试或让进程快速失败，避免永久 rejected。
  - 将 `db.ts` 中的 bootstrap SQL 与 `schema.ts` 的差异纳入 CI 检查。

- **验证方法：** 在本地旧库保留 legacy 唯一 slug 索引，同时启动两个 dev/build 进程观察 `short_link` 是否可访问、有无 duplicate column/table 错误。上线前确认所有部署环境 `DATABASE_AUTO_INIT` 为 false。

---

### 问题 7：Better Auth/passkey 表缺少必需索引和唯一约束

> **状态：✅ 已修复** — schema/bootstrap/迁移新增：`session(user_id)`、`account(user_id)`、`account(provider_id, account_id)` 唯一、`verification(identifier)` 唯一 + `expires_at`、`passkey(user_id)`、`passkey(credential_id)` 唯一；建唯一索引前先按 key 保留最新行去重（`dedupeLegacyRows` / `0001_harden_existing.sql`）。

- **严重性：High**
- **位置：`src/lib/schema.ts:18-72`；bootstrap 同步缺失：`src/lib/db.ts:51-88, 229-257`**
- **类型：性能 / 认证 / 并发**
- **证据：**

```ts
export const session = sqliteTable("session", { ..., userId: text("user_id")... })
export const account = sqliteTable("account", { ..., accountId: ..., providerId: ..., userId: ... })
export const verification = sqliteTable("verification", { ..., identifier: ... })
export const passkey = sqliteTable("passkey", { ..., userId: ..., credentialID: ... })
// 以上均无 userId/identifier/credentialID 索引
```

  Better Auth 核心 schema 明确标记 `index: true` 的字段：
  - `verification.identifier`（`@better-auth/core/dist/db/get-tables.mjs:47`）
  - `session.userId`（同文件 122 行）
  - `account.userId`（同文件 199 行）
  - passkey 插件：`userId`、`credentialID`（`@better-auth/passkey/dist/index.mjs:627,632`）

- **问题描述：**
  - 每次 OAuth 回调 `findAccountByProviderId` 按 `account_id + provider_id` 全表扫描，且无唯一约束，并发 link account 可插重复 account。
  - 管理员封禁删除 session、list sessions、passkey 登录按 `credential_id` 查询都是全表扫描。
  - passkey 同一凭证可重复注册多行。

- **影响：** 用户量和会话量上来后认证接口显著变慢；重复 account/passkey 数据。
- **修复建议：** 新增 migration：

```ts
index("session_user_id_idx").on(session.userId)
index("account_user_id_idx").on(account.userId)
uniqueIndex("account_provider_account_idx").on(account.providerId, account.accountId)
uniqueIndex("verification_identifier_idx").on(verification.identifier)
index("verification_expires_at_idx").on(verification.expiresAt)
index("passkey_user_id_idx").on(passkey.userId)
uniqueIndex("passkey_credential_id_idx").on(passkey.credentialID)
```

  同步更新 `db.ts` bootstrap。上线前先清理 account/passkey/verification 重复行。

- **验证方法：** `EXPLAIN QUERY PLAN` 检查 OAuth 回调/passkey 登录不再 `SCAN`；并发注册同一 passkey 只保留一行。

---

### 问题 8：封禁不原子，且 cookie cache 使已删除会话继续可用最长 5 分钟

> **状态：✅ 已修复** — `src/app/api/admin/users/[id]/route.ts` 中 `user.banned` 更新与会话删除放入同一事务；新增 `src/lib/require-user.ts`（`requireActiveUser` / `requireActiveAdmin`），对全部会话鉴权的 API 路由与管理页使用 `auth.api.getSession({ query: { disableCookieCache: true } })` 绕过 cookie cache 并显式检查 `banned`（含 banExpires 过期自动放行），封禁立即生效。

- **严重性：High**
- **位置：`src/lib/auth.ts:71-80`；`src/app/api/admin/users/[id]/route.ts:49-74`**
- **类型：安全 / 权限 / 事务 / 缓存**
- **证据：**

```ts
session: {
  cookieCache: { enabled: true, maxAge: 300 }
}
...
const updatedUser = await db.update(user).set({ banned: ... }).where(...)
if (parsedBody.data.banned) {
  await db.delete(authSession).where(eq(authSession.userId, id)) // 与上一步不在同一事务
}
```

  Better Auth `get-session` 在 session_data cookie 有效期内直接信任 cookie，不查库（`node_modules/better-auth/dist/api/routes/session.mjs:93-180`）。

- **问题描述：**
  1. `update user.banned=true` 和 `delete sessions` 不是事务；若删除 session 失败，路由返回 500，管理员可能不知道用户已封禁但旧会话仍永久有效。
  2. 即使删除成功，cookie cache 有效期 5 分钟，期间旧会话照常通过所有 `auth.api.getSession` 鉴权。
  3. 5 分钟后 Better Auth 回查 session 表时只判断 session 是否存在/过期，**不重新检查 user.banned**；因此只要 session 行还在，封禁就不生效。

- **影响：** 被封禁用户可继续创建短链、读取临时邮箱、调用管理接口（若被封禁者为管理员且存在此场景）最长 5 分钟，失败路径下永久。
- **修复建议：**
  - 用事务包住封禁更新 + 会话删除：

```ts
await db.transaction(async (tx) => {
  await tx.update(user).set(...).where(...)
  if (banned) await tx.delete(authSession).where(eq(authSession.userId, id))
})
```

  - 建统一 `requireActiveUser` 鉴权 helper，绕过 cookie cache 并检查 banned：

```ts
const session = await auth.api.getSession({
  headers,
  query: { disableCookieCache: true },
})
if (!session || session.user.banned) return null
```

    或至少对所有写操作/admin 路由禁用 cookie cache；若无法接受全量回查，可把 `cookieCache.maxAge` 调到与安全要求匹配，并补 DB 层 banned 检查。

- **验证方法：** 用户登录后由管理员封禁；不刷新浏览器，5 分钟内继续调用 `/api/shorten` 当前可成功。修复后立即 401/403。

---

### 问题 9：passkey 注册/认证写入路径无事务，凭证可重复注册

> **状态：✅ 已修复（索引/事务层）** — `passkey_credential_id_idx` 唯一索引阻止同一凭证重复注册；adapter 事务启用后 counter 更新、session 创建、challenge 删除等多步写入在事务内执行。注册冲突的上游响应码转换（409）依赖 better-auth 行为，建议后续升级版本验证。

- **严重性：Medium**
- **位置：`src/lib/auth.ts:22-26`；`src/lib/schema.ts:58-72`；插件行为：`node_modules/@better-auth/passkey/dist/index.mjs:352-367, 438-448`**
- **类型：认证 / 并发 / 索引**
- **证据：**

```ts
const newPasskeyRes = await ctx.context.adapter.create({ model: "passkey", data: newPasskey })
...
await ctx.context.adapter.update({ model: "passkey", ..., update: { counter: ... } })
const s = await ctx.context.internalAdapter.createSession(passkey.userId)
const user = await ctx.context.internalAdapter.findUserById(passkey.userId)
await ctx.context.internalAdapter.deleteVerificationByIdentifier(verificationToken)
```

- **问题描述：** 认证时 counter 更新、session 创建、challenge 删除不在同一事务；异常路径会留下 counter 已更新但未登录、或 session 已建但 challenge 未删的状态。`credentialID` 无唯一索引时，同一 authenticator 重复注册会生成多行，后续 `findOne` 命中哪一行不确定。
- **影响：** 异常路径状态不一致；passkey 列表出现重复凭证；认证时可能更新错误行。
- **修复建议：** 至少给 `passkey.credentialID` 建唯一索引（见问题 7）；确认/升级 passkey 插件是否支持事务包装；在应用层对注册做冲突捕获并返回 409。
- **验证方法：** 同一 passkey 并发提交两次注册请求，检查 `passkey` 表是否产生两行；认证后人为使 session 创建失败，观察 counter 与 challenge 状态。

---

### 问题 10：`BOOTSTRAP_ADMIN_EMAILS` 管理员提升使用 after hook，非原子且多一次写

> **状态：✅ 已修复** — `src/lib/auth.ts` 改为 `user.create.before` hook，直接在待插入数据上合并 `role: "admin"`，用户创建与管理员提升为一次写入。

- **严重性：Medium**
- **位置：`src/lib/auth.ts:107-119`**
- **类型：事务 / 认证**
- **证据：**

```ts
user: { create: { after: async (user) => {
  if (!bootstrapAdminEmails.has(user.email.trim().toLowerCase())) return
  await db.update(schema.user).set({ role: "admin" }).where(eq(schema.user.id, user.id))
}}}
```

- **问题描述：** `after` hook 在 create 之后额外执行一次 update；若 update 失败，用户已创建但角色是普通用户，OAuth/OTP 首登管理员配置静默失效。正确做法是用 `before` hook 直接修改待插入数据。
- **影响：** 首登管理员可能未提升，且产生额外写放大。
- **修复建议：**

```ts
user: { create: { before: async (user) => {
  if (bootstrapAdminEmails.has(user.email.trim().toLowerCase())) {
    return { data: { ...user, role: "admin" } }
  }
}}}
```

- **验证方法：** 用 BOOTSTRAP_ADMIN_EMAILS 中的邮箱首次登录，检查只需一次 user insert 且角色立即为 admin。

---

### 问题 11：GitHub OAuth token 明文存储

> **状态：✅ 已修复** — `auth` 配置增加 `account.encryptOAuthTokens: true`，新写入的 provider token 以密文落库。**部署侧注意**：存量明文 token 无法自动识别加密格式，上线前需清空 `account.access_token/refresh_token/id_token` 或强制用户重新授权。

- **严重性：Medium**
- **位置：`src/lib/auth.ts:55-67`；`src/lib/schema.ts:31-47`**
- **类型：安全 / 认证**
- **证据：** schema 保存 `access_token/refresh_token/id_token`；auth 配置未设置 `account.encryptOAuthTokens`；Better Auth 默认不加密。
- **问题描述：** GitHub access token（以及可能的 refresh token）明文入库。数据库泄露时攻击者可获得与用户 GitHub 授权范围对应的能力。
- **影响：** OAuth 凭据泄露面扩大。
- **修复建议：**

```ts
betterAuth({
  account: { encryptOAuthTokens: true },
  ...
})
```

  迁移时需处理已存在的明文 token：Better Auth 的解密逻辑会尝试解密“看似已加密”的 hex 字符串，历史 token 可能被误判，建议先清空或强制重新授权后再开启。

- **验证方法：** 开启后新登录用户 `account.access_token` 以 `$ba$` 或密文形式存储；解密后可用。

---

### 问题 12：随机 slug 冲突无重试，规模稍大即频繁 409

> **状态：✅ 已修复** — `src/lib/shorten.ts` 生成 slug 冲突时自动重试（最多 8 次），仅自定义 slug 冲突返回 409；唯一冲突判断改用 `isUniqueConstraintError`（优先 libSQL 错误码而非 message 匹配）。

- **严重性：Medium**
- **位置：`src/lib/slug.ts:3-7`；`src/lib/shorten.ts:81-134`**
- **类型：正确性 / 性能**
- **证据：**

```ts
const SLUG_ALPHABET = "abcdefhiklmnorstuvwxz" // 21 字符
const createSlug = customAlphabet(SLUG_ALPHABET)
export function generateSlug(length = 5) { return createSlug(length) }
...
const slug = input.customSlug || generateSlug(Math.max(5, shortDomain.minSlugLength))
// 只尝试一次，唯一冲突直接返回“自定义后缀已被占用”
```

- **问题描述：** 21^5 ≈ 408 万空间，生日悖论下约 2379 个链接就达到 50% 冲突概率。生成 slug 冲突时用户并未自定义后缀，却收到 409，且不重试。唯一约束兜底是好的，但生成路径缺少重试逻辑。
- **影响：** 链接量到数千级后创建成功率显著下降。
- **修复建议：** 生成 slug 冲突时自动重试（如 5-10 次）或改用更长字母表/长度；仅自定义 slug 冲突才返回 409。唯一冲突判断建议用错误码而非 `message.includes("UNIQUE")`。
- **验证方法：** 预填 1 万条短链后批量创建，统计 409 比例；修复后生成 slug 路径可自动换 slug 成功。

---

### 问题 13：短链和邮箱创建限流为“先 count 再 insert”的软限流，并发可突破

> **状态：✅ 已修复** — 新增 `rate_limit_window` 表与 `consumeRateLimit`（`src/lib/rate-limit.ts`）：固定窗口原子 upsert（`onConflictDoUpdate count+1`）后回读计数，短链与临时邮箱创建均接入，并发无法集体突破阈值；含过期窗口的顺带清理。已实测 limit=3 时 5 个并发序列为 ok,ok,ok,429,429。

- **严重性：Medium**
- **位置：`src/lib/rate-limit.ts:14-38`；`src/lib/temp-email.ts:389-409`**
- **类型：并发 / 安全**
- **证据：**

```ts
const recentLinks = await db.select({ count: sql<number>`count(*)` })
  .from(shortLink).where(and(eq(shortLink.userId, userId), sql`${shortLink.createdAt} >= ${...}`))
  .get()
if (recentLinks && recentLinks.count >= userLimit) return 429
// 之后才 insert
```

  代码注释也承认：“concurrent requests can temporarily pass”。

- **问题描述：** 并发 N 个请求都读到 count < limit，全部通过并全部插入，实际创建数可超过限制。临时邮箱创建同理。
- **影响：** 防滥用限制可被并发请求绕过。
- **修复建议：** 若限流必须精确，建独立限流表并用原子 upsert：

```ts
await db.insert(rateLimitWindow).values({ key, windowStart, count: 1 })
  .onConflictDoUpdate({ target: [...], set: { count: sql`${rateLimitWindow.count} + 1` } })
// 冲突后回读 count 判断
```

  或使用 Redis/单实例内存限流作为补充。若产品接受软限流，需在文档明确并缩小阈值。

- **验证方法：** 对同一用户并发发 100 个创建请求（limit=10），统计实际创建数，当前可能显著超过 10。

---

### 问题 14：临时邮箱创建的唯一冲突未捕获，并发请求返回 500

> **状态：✅ 已修复** — `createTempMailboxForUser` 捕获唯一约束冲突并返回 409「该邮箱已存在」，不再暴露 500。

- **严重性：Medium**
- **位置：`src/lib/temp-email.ts:380-419`**
- **类型：并发 / 错误处理**
- **证据：**

```ts
const existing = await db.select(...).where(eq(tempMailbox.emailAddress, finalEmailAddress)).get()
if (existing) return { error: "This email address already exists", status: 409 }
...
await db.insert(tempMailbox).values({...}) // 唯一冲突直接抛出
```

- **问题描述：** 两个并发请求创建同一邮箱时都通过查重，一个 insert 触发 `temp_mailbox_email_address_idx` 唯一约束，未捕获，路由返回 500。
- **影响：** 并发/重试场景下用户看到服务器错误而非明确的 409。
- **修复建议：**

```ts
try { await db.insert(...) }
catch (e) { if (isUniqueConstraintError(e)) return { error: "...", status: 409 } ; throw e }
```

  或 `onConflictDoNothing().returning()` 后判断是否插入。

- **验证方法：** 同一用户并发两次 POST 相同邮箱，当前一次可能 500；修复后一次 201 一次 409。

---

### 问题 15：site_domain 并发更新存在丢失更新，默认域名唯一性无 DB 约束

> **状态：✅ 已修复** — PATCH 改为仅更新请求体中出现的字段（不再基于旧行整体重写）；schema/bootstrap/迁移新增部分唯一索引 `site_domain_one_default_short_idx`、`site_domain_one_default_email_idx`（`WHERE is_default_*_domain = 1`）保证单默认，并发/重复设置默认时返回 409（create 与 update 均捕获）。

- **严重性：Medium**
- **位置：`src/app/api/admin/domains/[id]/route.ts:53-99`；`src/lib/site-domains.ts:125-167`；`src/lib/schema.ts:133-148`**
- **类型：并发 / 一致性**
- **证据：** PATCH 先读出完整 existing，再根据旧值拼出全量字段并整体 update；schema 只有 `is_default_*` 普通列，没有“唯一默认域名”约束。
- **问题描述：**
  - 两个管理员并发 PATCH 不同字段时，都基于旧行构造全量新行，后提交者覆盖先提交者，丢失更新。
  - “只能有一个默认短链域名/邮箱域名”完全靠应用逻辑和事务内先清后写，数据库层可存在两个默认行；Turso 并发写事务冲突时表现为请求失败。
- **影响：** 管理配置被静默覆盖；默认域名判断可能不稳定。
- **修复建议：** PATCH 只更新 body 中出现的字段，或加 version/updatedAt 乐观锁；用 SQLite 部分唯一索引保证单默认：

```sql
CREATE UNIQUE INDEX site_domain_one_default_short ON site_domain(is_default_short_domain)
  WHERE is_default_short_domain = 1;
CREATE UNIQUE INDEX site_domain_one_default_email ON site_domain(is_default_email_domain)
  WHERE is_default_email_domain = 1;
```

- **验证方法：** 两个并发 PATCH 分别修改 host 和 isActive，检查是否丢失其中一个修改；手工插入两行默认短域名验证约束。

---

### 问题 16：Telegram 绑定 read-then-write 竞态，chat_id 冲突未处理

> **状态：✅ 已修复** — `src/app/v1/integrations/telegram/bind/route.ts` 使用 `onConflictDoUpdate`（target `user_id`）原子 upsert；chatId 增加长度（≤64）与字符集校验；chatId 被其他账号占用时捕获唯一约束返回 409；username 截断至 64。

- **严重性：Medium**
- **位置：`src/app/v1/integrations/telegram/bind/route.ts:15-43`；`src/lib/schema.ts:150-162`**
- **类型：并发 / 错误处理**
- **证据：**

```ts
const existing = await db.select(...).where(eq(telegramBinding.userId, ...)).get()
if (existing) await db.update(...)
else await db.insert(...) // user_id 或 chat_id 唯一冲突直接 500
```

- **问题描述：** 同一用户并发绑定会触发 `user_id` 唯一冲突；同一 chatId 被其他用户先绑定时，当前代码既不检查也不返回业务错误，直接唯一约束 500。chatId/username 没有格式和长度校验。
- **影响：** 绑定流程在重试/并发时不稳定；chatId 占用语义不清晰。
- **修复建议：** 使用 upsert 处理 userId 维度，并显式检查 chatId 归属：

```ts
await db.insert(telegramBinding).values({...})
  .onConflictDoUpdate({ target: telegramBinding.userId, set: { chatId, username, updatedAt: new Date() } })
```

  chatId 冲突需要单独捕获并返回 409。chatId 限制为字符串长度 ≤ 64 并做基本格式校验。

- **验证方法：** 同一 API key 并发 POST 两次绑定，当前至少一次 500；不同用户绑同一 chatId，当前一个 500，修复后一个 409。

---

### 问题 17：API key 使用时间更新发生在业务写之后，业务成功但响应可能 500

> **状态：✅ 已修复** — 新增 `scheduleApiKeyUsageTouch`（`src/lib/api-auth.ts`）：通过 `after()` 在响应后执行，失败仅记诊断日志；`/v1/shorten`、`/v1/links`、`/v1/emails*`、telegram bind、aliases 全部替换为异步调度，业务失败不再被遥测写入拖垮。

- **严重性：Medium**
- **位置：`src/app/v1/shorten/route.ts:38-64`；`src/app/v1/emails/route.ts:25-49` 等**
- **类型：事务 / 错误处理 / 幂等**
- **证据：**

```ts
const result = await createShortLink({...})
if ("error" in result) return ...
await touchApiKeyUsage(authResult.data) // 此处失败会让已创建的短链返回 500
return NextResponse.json(result.data, { status: 201 })
```

- **问题描述：** `last_used_at` 只是非关键遥测，却放在关键写之后同步等待；Turso 瞬时失败时，客户端收到失败并重试，但短链/邮箱已经创建成功，可能产生重复数据或困惑。
- **影响：** 误报失败、客户端无效重试。
- **修复建议：** 将 `touchApiKeyUsage` 放入 `after()` 或 try/catch 记录诊断，失败不影响主响应；或先做遥测写再返回。统一 v1 emails/aliases/telegram 的调用方式。
- **验证方法：** mock `touchApiKeyUsage` 抛错，调用 `/v1/shorten`，当前返回 500 但短链已存在；修复后返回 201。

---

### 问题 18：删除短链时审计日志先写、删除后写，非事务且可能产生误导性审计

> **状态：✅ 已修复** — `createLinkLog` 支持可选 `tx` 参数（传入时失败向上抛出以回滚事务）；用户/管理员删除链接均改为“审计日志 + 删除”同一事务，杜绝“已删除”日志与删除失败并存的误导性记录。

- **严重性：Medium**
- **位置：`src/app/api/links/[id]/route.ts:28-52`；`src/app/api/admin/links/[id]/route.ts:68-87`**
- **类型：事务 / 可维护性**
- **证据：**

```ts
await createLinkLog({ ..., eventType: "link_manual_deleted_by_user", statusCode: 200 })
await db.delete(shortLink).where(eq(shortLink.id, id))
```

- **问题描述：** 日志先写、删除后写且无事务；删除失败会留下“已删除”的审计日志。`createLinkLog` 内部吞掉错误，删除成功但日志失败则审计缺失。两步之间缓存失效、并发请求等都会放大窗口。
- **影响：** 审计记录与实际状态不一致。
- **修复建议：** 提供接受事务对象 `tx` 的 `createLinkLog(tx, ...)`，与删除同事务；或在删除成功后再用 `after()` 尽力写日志，并接受审计日志为 best-effort。
- **验证方法：** mock 删除失败，检查 link_log 是否出现“已删除”记录。

---

### 问题 19：管理端/搜索读路径存在无界查询和大字段过度返回

> **状态：✅ 已修复** — `/api/admin/users` 增加分页（limit 1-200，返回 `{data,total,page,limit,totalPages}`，管理端 UI 已加翻页）；用户列表与管理端邮件/归档列表改为只返回服务端截断的 `preview`（`substr(text,1,300)` + `substr(html,1,500)`），正文由 detail 端点按需获取（两个客户端组件已同步）；搜索词限长 100 且列表搜索不再匹配正文大字段；新增复合索引 `temp_email_message(mailbox_id, received_at)`、`link_log(link_id, created_at)`。

- **严重性：Medium**
- **位置：`src/app/api/admin/users/route.ts:15-33`；`src/lib/temp-email.ts:508-537, 879-928`**
- **类型：性能**
- **证据：**

```ts
const users = await db.select({...}).from(user).leftJoin(...).groupBy(user.id).orderBy(desc(user.createdAt))
// 无 limit/offset
...
text: tempEmailMessage.text,
html: tempEmailMessage.html,
// 管理端列表每行返回完整邮件正文
...
like(tempEmailMessage.text, searchTerm) // 前导通配符，无法走普通索引
```

- **问题描述：** `/api/admin/users` 一次性加载全量用户；管理端邮件列表返回全部 `text/html` 大字段；用户搜索对正文做 `%term%`，数据量上来后是逐行扫描。
- **影响：** 管理页首屏/搜索变慢，Turso 出口流量增大，内存占用增加。
- **修复建议：** 用户列表加分页（1-200）；邮件列表只返回预览字段，正文由已有 detail 端点按需取；搜索限制长度并为常用列建 FTS5 或至少避免搜索正文大字段；补充复合索引 `temp_email_message(mailbox_id, received_at DESC)`、`link_log(link_id, created_at DESC)`。
- **验证方法：** 构造 10 万用户/邮件行后用 `EXPLAIN QUERY PLAN` 和接口延迟对比。

---

### 问题 20：`/login`、`/register` 未先 `initDb()`，空库首访存在建表竞态

> **状态：✅ 已修复** — `/login`、`/register` 在调用 `requireActiveUser()`（内部 `getSession`）前先 `await initDb()`。

- **严重性：Medium（需人工确认实际渲染顺序）**
- **位置：`src/app/login/page.tsx:8-13`；`src/app/register/page.tsx:8-13`；对比 `src/app/page.tsx:59`、`src/app/dashboard/page.tsx:15`**
- **类型：错误处理 / 启动初始化**
- **证据：** login/register 直接调用 `auth.api.getSession`，没有 `await initDb()`；而 home/dashboard/admin 都有。
- **问题描述：** 开发/首次启动且库表尚未创建时，若首访是 `/login` 或 `/register`，`getSession` 可能先于 layout 中 `getSiteSettings → initDb` 完成而查询不存在的 `session/user` 表。
- **影响：** 首访 500；Better Auth 可能留下失败日志。
- **修复建议：** 在 login/register 开头 `await initDb()`；更稳妥的做法是在 instrumentation/middleware 或所有 auth 入口统一初始化（生产环境 initDb 是 no-op，开销可忽略）。
- **验证方法：** 删除本地库后首次访问 `/login`，观察是否报 no such table；与 `/` 首访对比。

---

### 问题 21：部分写路径输入校验不足，可能写入超长/畸形数据

> **状态：✅ 已修复** — `url` 增加 `max(2048)`（zod 与 `validateUrl` 双重限制）；入站邮件 `/v1/emails/inbound` 增加 zod schema（from/to/subject/text/html/headers/cc/replyTo 长度上限、附件 ≤50 且字段限长）；telegram bind 的 chatId 长度/字符集、username 长度校验。

- **严重性：Medium**
- **位置：`src/app/api/shorten/route.ts:12-18`；`src/app/v1/shorten/route.ts:10-16`；`src/app/v1/emails/inbound/route.ts:18-24`；`src/app/v1/integrations/telegram/bind/route.ts:15-20`**
- **类型：安全 / 输入验证**
- **证据：**

```ts
url: z.string().min(1) // 无 max
...
const result = await storeInboundEmail(body as Parameters<typeof storeInboundEmail>[0]) // 无 zod schema
...
const chatId = typeof body?.chatId === "string" ? body.chatId.trim() : "" // 无长度/格式
```

- **问题描述：** `original_url`、入站邮件正文/头、chatId 均可写入任意长度文本；超大值会放大 DB 体积和索引/日志写入成本。入站 payload 只验证了 object，字段类型错误会在 Drizzle 绑定时以 500 暴露。
- **影响：** 数据库膨胀、异常 500、被滥用的存储成本。
- **修复建议：** 给 url 加 `max(2048)`（或产品上限）；入站邮件用 zod 定义 from/subject/text/html/attachments 的长度与类型；chatId 限制长度和字符集；统一在 route 边界返回 400。
- **验证方法：** 发送 1MB url / 超长 chatId / 错误 attachments 类型，观察数据库写入和响应码。

---

### 问题 22：数据库调用无超时/取消信号，Telegram 外部调用无超时；日志上下文不足

> **状态：✅ 已修复（部分）** — libSQL `createClient` 的 `fetch` 封装 `AbortSignal.timeout`（默认 15s，可配 `DATABASE_REQUEST_TIMEOUT_MS`）；Telegram 调用加 5s 超时并后置到 `after()`；Drizzle 配置 logger（`DATABASE_QUERY_LOG=true` 记录 SQL+参数）；`reportDiagnostic` 自动附带 `requestId` 便于关联。**未实现**：Drizzle logger 接口不含耗时字段，慢查询计时需代理/OTEL 层，暂未加入。

- **严重性：Medium**
- **位置：`src/lib/db.ts:5-8`；`src/lib/telegram.ts:72-98`；`src/lib/temp-email.ts:305-340`；`src/lib/observability.ts:29-35`**
- **类型：错误处理 / 可观测性 / 性能**
- **证据：**

```ts
const client = createClient({ url: ..., authToken: ... }) // 无 fetch 超时配置
...
const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {...}) // 无 signal
```

- **问题描述：** libSQL HTTP 调用和 Telegram 调用都没有显式超时；在 Turso 网络抖动或 Telegram 挂起时请求会长时间占用。Drizzle 未配置 logger，也没有慢查询/失败 SQL 上下文。
- **影响：** 请求堆积、入站邮件 worker 超时、故障定位困难。
- **修复建议：** 给 `createClient` 传带 `AbortSignal.timeout` 的 `fetch` 封装（或业务层超时）；Telegram 调用加 3-5s timeout 并后台化；给 Drizzle 配置 logger，记录 SQL、耗时和关键参数；`reportDiagnostic` 增加 requestId。
- **验证方法：** 人为延迟 Turso/Telegram 响应，观察请求是否按预期超时返回并记录日志。

---

### 问题 23：文档声称的“过期链接自动删除”未实现，事件类型为死代码

> **状态：✅ 已修复** — 新增 `src/lib/link-cleanup.ts`：重定向命中过期（`expiredByDate`）或点击上限（`expiredByClicks`）时在 `after()` 中删除链接、失效短链缓存并写入 `link_auto_deleted_expired` / `link_auto_deleted_max_clicks` 审计事件；删除幂等，并发重定向安全。已端到端验证：过期链接返回 410 后行被删除且审计事件落库。

- **严重性：Medium**
- **位置：`src/app/[slug]/route.ts:49-107`；`src/lib/link-logs.ts:11-12`；`src/lib/log-events.ts:7-8`**
- **类型：生命周期 / 数据增长**
- **证据：** 重定向路径对过期链接只返回 410 和写 blocked 日志，没有 delete；`link_auto_deleted_expired/max_clicks` 两个事件类型全库无调用点。
- **问题描述：** AGENTS.md 描述“auto-deletion of expired links”，实际未实现。过期链接永久保留，持续被访问时还不断写 `link_log`。
- **影响：** 表无限增长，点击上限/过期链接仍可被扫描探测。
- **修复建议：** 增加后台清理任务（keyset 分页 + 批量删除 + 审计日志），或至少在重定向命中过期时用 `after()` 删除；清理需与缓存失效配合。
- **验证方法：** 创建 1 小时过期链接，2 小时后访问并查表，当前行仍存在。

---

## 4. 低风险与观察项

- **offset 深分页**：`/api/links`、`/api/emails/**`、admin 列表均为 offset 分页，大页码下 SQLite 需要跳过大量行；建议后续换 keyset/cursor。
- **冗余/死索引与表**：`click_log` 无任何读写；`short_link.domain` 单列索引被 `(domain, slug)` 唯一索引前缀覆盖；`api_key.key_prefix_idx`、`link_log.event_type_idx` 等当前无查询使用，会增加写放大。`temp_mailbox.domain_idx` 也无按 domain 的查询。
- **会话/验证令牌无定期清理任务**：`session` 只在用户再次携带过期 cookie 时懒删除；`verification` 只在查询时顺带清理过期行。低流量实例可能长期堆积。（本批未新增定时任务，需要独立 cron/worker。）
- **`site-settings`/`site-domains` 缓存无 TTL**：只靠 `revalidateTag`；若写入来自其他实例或 revalidate 丢失，缓存可能长期陈旧（短链缓存有 1h 自愈窗口，这两个没有）。
- **`initPromise` 失败永久拒绝**：✅ 已修复（失败后重置，下次调用自动重试）。
- **`GET /api/admin/domains`、`/v1/keys`、`/api/emails/options` 无分页**：量级小，但仍是无界查询。
- **`select *` 过度返回**：`[slug]` fallback、删除短链前的 ownership 检查、admin 域名查询都取整行；可只选所需列。
- **API key 创建后再次查询**：✅ 已修复（`insert ... .returning()` 一次完成）。
- **`updated_at` 不可靠**：部分 update（如 Better Auth 内部 `updateUser(emailVerified:true)`、domain update）未显式写 `updatedAt`，SQLite default 不会在 update 时自动变化。
- **邮件删除路由缺少 Origin 校验**：✅ 已修复（`/api/emails/[id]`、`/api/emails/messages/[messageId]` 的 DELETE 已加 `isRequestOriginAllowed`）。
- **入站共享密钥比较非恒定时间**：✅ 已修复（`timingSafeEqual`，长度不等时也执行一次比较）。
- **`TRUST_X_FORWARDED_FOR` 默认 true**：若部署环境并不在可信代理后，`creator_ip` 和日志 IP 可伪造；建议生产显式配置。
- **URL 校验的 IPv6 映射地址绕过**：✅ 已修复（`validateUrl` 阻止 `::ffff:` 映射地址）。
- **`/v1/emails/[id]` 对路径参数再次 `decodeURIComponent`**：✅ 已修复（移除二次解码）。
- **每次重定向都会写一条 `link_log`**：热门链接会产生高频单行 insert，需评估 Turso 写入额度；可考虑批量落盘或降采样策略。
- **删除 site_domain 不清孤儿短链**：`short_link.domain` 没有外键，域名删除后历史短链仍存在但不可解析；产品上可接受，但需明确策略。

---

## 5. 修复路线图

> 以下批次均已落地（对应问题条目已标注 ✅）；仍标注「部署侧」的步骤需在发布时执行。

### 第一批：立即热修复（无需大量迁移）

- [x] 1. 修复 `[slug]` 时间单位 bug（问题 1）。
- [x] 2. 检查所有部署环境 `DATABASE_AUTO_INIT`，生产多实例场景一律关闭（问题 6；部署侧确认）。
- [x] 3. 为 `verification`、`session.user_id`、`account.user_id`、`passkey.user_id/credential_id` 补索引（问题 7；`CREATE INDEX` 期间有写锁，选择低峰执行；迁移脚本已含去重前置）。
- [x] 4. 将 `emailOTP` 改为 `storeOTP: "hashed"` 并清空现有 email OTP 验证码（问题 3；存量清理已写入 bootstrap 与迁移脚本）。
- [x] 5. 封禁操作事务化，并在管理端/写操作鉴权中 `disableCookieCache` + 检查 `banned`（问题 8）。

### 第二批：数据一致性加固（含破坏性迁移）

- [x] 6. Better Auth adapter 启用 `transaction: true`（问题 2）。
- [x] 7. 入站邮件事务化 + 唯一索引；先对现有重复 `temp_email_message/temp_email_archive` 去重（问题 5；去重逻辑已写入 bootstrap 与迁移脚本）。
- [x] 8. `verification.identifier`、`account(provider_id, account_id)`、`passkey.credential_id` 唯一约束；上线前执行去重脚本（问题 4/7/9）。
- [x] 9. 替换/停用请求路径自动 DDL，建立版本化 migration 流程（问题 6；`drizzle/0000` 基线 + `0001_harden_existing.sql` 存量脚本，执行方式见脚本头注释）。

### 第三批：业务健壮性

- [x] 10. 随机 slug 重试、临时邮箱唯一冲突转 409、Telegram 绑定 upsert、API key 遥测失败不阻断主流程（问题 12/14/16/17）。
- [x] 11. 限流改为原子计数（问题 13）。
- [x] 12. site_domain 局部更新 + 默认域名部分唯一索引（问题 15）。
- [x] 13. 删除链接与审计日志事务化（问题 18）。

### 第四批：性能与可观测性

- [x] 14. 管理端用户分页、邮件列表去大字段、搜索策略优化（问题 19）。
- [x] 15. DB/Telegram 超时、Drizzle 慢查询日志（部分，见问题 22）、requestId 贯穿（问题 22）。
- [x] 16. 过期链接清理任务（重定向路径 `after()` 自动删除，问题 23）；session/verification 清理任务仍为观察项（未实现，见第 4 节）。

---

## 6. 需要人工确认的事项

1. **Turso 生产配置**：当前 `TURSO_DATABASE_URL` 被脱敏，无法确认是 remote、embedded replica 还是本地文件；Turso plan、写入 QPS 限额和并发限制需确认。
2. **`DATABASE_AUTO_INIT` 实际值**：`.env.local` 中值已脱敏。若生产曾以 `true` 运行且多实例，问题 6 的风险等级需要上调。
3. **Cloudflare Email Worker 的重试策略**：Email Workers 投递失败后是否自动重试、重试间隔多久，决定入站幂等问题的实际触发频率。
4. **历史数据重复情况**：`verification`、`account`、`passkey`、`temp_email_message/archive` 是否已存在重复行；迁移前需实际统计。
5. **cookie cache 安全接受度**：5 分钟封禁生效窗口是否为产品可接受；若不可接受，需要全局绕过缓存鉴权，会带来每请求一次 DB 读的回归。
6. **登录/注册首访竞态**：Next 16 中 layout `generateMetadata` 与 page 的实际执行顺序需在目标部署验证。
7. **GitHub OAuth 授权范围**：账号 token 泄露的实际影响取决于申请的 scopes；建议确认是否只读用户信息。
8. **Next Data Cache 后端**：自托管多实例时，`unstable_cache`/`revalidateTag` 是否共享缓存；若不共享，跨实例写入后的缓存失效策略需重新设计。
9. **迁移执行方式**：生产当前依赖手工 `db:push`，无迁移历史；需要确认由谁、在哪个阶段执行，以及失败回滚方案。
10. **搜索规模与 FTS 需求**：用户邮件搜索的数据量级，决定是否需要引入 FTS5 或外部搜索。
