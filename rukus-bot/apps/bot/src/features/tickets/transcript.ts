import type { TextChannel } from "discord.js";

/**
 * Build a self-contained HTML transcript of a ticket channel.
 *
 * We fetch up to `maxMessages` (oldest→newest) and render a minimal, safe HTML
 * document. All user content is HTML-escaped to prevent injection when the file
 * is opened in a browser. The file is returned as a Buffer so the caller can
 * attach it to a Discord message or upload it to storage.
 */
export interface TranscriptParticipant {
  id: string;
  tag: string;
  count: number;
}

export async function buildTranscript(
  channel: TextChannel,
  opts: { maxMessages?: number; title?: string } = {},
): Promise<{ html: Buffer; count: number; participants: TranscriptParticipant[] }> {
  const max = opts.maxMessages ?? 2000;
  const title = opts.title ?? channel.name;
  const collected: {
    author: string;
    avatar: string;
    content: string;
    ts: string;
    attachments: string[];
  }[] = [];
  const byAuthor = new Map<string, { tag: string; count: number }>();

  let before: string | undefined;
  while (collected.length < max) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    for (const msg of batch.values()) {
      collected.push({
        author: `${msg.author.username}`,
        avatar: msg.author.displayAvatarURL({ size: 64 }),
        content: msg.content ?? "",
        ts: msg.createdAt.toISOString(),
        attachments: [...msg.attachments.values()].map((a) => a.url),
      });
      const entry = byAuthor.get(msg.author.id);
      if (entry) entry.count++;
      else byAuthor.set(msg.author.id, { tag: msg.author.tag, count: 1 });
    }
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }

  const participants: TranscriptParticipant[] = [...byAuthor.entries()]
    .map(([id, v]) => ({ id, tag: v.tag, count: v.count }))
    .sort((a, b) => b.count - a.count);

  // Discord returns newest-first; reverse to chronological order.
  collected.reverse();

  const rows = collected
    .map(
      (m) => `
    <div class="msg">
      <img class="avatar" src="${esc(m.avatar)}" alt="" />
      <div class="body">
        <div class="meta"><span class="author">${esc(m.author)}</span>
          <span class="ts">${esc(m.ts)}</span></div>
        <div class="content">${esc(m.content).replace(/\n/g, "<br>")}</div>
        ${m.attachments
          .map((u) => `<div class="attach"><a href="${esc(u)}">${esc(u)}</a></div>`)
          .join("")}
      </div>
    </div>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ticket transcript - #${esc(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin:0; background:#313338; color:#dbdee1;
    font-family: system-ui, "Segoe UI", sans-serif; }
  header { padding:16px 24px; background:#2b2d31; border-bottom:1px solid #1f2023; }
  header h1 { margin:0; font-size:18px; }
  header p { margin:4px 0 0; color:#949ba4; font-size:13px; }
  .msg { display:flex; gap:12px; padding:8px 24px; }
  .avatar { width:40px; height:40px; border-radius:50%; flex:none; }
  .author { font-weight:600; color:#f2f3f5; }
  .ts { color:#949ba4; font-size:12px; margin-left:8px; }
  .content { margin-top:2px; white-space:pre-wrap; word-break:break-word; }
  .attach a { color:#00a8fc; font-size:13px; }
</style></head>
<body>
<header>
  <h1>#${esc(title)}</h1>
  <p>${collected.length} message(s) • exported ${new Date().toISOString()}</p>
</header>
<main>${rows}</main>
</body></html>`;

  return { html: Buffer.from(html, "utf-8"), count: collected.length, participants };
}

/** Escape a string for safe insertion into HTML text/attribute context. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
