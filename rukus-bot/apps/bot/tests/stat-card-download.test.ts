import test from "node:test";
import assert from "node:assert/strict";
import type { Attachment } from "discord.js";
import { downloadStatCardImage } from "../src/features/build-a-house/submissions.js";

const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=", "base64");
const attachment = (url: string, overrides: object = {}) => ({ url, width: 1000, height: 690, size: png.length, contentType: "image/png", ...overrides }) as Attachment;

test("channel and private modal uploads download from Discord, retaining signed queries", async () => {
  const original = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (url, options) => {
    assert.equal(options?.redirect, "error");
    assert.ok(options?.signal);
    requests.push(String(url));
    return new Response(png, { status: 200 });
  }) as typeof fetch;
  try {
    for (const host of ["cdn.discordapp.com", "media.discordapp.net"]) {
      for (const path of ["attachments", "ephemeral-attachments"]) {
        const url = `https://${host}/${path}/123456789012345678/987654321098765432/card.png?ex=abc&is=def&hm=signature`;
        assert.deepEqual(await downloadStatCardImage(attachment(url)), png);
        assert.equal(requests.at(-1), url);
      }
    }
    const count = requests.length;
    for (const url of [
      "http://cdn.discordapp.com/ephemeral-attachments/card.png",
      "https://cdn.discordapp.com.evil.example/ephemeral-attachments/card.png",
      "https://127.0.0.1/attachments/card.png",
      "https://cdn.discordapp.com:8443/attachments/card.png",
      "https://user@cdn.discordapp.com/attachments/card.png",
      "https://:password@cdn.discordapp.com/attachments/card.png",
      "https://cdn.discordapp.com/avatars/card.png",
      "https://cdn.discordapp.com/ephemeral-attachments-evil/card.png",
    ]) await assert.rejects(downloadStatCardImage(attachment(url)), /directly to Discord/);
    for (const overrides of [{ size: 8 * 1024 * 1024 + 1 }, { width: 10000, height: 10000 }, { contentType: "text/html" }]) {
      await assert.rejects(downloadStatCardImage(attachment("https://cdn.discordapp.com/ephemeral-attachments/1/2/card.png", overrides)), /PNG or JPEG/);
    }
    assert.equal(requests.length, count);
    globalThis.fetch = (async () => new Response("not an image", { status: 200 })) as typeof fetch;
    await assert.rejects(downloadStatCardImage(attachment("https://cdn.discordapp.com/ephemeral-attachments/1/2/card.png")), /actual PNG or JPEG/);
  } finally { globalThis.fetch = original; }
});
