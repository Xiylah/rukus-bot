import { handlers } from "@/auth";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

export const { GET, POST } = handlers;
