import "next-auth";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    discordId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    discordId?: string;
  }
}
