import Link from "next/link";
import { auth } from "@/auth";

/**
 * Public landing page. The bot is public now, so a stranger can land here: the
 * primary action is "add it to my server", not "sign in". The invite URL is
 * built from the client id rather than hardcoded, so it cannot go stale.
 */
const FEATURES: [string, string, string][] = [
  ["🎫", "Tickets", "Button panels, private channels, hosted transcripts, ratings."],
  ["🎭", "Reaction roles", "Reactions, buttons or dropdowns. 8 modes: unique, verify, limit and more."],
  ["🛡️", "Moderation", "Warns, mutes, bans, timeouts. Every action is a numbered case with proof."],
  ["📜", "Logging", "Deletes, edits, joins, bans, roles, voice, invites. A channel per stream."],
  ["📈", "Leveling", "XP from chatting and voice, image rank cards, leaderboards, and role rewards."],
  ["⌨️", "Custom commands", "Your own commands with a real scripting language: conditions, math, embeds."],
  ["🌐", "Translation", "Auto-translate, flag reactions, and two-way translated tickets."],
  ["🎉", "Giveaways", "One-click entry, automatic draws, rerolls."],
  ["📝", "Forms", "Modal applications with approve and deny review."],
  ["⭐", "Starboard", "Let the server pin its own best posts."],
  ["💡", "Suggestions", "Voting, plus approve, deny and consider."],
  ["👋", "Welcome", "Greetings, auto-roles, and roles restored when someone rejoins."],
];

export default async function Home() {
  const session = await auth();

  const clientId = process.env.DISCORD_CLIENT_ID;
  // Administrator: the bot creates channels, manages roles, and moderates. Server
  // owners can always trim this down on the invite screen.
  const invite = clientId
    ? `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=8&scope=bot%20applications.commands`
    : null;

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col items-center px-6 py-20 text-center">
      <h1 className="text-4xl font-bold tracking-tight text-white sm:text-6xl">
        Rukus
      </h1>
      <p className="mt-5 max-w-2xl text-lg text-zinc-400">
        One bot for tickets, moderation, reaction roles, logging, leveling and
        more. Every part of it is configurable from a dashboard, so you never
        have to memorise a command to set something up.
      </p>

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        {invite && (
          <a href={invite} className="btn-primary" target="_blank" rel="noreferrer">
            Add to Discord
          </a>
        )}
        {session ? (
          <Link href="/dashboard" className="btn-ghost">
            Go to dashboard
          </Link>
        ) : (
          <Link href="/login" className="btn-ghost">
            Sign in
          </Link>
        )}
      </div>

      <p className="mt-4 text-sm text-zinc-500">
        Add the bot and every feature is there to switch on. No setup wizard, no
        commands to memorise.
      </p>

      <div className="mt-14 grid w-full grid-cols-1 gap-4 text-left sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([icon, title, body]) => (
          <div key={title} className="card">
            <div className="font-semibold text-white">
              <span className="mr-2">{icon}</span>
              {title}
            </div>
            <div className="mt-1 text-sm text-zinc-400">{body}</div>
          </div>
        ))}
      </div>

      <p className="mt-14 text-sm text-zinc-500">
        Add the bot, then open the dashboard to set it up. Every feature starts
        switched off, so it stays quiet until you decide what you want.
      </p>
    </main>
  );
}
