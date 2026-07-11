import Link from "next/link";
import { requireManageableGuilds } from "@/lib/guard";
import { guildIconUrl } from "@/lib/discord";
import { SignOutButton } from "@/components/SignOutButton";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

const BOT_GUILD_ID = process.env.DISCORD_GUILD_ID;

export default async function DashboardHome() {
  const { guilds } = await requireManageableGuilds();

  // For the single-guild build, only the configured guild is actually wired to
  // the bot. We still list every manageable guild but flag which one is active.
  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Your servers</h1>
        <SignOutButton />
      </div>

      {guilds.length === 0 ? (
        <p className="text-zinc-400">
          You don&apos;t manage any servers. You need the{" "}
          <strong>Manage Server</strong> permission.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {guilds.map((g) => {
            const icon = guildIconUrl(g);
            const active = g.id === BOT_GUILD_ID;
            return (
              <Link
                key={g.id}
                href={active ? `/dashboard/${g.id}` : "#"}
                className={`card flex items-center gap-4 transition-colors ${
                  active ? "hover:border-blurple" : "cursor-not-allowed opacity-50"
                }`}
              >
                {icon ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={icon}
                    alt=""
                    className="h-12 w-12 rounded-full"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-edge text-lg font-semibold">
                    {g.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <div className="truncate font-semibold text-white">{g.name}</div>
                  <div className="text-xs text-zinc-400">
                    {active ? "Bot active — click to configure" : "Bot not in this server"}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
