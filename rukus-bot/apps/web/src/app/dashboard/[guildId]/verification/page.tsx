import { getVerificationConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { VerificationForm } from "./VerificationForm";

export default async function VerificationPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getVerificationConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🛡️ Verification</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Gate new members behind a verify button (or a captcha) before they get
        the run of your server, and screen out brand-new accounts on join.
      </p>
      <VerificationForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
        grantableRoles={options.grantableRoles}
      />
    </div>
  );
}
