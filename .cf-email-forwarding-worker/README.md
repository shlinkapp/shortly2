## Shortly Cloudflare 入站邮件 Worker

这个 Worker 用于承接 Cloudflare Email Routing 的入站邮件，并把解析后的邮件内容转发到 Shortly 的 `/v1/emails/inbound` 接口。

完整链路如下：

1. Cloudflare Email Routing 将邮件投递给该 Worker
2. Worker 使用 `postal-mime` 解析原始 MIME 邮件
3. Worker 可选地把附件写入 Cloudflare R2
4. Worker 将标准化后的 JSON 负载 POST 到 Shortly 的 `/v1/emails/inbound`
5. Shortly 根据收件地址把邮件写入对应临时邮箱；若邮箱不存在，则归档到 archive

## 前置条件

在部署这个 Worker 之前，请先确认 Shortly 主应用已经完成以下配置：

- 已启用临时邮箱功能使用的域名
- 应用侧已配置 `INBOUND_EMAIL_SECRET`
- `APP_API_URL` 指向可访问的 Shortly `/v1/emails/inbound`
- 如果要保存附件，已准备好 Cloudflare R2 bucket

注意：只有管理员在 Shortly 后台启用了 `supportsTempEmail` 的域名，用户才能在应用里创建该域名下的临时邮箱。Worker 负责收件转发，不负责域名可用性校验。

## 配置项

### `APP_API_URL`

Shortly 的入站邮件接口地址，例如：

```txt
https://your-shortly-domain.com/v1/emails/inbound
```

### `ENABLE_ATTACHMENTS`

是否启用附件上传到 R2：

- `1`：启用
- `0`：禁用

禁用时仍会转发正文和基础邮件信息，只是不上传附件。

### `INBOUND_EMAIL_SECRET`

用于保护 Shortly 入站邮件接口的共享密钥。

- 应用侧 `INBOUND_EMAIL_SECRET` 与 Worker 侧必须完全一致
- 该值不要写入 `wrangler.jsonc`
- 请使用 Wrangler secret 注入：

```bash
wrangler secret put INBOUND_EMAIL_SECRET
```

### `R2_BUCKET`

附件存储 bucket 绑定。仅当 `ENABLE_ATTACHMENTS=1` 时需要。

Worker 会把附件写入 R2，并只把附件元数据与 `r2Path` 传给 Shortly；实际文件内容不进入应用数据库。

## 部署步骤

```bash
cd .cf-email-forwarding-worker
bun install
wrangler login
wrangler secret put INBOUND_EMAIL_SECRET
wrangler deploy
```

如果启用了附件上传，请确保 `wrangler.jsonc` 中的 `R2_BUCKET` 绑定已指向正确的 bucket。

## Cloudflare 侧接入

部署完成后，还需要在 Cloudflare Email Routing 中把目标收件路由指向这个 Worker。只有完成 Email Routing → Worker 的投递后，邮件才会进入 Shortly 的临时邮箱链路。

建议至少验证以下场景：

- 投递到已存在的 Shortly 临时邮箱，邮件可在应用中看到
- 投递到不存在的地址，邮件进入 archive
- 投递带附件的邮件时，R2 中能看到对象，应用中能看到附件元数据

## Worker 行为说明

- Worker 会保持与 Shortly 当前 `/v1/emails/inbound` 的字段契约兼容
- `cc`、`replyTo`、`headers` 会以 JSON 字符串形式转发，匹配应用当前写库方式
- 附件路径会带上年月、收件邮箱和消息标识，避免简单文件名冲突
- 如果 Shortly 接口返回非 2xx，Worker 会记录错误日志，便于排查 secret、接口地址或服务端异常

## 相关代码

- Worker 实现：`.cf-email-forwarding-worker/src/index.ts`
- Shortly 入站接口：`src/app/v1/emails/inbound/route.ts`
- Shortly 入站邮件落库逻辑：`src/lib/temp-email.ts`
