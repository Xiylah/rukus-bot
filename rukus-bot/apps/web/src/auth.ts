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
export const { handlers, auth, signIn, signOut } = NextAuth({
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
