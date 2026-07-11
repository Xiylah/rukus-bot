import { getSupabase } from "@rukus/supabase";

/**
 * Public transcript viewer, Ticket-Tool style: the bot stores each closed
 * ticket's transcript HTML under a long random token, and this route serves it
 * at /transcript/<token>.
 *
 * There is deliberately NO login: the 48-hex-char token (~2^192 possibilities)
 * is the secret, exactly like Ticket Tool's transcript links, so staff can
 * share a link with anyone who needs it.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  // Reject anything that isn't a well-formed token before touching the DB.
  if (!/^[0-9a-f]{32,64}$/.test(token)) {
    return new Response("Not found", { status: 404 });
  }

  const { data, error } = await getSupabase()
    .from("Ticket")
    .select("transcriptHtml")
    .eq("transcriptToken", token)
    .maybeSingle();

  if (error || !data?.transcriptHtml) {
    return new Response("Transcript not found", { status: 404 });
  }

  return new Response(data.transcriptHtml, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Transcripts are immutable once written; cache aggressively.
      "Cache-Control": "public, max-age=86400",
      // The HTML is user-generated (escaped, but belt and braces).
      "Content-Security-Policy":
        "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
