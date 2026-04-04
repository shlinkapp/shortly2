## Cf email forwarding worker

用于将 Worker 接收的邮件转发到第三方 APP

参考文档：https://wr.do/docs/developer/cloudflare-email-worker

### Deploy email worker to cloudflare

```bash
git clone https://github.com/oiov/cf-email-forwarding-worker.git
cd cf-email-forwarding-worker
pnpm install

wrangler login
wrangler deploy
```

### Environment variables

在 `wrangler.jsonc` 中配置你的环境变量

- APP_API_URL: 第三方 APP 的 `/v1/emails/inbound` API 地址
- ENABLE_ATTACHMENTS: 是否启用保存附件到R2。默认 `1` 表示启用，`0` 表示不启用