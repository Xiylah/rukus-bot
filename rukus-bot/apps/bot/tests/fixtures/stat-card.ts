import { createCanvas } from "@napi-rs/canvas";
import { cardChecksum, encodeGroupedCard } from "../../src/features/build-a-house/card.js";

export function screenshotWithStrip(scale = 1) {
  const now = BigInt(Math.floor(Date.now() / 1000));
  const values = [112345678n, 923456789n, 1024n, 166907559750n, 41n, 2316918508n, now];
  const payload = encodeGroupedCard([...values, cardChecksum(values)]);
  const lines = payload.split("\n");
  const raw = "BAH3" + lines.slice(1).map((line) => line.slice(2).replace(/ /g, "")).join("");
  const image = createCanvas(1920, 1080), ctx = image.getContext("2d");
  ctx.fillStyle = "#123342"; ctx.fillRect(0, 0, 1920, 1080);
  ctx.fillStyle = "#006b60"; ctx.fillRect(460, 195, 1000, 690);
  ctx.fillStyle = "#fbf8ef"; ctx.fillRect(500, 371, 920, 354);
  ctx.textAlign = "center"; ctx.fillStyle = "white"; ctx.font = "30px Arial";
  ctx.fillText("BUILD A HOUSE LEADERBOARD", 960, 250); ctx.fillText("Rukus", 960, 330);
  ctx.fillStyle = "black"; ctx.font = "900 34px Impact";
  lines.forEach((line, index) => ctx.fillText(line, 960, 480 + index * 43));
  for (let column = 0; column < raw.length; column++) {
    const value = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ".indexOf(raw[column]!);
    for (let bit = 0; bit < 5; bit++) {
      if ((value >> (4 - bit)) & 1) ctx.fillRect(704 + column * 8, 659 + bit * 8, 8, 8);
    }
  }
  const resized = createCanvas(Math.round(1920 * scale), Math.round(1080 * scale));
  resized.getContext("2d").drawImage(image, 0, 0, resized.width, resized.height);
  return { image: resized, payload };
}

