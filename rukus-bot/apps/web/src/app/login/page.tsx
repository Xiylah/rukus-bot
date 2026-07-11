import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;
  const session = await auth();
  // A session whose Discord token has expired must be allowed to reach this
  // page to re-authenticate — auto-redirecting it would loop back to the error.
  if (session && !expired) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold text-white">Sign in</h1>
      {expired && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
          Your Discord session expired — sign in again to continue.
        </p>
      )}
      <p className="text-zinc-400">
        Log in with Discord to manage your server&apos;s bot settings.
      </p>
      <form
        action={async () => {
          "use server";
          await signIn("discord", { redirectTo: "/dashboard" });
        }}
      >
        <button type="submit" className="btn-primary">
          Continue with Discord
        </button>
      </form>
    </main>
  );
}
