# WR.DO Telegram Bot Worker

这是一个基于 [Cloudflare Workers](https://workers.cloudflare.com/) 和 [Hono.js](https://hono.dev/) 构建的 Telegram Bot 服务。它充当 Telegram 用户与 [WR.DO](https://wr.do) 核心平台之间的桥梁，允许用户通过 Telegram 快捷地：
- 绑定账号 API Key
- 生成短链接 (`/short`)
- 申请临时邮件信箱 (`/email`)
- （及接收个人临时邮件推送）

## 前提条件

1. **获取 WR.DO API Key**：在 `wr.do` (或自己的本地部署主站) 平台上注册账户，进入 Setting 面板，获取自己的 API Key。
2. **创建一个 Telegram Bot**：
   - 打开 Telegram，搜索并添加 `@BotFather`。
   - 发送 `/newbot`，设置名字。
   - 获取你的 `BOT_TOKEN`。
3. **注册 Cloudflare 账户**（如果你需要部署）。

## 本地与线上部署

项目使用了 `bun` 和 `wrangler` CLI 进行管理。

### 1. 安装依赖

```bash
bun install
```

### 2. 创建 Cloudflare KV 命名空间
KV 用于持久化存储您在 Telegram 的 `ChatID` 与 `WR.DO` 的 `API Key` 的绑定关系。

执行以下命令创建一个新的 KV：
```bash
bunx wrangler kv:namespace create TGBOT_KV
```
执行完毕后，控制台会输出一个包含 `id` 的对象 (类似于 `"id": "xxxyyyzzz..."`)。请将这个 `id` 复制。

### 3. 配置环境变量
打开项目根目录的 `wrangler.jsonc`，精简并填写你的三个关键配置信息及默认域名：

1. `"TELEGRAM_BOT_TOKEN"`: 填入刚才由 `@BotFather` 得到的 Token。
2. `"API_BASE_URL"`: 如果是在你的服务器上线，填写对应的 `/v1` 接口根路径 (如 `https://你的域名/v1`)。
3. `"DEFAULT_SHORT_DOMAIN"`: 默认短链接域名，可设置多个用逗号隔开，第一个将作为缺省使用 (如 `"wr.do,s.wr.do"`)。
4. `"DEFAULT_EMAIL_DOMAIN"`: 默认临时邮箱后缀，可设置多个用逗号隔开，第一个将作为缺省使用 (如 `"mx.wr.do"`)。
5. 把你刚才通过 `wrangler kv:namespace create` 生成的 ID 填入 `"kv_namespaces"` 下面的 `"id"` 中。

*(提示：如果是生产环境安全配置，推荐使用 `bunx wrangler secret put TELEGRAM_BOT_TOKEN` 方式注入密钥。)*

### 4. 发布上线

一键部署到 Cloudflare 全球边缘节点：

```bash
bun run deploy
```
部署成功后，你将得到一个类似 `https://tgbot.<你的账户后缀>.workers.dev` 的线上地址。

### 5. 绑定 Webhook (重点！)
让 Telegram 知道往哪发送消息，使用终端发送这段 `curl` 请求即可（替换尖括号内的变量）：

```bash
curl -F "url=https://[填写刚才部署得到的 worker URL]/webhook" \
https://api.telegram.org/bot[填写你的 TELEGRAM BOT TOKEN]/setWebhook
```
*提示：如果返回 `{"ok":true, ...}`，则说明挂载成功。*

## 使用方法 (Commands)

进入您的 Telegram Bot 对话窗口，可以使用以下指令：

| 指令 | 说明 | 示例用法 |
| --- | --- | --- |
| `/start` | 欢迎语及快速指引 | `/start` |
| `/setkey` | 绑定（或更新）您的 `wr.do` API Key | `/setkey a1b2c3d4-e5f6-7890` |
| `/short` | 创建一条短链接。**不填 slug 将随机生成，不填域名将使用默认** | `/short https://apple.com` 或 `/short https://apple.com my-slug wr.do` |
| `/email` | 创建一个临时邮箱并绑定。**不填前缀随机生成，不填域名将使用默认** | `/email` 或 `/email myname mx.wr.do` |

### 工作流程图例
1. 发送 `/setkey YOUR-API-KEY` 进行认证绑定。
2. 发送 `/short https://github.com/`，Worker 检测到您没有赋予自定义路径，将随机生成一个。
3. 返回一条带短链域名的成功提示！
4. 每当主项目的 `/v1/emails/inbound` 收到您的私人邮件代理件，它将直接下发长文本内容到当前这个 Telegram 对话框。
