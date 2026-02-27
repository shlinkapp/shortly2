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
  - **管理后台**：管理员支持统筹管理系统中所有的链接与用户，并可以动态调节全局站点设置和风控策略。
- **🛡️ 灵活的风控与限流**：
  - **匿名用户**：支持限制其每小时生成限制（基于 IP 频率限制）以及最大访问次数，支持由后台动态调整配置（例如限制为只允许被点击访问 10 次）。
  - **已登录用户**：享有更高的生成配额，并支持设置**自定义后缀**、**过期时间 (有效期)** 以及**最大访问次数**。
- **🎨 精美 UI**：基于 Tailwind CSS v4 与 shadcn/ui 构建，支持深色模式。
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

请确保您的环境中已安装了 `bun`（本项目要求严格使用 `bun` 作为包管理器）。

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
- `NEXT_PUBLIC_APP_URL`: 应用程序的前台 URL (如 `http://localhost:3000`)
- `RESEND_API_KEY`: 选填，用于开启邮件验证码登录
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
    - 首个在系统内注册的用户（在部分逻辑场景中）或手动通过数据库提权的账号将成为 `admin`。
    - 登录后可以自由地设置链接有效时间、访问阈值和专有短链后缀。

## 📜 许可协议

本项目基于 MIT 协议 开源。欢迎大家自由使用和贡献代码。
