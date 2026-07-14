import Link from "next/link";
import { requireGuildAccess } from "@/lib/guard";
import { guildIconUrl, isGuildAdmin } from "@/lib/discord";
import { SignOutButton } from "@/components/SignOutButton";
import { SideNav, type NavGroup } from "@/components/SideNav";
import { MODULES, MODULE_CATEGORIES } from "@/components/modules";

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

  // The nav is generated from the same module registry the overview grid reads,
  // so a module can never be reachable from one and missing from the other.
  const groups: NavGroup[] = [
    {
      items: [{ href: `/dashboard/${guildId}`, label: "Overview", icon: "🏠" }],
    },
    ...MODULE_CATEGORIES.map((category): NavGroup => ({
      title: category,
      items: MODULES.filter((m) => m.category === category).map((m) => ({
        href: `/dashboard/${guildId}/${m.slug}`,
        label: m.name,
        icon: m.icon,
      })),
    })).filter((g) => g.items.length > 0),
  ];

  // Access is Administrator-only; don't show staff a link that just redirects.
  if (isGuildAdmin(guild)) {
    groups.push({
      title: "Admin",
      items: [{ href: `/dashboard/${guildId}/access`, label: "Access", icon: "🔑" }],
    });
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-edge bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link
            href="/dashboard"
            className="flex-none text-sm text-zinc-400 hover:text-white"
          >
            ← <span className="hidden sm:inline">All servers</span>
          </Link>
          <div className="flex min-w-0 items-center gap-3">
            {icon && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={icon} alt="" className="h-7 w-7 flex-none rounded-full" />
            )}
            <span className="truncate font-semibold text-white">{guild.name}</span>
          </div>
          <SignOutButton />
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 md:flex-row md:gap-8 md:py-8">
        <aside className="w-full flex-none md:w-56">
          <div className="md:sticky md:top-20">
            <SideNav groups={groups} />
          </div>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
