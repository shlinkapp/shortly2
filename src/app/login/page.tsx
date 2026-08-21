import { initDb } from "@/lib/db";
import { requireActiveUser } from "@/lib/require-user";
import { getSiteSettings } from "@/lib/site-settings";
import { AuthForm } from "@/components/auth-form";
import { AuthPageShell } from "@/components/auth-page-shell";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  // Ensure the tables exist before Better Auth reads them: on a fresh
  // database the first visit must not race `getSession` against the DDL.
  await initDb();
  const session = await requireActiveUser();
  if (session) redirect("/dashboard");

  const settings = await getSiteSettings();
  const siteName = settings?.siteName?.trim() || "Shortly";
  const enableEmail = !!process.env.RESEND_API_KEY;
  const enableGithub = !!(
    process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET
  );

  return (
    <AuthPageShell mode="login" siteName={siteName}>
      <AuthForm
        mode="login"
        enableEmail={enableEmail}
        enableGithub={enableGithub}
        callbackUrl="/dashboard"
      />
    </AuthPageShell>
  );
}
