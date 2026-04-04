# Shortly

Shortly 是一个现代化、轻量级且功能强大的开源短链接生成系统。本项目基于最新的前端技术栈构建，提供美观的用户界面、完善的身份验证机制以及灵活的短链接管理与统计功能。

## ✨ 核心特性

- **🚀 现代技术栈**：基于 Next.js App Router (React 19) 和 Turbopack，提供极速的开发和渲染体验。
- **🔐 完善的身份验证**：集成 [Better Auth](https://better-auth.com/)，支持：
  - 邮箱无密码登录 (Email OTP + Resend)
  - GitHub 授权登录
  - Passkey (WebAuthn) 快捷登录
- **📊 管理与统计**：
  - **用户面板**：已登录用户可以管理自己生成的短链，查看每个链接的点击数、跳转来源和设备信息。
  - **临时邮箱面板**：支持按管理员启用的邮箱域名创建临时邮箱、随机生成 `word-word-word` 风格前缀、复制邮箱地址、查看收件列表、标记已读和删除邮件。
  - **API 管理面板**：在用户后台提供 API Key 管理、OpenAPI 调用说明、ShareX 配置文件下载，并展示可用短链域名与邮箱域名。
  - **管理后台**：管理员支持统筹管理系统中所有的链接与用户，并可以动态调节全局站点设置和风控策略。
- **🔌 OpenAPI 与域名能力**：
  - 支持通过 `Bearer API Key` 调用 `POST /v1/shorten` 创建短链。
  - 支持通过 `GET /v1/domains` 获取当前可用的短链域名和邮箱域名。
  - 支持 `customSlug`、`domain`、`maxClicks`、`expiresIn` 参数。
  - 可直接生成并导入 ShareX `.sxcu` 配置文件。
- **🛡️ 灵活的风控与限流**：
  - **匿名用户**：支持限制其每小时生成限制（基于 IP 频率限制）以及最大访问次数，支持由后台动态调整配置（例如限制为只允许被点击访问 10 次）。
  - **已登录用户**：享有更高的生成配额，并支持设置**短链域名**、**自定义后缀**、**有效期时长**以及**最大访问次数**。
- **🎨 精美 UI**：基于 Tailwind CSS v4 与 shadcn/ui 构建，支持深色模式；用户后台的短链接与临时邮箱页面已针对移动端、空状态、确认弹窗和中文文案做过一轮 UI/UX 优化。
- **💾 轻量级数据库**：使用 Drizzle ORM，搭配 SQLite / libSQL，支持轻松部署。

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
- `RESEND_API_KEY`: 选填，用于开启邮件验证码登录（建议与 Github 至少配置一种）
- `GITHUB_CLIENT_ID` & `GITHUB_CLIENT_SECRET`: 选填，用于开启 GitHub 授权登录

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

1. **匿名使用**：任何人均可直接访问首页，将长链接粘贴至输入框进行缩短。由于风控机制，匿名创建的短链将会受限（不可设置自定义后缀，并且默认为较少的有效点击次数）。
2. **账号注册与管理**：
    - 点击右上角的 "登录 / 注册" 体验完整的后台。
    - 如需自动授予管理员，请在环境变量中配置 `BOOTSTRAP_ADMIN_EMAILS`（支持逗号分隔多个邮箱）；未配置时不会自动提权。
    - 登录后可以自由地设置短链域名、链接有效时间、访问阈值和专有短链后缀。
3. **用户后台能力**：
    - **我的短链**：支持在后台直接创建短链，并按域名查看记录、复制短链、查看点击日志、删除短链。
    - **临时邮箱**：支持按管理员启用的邮箱域名创建临时邮箱，使用随机前缀快速生成地址，并在后台统一管理收件箱。
    - **API 管理**：支持查看 `/v1/domains`、`/v1/shorten` 等接口说明，并根据当前配置查看可用域名。
4. **管理员域名配置**：
    - 管理员可配置域名是否可用于短链接、临时邮箱，以及默认短链域名 / 默认邮箱域名。
    - 用户端的短链域名下拉、邮箱域名下拉以及 API 文档说明都会基于这些配置动态展示。

## 📜 许可协议

本项目基于 MIT 协议 开源。欢迎大家自由使用和贡献代码。
