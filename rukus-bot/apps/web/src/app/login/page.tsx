import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

export default async function LoginPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-2xl font-bold text-white">Sign in</h1>
      <p className="text-zinc-400">
        Log in with Discord to manage the servers where you have{" "}
        <strong>Manage Server</strong> permission.
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
