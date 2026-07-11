import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";

/**
 * Auth.js (NextAuth v5) configuration.
 *
 * We request the `identify` and `guilds` scopes so we can:
 *  - identify the logged-in user, and
 *  - list the guilds they're in and check their permissions there.
 *
 * The Discord access token is stashed on the JWT and surfaced on the session
 * so server components / route handlers can call the Discord API on the user's
 * behalf (see lib/discord.ts).
 */

// Auth.js needs a full URL. A bare hostname (e.g. "app.up.railway.app", which
// is what hosting dashboards show you) makes it throw a bare `TypeError:
// Invalid URL` with no hint at the cause. Normalize it instead of exploding.
for (const key of ["NEXTAUTH_URL", "AUTH_URL"] as const) {
  const value = process.env[key];
  if (value && !/^https?:\/\//i.test(value)) {
    process.env[key] = `https://${value.replace(/\/+$/, "")}`;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js only auto-trusts the host on Vercel; we self-host on Railway, so we
  // must opt in explicitly or every request fails with UntrustedHost.
  trustHost: true,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      authorization:
        "https://discord.com/api/oauth2/authorize?scope=identify+guilds",
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        // token expiry (seconds → ms) so we can avoid using a dead token.
        token.accessTokenExpires = account.expires_at
          ? account.expires_at * 1000
          : undefined;
      }
      if (profile) {
        token.discordId = profile.id as string;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken as string | undefined;
      session.discordId = token.discordId as string | undefined;
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
