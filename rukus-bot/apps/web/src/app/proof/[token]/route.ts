import { getSupabase } from "@rukus/supabase";

/**
 * Serves moderation-case proof images. Discord's CDN links expire, so the bot
 * stores the bytes at action time and this route serves them forever under an
 * unguessable token, same trust model as /transcript.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!/^[0-9a-f]{32,64}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const { data, error } = await getSupabase()
    .from("ModCase")
    .select("proofData, proofContentType")
    .eq("proofToken", token)
    .maybeSingle();

  if (error || !data?.proofData) {
    return new Response("Proof not found", { status: 404 });
  }

  const bytes = Buffer.from(data.proofData, "base64");
  return new Response(bytes, {
    headers: {
      "Content-Type": data.proofContentType ?? "image/png",
      "Cache-Control": "public, max-age=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
