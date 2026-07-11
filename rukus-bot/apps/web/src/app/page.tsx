import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-8 px-6 text-center">
      <div>
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Rukus Dashboard
        </h1>
        <p className="mt-4 text-lg text-zinc-400">
          One place to configure tickets, forms, and moderation for your Discord
          server.
        </p>
      </div>
      <div className="flex gap-3">
        {session ? (
          <Link href="/dashboard" className="btn-primary">
            Go to dashboard
          </Link>
        ) : (
          <Link href="/login" className="btn-primary">
            Sign in with Discord
          </Link>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 pt-6 sm:grid-cols-3">
        {[
          ["🎫 Tickets", "Button panels, private channels, transcripts."],
          ["📝 Forms", "Modal applications with approve / deny review."],
          ["🛡️ Moderation", "Coming soon - warns, mutes, logs."],
        ].map(([title, body]) => (
          <div key={title} className="card text-left">
            <div className="font-semibold text-white">{title}</div>
            <div className="mt-1 text-sm text-zinc-400">{body}</div>
          </div>
        ))}
      </div>
    </main>
  );
}
