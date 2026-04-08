import { auth } from "@/lib/auth";
import { getSiteSettings } from "@/lib/site-settings";
import { AuthForm } from "@/components/auth-form";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const headersList = await headers();
  const session = await auth.api.getSession({ headers: headersList });
  if (session) redirect("/dashboard");

  const settings = await getSiteSettings();
  const siteName = settings?.siteName?.trim() || "Shortly";
  const enableEmail = !!process.env.RESEND_API_KEY;
  const enableGithub = !!(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  );

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: "url('https://api.staticdn.net/bing')" }}
      />
      <div className="absolute inset-0 bg-black/40" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-8 sm:px-6 lg:justify-end">
        <section className="w-full max-w-sm rounded-2xl border border-white/25 bg-white/92 p-6 shadow-[0_24px_56px_-30px_rgba(15,23,42,0.65)] backdrop-blur-sm">
          <h1 className="mt-2 text-xl font-semibold tracking-tight">
            登录 {siteName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            使用邮箱验证码、GitHub 或 Passkey 登录。
          </p>

          <div className="mt-6">
            <AuthForm
              mode="login"
              enableEmail={enableEmail}
              enableGithub={enableGithub}
              callbackUrl="/dashboard"
            />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            没有账户？{" "}
            <Link
              href="/register"
              className="font-medium text-foreground hover:underline"
            >
              立即注册
            </Link>
          </p>

          <p className="mt-3 text-center text-xs text-muted-foreground">
            <Link href="/" className="hover:text-foreground hover:underline">
              返回首页
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
