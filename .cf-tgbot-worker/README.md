# Shortly Telegram Bot Worker

这是一个基于 Cloudflare Workers 和 Hono 构建的 Telegram Bot Worker，用来把 Telegram 对话入口接到 Shortly 的 `/v1` API。

它当前支持：

- 通过 API Key 绑定 Telegram 对话
- 创建短链接
- 列出短链接
- 创建临时邮箱
- 列出临时邮箱
- 删除指定临时邮箱
- 查看当前机器人状态
- 通过按钮完成部分交互式操作，包括新邮件通知里的已读、删除和一次性详情链接

> 注意：新邮件主动通知由 Shortly 主程序发送；通知里的内联按钮回调、一次性邮件详情链接和对话命令由本 Worker 处理。

## 前置条件

在部署这个 Worker 之前，请先确认：

1. Shortly 主程序已经部署，并且 `/v1` API 可访问
2. 你已经在 Shortly 后台创建了 API Key
3. 你已经通过 `@BotFather` 创建了 Telegram Bot，并拿到了 `TELEGRAM_BOT_TOKEN`
4. 你有 Cloudflare 账号可用于部署 Worker 与 KV

## 配置项

### `TELEGRAM_BOT_TOKEN`

Telegram Bot 的密钥。请使用 Wrangler secret 注入，而不要写入 `wrangler.jsonc`：

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
```

### `API_BASE_URL`

Shortly API 根地址，示例：

```txt
https://your-shortly-domain.com/v1
```

### `DEFAULT_SHORT_DOMAIN`

短链接默认域名回退值。Worker 会优先请求 Shortly 的 `/v1/domains` 获取当前启用且默认的短链域名；只有在接口不可用或返回为空时，才使用这里的配置。

### `DEFAULT_EMAIL_DOMAIN`

临时邮箱默认域名回退值。逻辑与 `DEFAULT_SHORT_DOMAIN` 相同：优先使用 `/v1/domains`，失败时才回退。

### `TGBOT_KV`

Cloudflare KV 绑定，用于保存：

- Telegram chatId 与 API Key 的绑定
- 交互式短链草稿的临时会话状态
- 邮件详情一次性访问 token

## 部署步骤

### 1. 安装依赖

```bash
cd .cf-tgbot-worker
bun install
```

### 2. 创建 KV 命名空间

```bash
bunx wrangler kv:namespace create TGBOT_KV
```

把返回的 namespace id 填入 `wrangler.jsonc` 的 `kv_namespaces`。

### 3. 注入 Telegram Bot Token

```bash
wrangler secret put TELEGRAM_BOT_TOKEN
```

### 4. 检查 `wrangler.jsonc`

确保至少配置好：

- `API_BASE_URL`
- `DEFAULT_SHORT_DOMAIN`
- `DEFAULT_EMAIL_DOMAIN`
- `TGBOT_KV`

其中两个 `DEFAULT_*` 只是回退值，不是主来源。

### 5. 部署 Worker

```bash
bun run deploy
```

### 6. 注册 Telegram Webhook

将部署后的 Worker 地址注册为 Telegram webhook：

```bash
curl -F "url=https://your-worker.workers.dev/webhook" \
  "https://api.telegram.org/bot<YOUR_TELEGRAM_BOT_TOKEN>/setWebhook"
```

如果返回 `{"ok":true,...}`，说明设置成功。

## 可用命令

| 指令 | 说明 |
| --- | --- |
| `/start` | 查看欢迎语和命令帮助 |
| `/setkey <api_key>` | 绑定或更新 Shortly API Key |
| `/short` | 通过按钮交互创建短链接 |
| `/short <url> [slug] [domain]` | 直接创建短链接 |
| `/links [page]` | 查看短链接列表 |
| `/email [prefix] [domain]` | 创建临时邮箱 |
| `/emails [page]` | 查看临时邮箱列表 |
| `/delete <邮箱地址>` | 删除指定临时邮箱 |
| `/me` | 查看当前绑定状态与默认域名 |
| `/cancel` | 取消当前交互流程 |

## 默认域名策略

Worker 不把 `wrangler.jsonc` 中的默认域名视为权威来源。

实际顺序如下：

1. 优先请求 Shortly 的 `GET /v1/domains`
2. 使用其中标记为默认的短链域名 / 邮箱域名
3. 如果接口不可用、返回为空，或没有默认值，再退回 `DEFAULT_SHORT_DOMAIN` / `DEFAULT_EMAIL_DOMAIN`

这样可以尽量和 Shortly 后台的域名配置保持一致。

## 相关代码

- Worker 实现：`.cf-tgbot-worker/src/index.ts`
- Telegram 绑定接口：`src/app/v1/integrations/telegram/bind/route.ts`
- 域名发现接口：`src/app/v1/domains/route.ts`
- 短链创建接口：`src/app/v1/shorten/route.ts`
- 临时邮箱接口：`src/app/v1/emails/route.ts`
