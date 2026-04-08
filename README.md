# Shortly

Shortly 是一个现代化、轻量级且功能强大的开源短链接、临时邮箱系统。本项目基于最新的前端技术栈构建，提供美观的用户界面、完善的身份验证机制以及灵活的短链接管理与统计功能。

## 🛠️ 技术栈

- **框架**: Next.js 16 (App Router)
- **核心组件**: React 19
- **样式**: Tailwind CSS v4 + class-variance-authority + tailwind-merge
- **UI 组件**: [shadcn/ui](https://ui.shadcn.com/) + Radix UI
- **图标**: Lucide React
- **数据库 ORM**: Drizzle ORM (配合 SQLite)
- **认证系统**: Better Auth
- **邮件服务**: Resend (用于发送验证码)

## 📦 本地开发指南

### 1. 克隆项目 & 安装依赖

本项目建议使用 `bun` 作为包管理器。

```bash
git clone https://github.com/yourusername/shortly2.git
cd shortly2
bun install
```

### 2. 环境变量配置

将项目根目录的 `.env.example` 复制为 `.env` 即可，并填入您的相关配置：

```bash
cp .env.example .env
```

主要的的环境变量包括：
- 数据库连接（例如指向本地 SQLite 文件）
- `BETTER_AUTH_SECRET`: 用于保护会话的随机字符串
- `API_KEY_PEPPER`: （可选）用于 API Key 哈希加盐，建议生产环境配置
- `BOOTSTRAP_ADMIN_EMAILS`: （可选）逗号分隔邮箱列表，匹配的注册用户会自动获得 `admin` 权限
- `TRUST_X_FORWARDED_FOR`: （可选）是否信任 `X-Forwarded-For`，默认 `true`
- `TRUST_PROXY_HOPS`: （可选）受信代理跳数，默认 `1`，用于从 `X-Forwarded-For` 反推客户端 IP
- `NEXT_PUBLIC_APP_URL`: 应用程序的前台 URL (如 `http://localhost:3000`)
- `INBOUND_EMAIL_SECRET`: 选填但强烈建议配置，用于保护 `POST /v1/emails/inbound` 入站邮件接口；启用 Cloudflare 邮件转发 Worker 时必须与 Worker 侧保持一致
- `TELEGRAM_BOT_TOKEN`: 选填，用于让主程序在临时邮箱收到新邮件后，直接通过 Telegram Bot API 推送通知给已绑定聊天的用户；通常应与 `.cf-tgbot-worker` 使用同一个 Bot Token
- `RESEND_API_KEY`: 选填，用于开启邮件验证码登录（建议与 Github 至少配置一种）
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`: 选填，用于开启 GitHub 授权登录

如果你要启用临时邮箱的真实收件链路，还需要额外部署仓库中的 Cloudflare Email Worker：`.cf-email-forwarding-worker`。
该 Worker 会承接 Cloudflare Email Routing 的入站邮件，并转发到 Shortly 的 `POST /v1/emails/inbound`。具体部署方式见 `.cf-email-forwarding-worker/README.md`。

### 3. 初始化数据库

项目使用 Drizzle ORM 生成和推送 SQLite 数据表：

```bash
bun run db:generate
bun run db:push
```

### 4. 启动开发服务器

```bash
bun run dev
```

启动完毕后，浏览器打开 [http://localhost:3000](http://localhost:3000) 即可预览。

## 💡 使用指南

1. **首页与登录**：
    - 首页为简洁落地页，展示短链接与临时邮箱能力概览。
    - 点击右上角的 "登录 / 注册" 进入完整功能。
2. **账号注册与管理**：
    - 如需自动授予管理员，请在环境变量中配置 `BOOTSTRAP_ADMIN_EMAILS`（支持逗号分隔多个邮箱）；未配置时不会自动提权。
    - 登录后可创建短链并设置域名、有效期、访问阈值和自定义后缀。
3. **用户后台能力**：
    - **我的短链**：支持在后台直接创建短链，并按域名查看记录、复制短链、查看点击日志、删除短链。
    - **临时邮箱**：支持按管理员启用的邮箱域名创建临时邮箱，使用随机前缀快速生成地址，并在后台统一管理收件箱。
    - **API 管理**：支持查看 `/v1/domains`、`/v1/shorten` 等接口说明，并根据当前配置查看可用域名。
4. **管理员域名配置**：
    - 管理员可配置域名是否可用于短链接、临时邮箱，以及默认短链域名 / 默认邮箱域名。
    - 用户端的短链域名下拉、邮箱域名下拉以及 API 文档说明都会基于这些配置动态展示。
5. **临时邮箱入站链路**：
    - 用户只能在管理员已启用 `supportsTempEmail` 的域名下创建临时邮箱。
    - 外部邮件需要通过 Cloudflare Email Routing 投递到 `.cf-email-forwarding-worker`，再由 Worker 转发到 Shortly 的 `POST /v1/emails/inbound`。
    - 主应用会使用 `INBOUND_EMAIL_SECRET` 校验该入站请求；如果收件地址不存在，邮件不会被直接丢弃，而是进入 archive。
    - 若 Worker 启用了附件上传，附件文件存放在 Cloudflare R2，主应用数据库只保存附件元数据与 `r2Path`。
    - Worker 的部署、secret 配置和 R2 绑定说明见 `.cf-email-forwarding-worker/README.md`。
6. **Telegram Bot 集成**：
    - `.cf-tgbot-worker` 是独立部署的 Cloudflare Worker，负责接收 Telegram webhook、处理 `/setkey` `/short` `/email` `/links` `/emails` `/me` 等命令，并调用 Shortly 主程序的 `/v1` API。
    - 管理员可在后台「站点设置」中配置 TG Bot 用户名，用户在后台 API 页面会看到对应机器人的 `/setkey <api_key>` 绑定提示。
    - 用户先在 Telegram 中通过 `/setkey <api_key>` 绑定 Shortly API Key，主程序再通过 `POST /v1/integrations/telegram/bind` 建立 Telegram chat 与当前用户的绑定关系。
    - 主程序配置 `TELEGRAM_BOT_TOKEN` 后，会在临时邮箱成功收件时直接调用 Telegram Bot API，把“新邮件提醒”推送到该用户已绑定的 chat。
    - Telegram 推送失败不会影响邮件正常落库；未绑定 Telegram 的用户也不会影响正常收件。
    - Telegram Worker 的部署、KV 配置、Webhook 设置和回退域名说明见 `.cf-tgbot-worker/README.md`。

## 📜 许可协议

本项目基于 MIT 协议 开源。欢迎大家自由使用和贡献代码。
