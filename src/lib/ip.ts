export function getClientIp(ip: string | null, forwardedFor: string | null, realIp: string | null): string | null {
    // 如果直接提供了请求的 IP (例如通过某些直接连接框架传下来的 socket IP)，则优先返回
    // 但在常规 Next.js 的 headers 中，我们通常只依赖后面的 X-Forwarded-For 和 X-Real-IP
    if (ip) return ip

    // 当在反向代理（如 Nginx 代理和 CDN 链路）之后时
    // 许多攻击者可以伪造 X-Forwarded-For 的最左边 IP
    // 最接近服务器（信任层）增加的 IP 会挂在右边
    // 为了缓解基于虚假左边 IP 的伪造攻击导致的绕过率限制，如果代理链可信，最好取倒数第一个或倒数第二个未篡改内部 IP。
    // 作为最基础的 spoofing 防护:
    if (forwardedFor) {
        const parts = forwardedFor.split(",").map((s) => s.trim()).filter(Boolean)
        if (parts.length > 0) {
            // 简单防护：大多数云环境/CDN（如 Cloudflare 或 Vercel）会将最真实客户端 IP 置于最左，但如果不做可信代理网段过滤，容易 spoofing。
            // 在这里我们尽可能取第一个有效部分（常见标准）。但在一个更严格的信任链应用中，你可能需要使用专门的 proxy-addr 库。
            // 对于 Vercel 而言，`x-forwarded-for` 通常是安全的 (Vercel 帮你保证不会被轻易 spoof)
            const firstIp = parts[0]
            return firstIp
        }
    }

    if (realIp) return realIp.trim()

    return null
}
