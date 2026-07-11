import Link from "next/link";
import { requireGuildAccess } from "@/lib/guard";
import { guildIconUrl } from "@/lib/discord";
import { SignOutButton } from "@/components/SignOutButton";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

export default async function GuildLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const { guild } = await requireGuildAccess(guildId);
  const icon = guildIconUrl(guild, 48);

  const nav = [
    { href: `/dashboard/${guildId}`, label: "Overview" },
    { href: `/dashboard/${guildId}/tickets`, label: "🎫 Tickets" },
    { href: `/dashboard/${guildId}/forms`, label: "📝 Forms" },
    { href: `/dashboard/${guildId}/translation`, label: "🌐 Translation" },
    { href: `/dashboard/${guildId}/autoresponder`, label: "💬 Auto-responder" },
    { href: `/dashboard/${guildId}/moderation`, label: "🛡️ Moderation" },
    { href: `/dashboard/${guildId}/access`, label: "🔑 Access" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b border-edge bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white">
            ← All servers
          </Link>
          <div className="flex items-center gap-3">
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-7 w-7 rounded-full" />
            )}
            <span className="font-semibold text-white">{guild.name}</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        <aside className="w-48 flex-none">
          <nav className="flex flex-col gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-card hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
