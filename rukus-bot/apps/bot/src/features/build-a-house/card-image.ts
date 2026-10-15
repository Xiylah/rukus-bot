import { createCanvas, loadImage } from "@napi-rs/canvas";

export async function isolateStatCardCodes(bytes: Buffer): Promise<{ codes: Buffer; name: Buffer | null; machineText: string | null } | null> {
  const image = await loadImage(bytes);
  if (image.width * image.height > 20_000_000) return null;
  const scale = Math.min(1, 1400 / image.width);
  const width = Math.round(image.width * scale), height = Math.round(image.height * scale);
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  let run: { left: number; right: number; top: number; bottom: number } | null = null;
  let best: { left: number; right: number; top: number; bottom: number } | null = null;
  const consider = () => {
    if (!run) return;
    const w = run.right - run.left + 1, h = run.bottom - run.top + 1;
    if (w >= width * 0.25 && h >= Math.max(50, height * 0.1) && w / h >= 1.4 &&
      (!best || w * h > (best.right - best.left + 1) * (best.bottom - best.top + 1))) best = { ...run };
  };
  for (let y = 0; y < height; y++) {
    let left = width, right = -1, count = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
      if (Math.min(r, g, b) >= 215 && Math.max(r, g, b) - Math.min(r, g, b) <= 45 && data[i + 3]! >= 240) {
        left = Math.min(left, x); right = x; count++;
      }
    }
    if (right - left >= width * 0.25 && count >= (right - left + 1) * 0.4) {
      if (run && Math.abs(left - run.left) <= 3 && Math.abs(right - run.right) <= 3) run.bottom = y;
      else { consider(); run = { left, right, top: y, bottom: y }; }
    } else { consider(); run = null; }
  }
  consider();
  const region = best as { left: number; right: number; top: number; bottom: number } | null;
  if (!region) return null;
  const w = (region.right - region.left + 1) / scale, h = (region.bottom - region.top + 1) / scale;
  if (w >= image.width * 0.97 && h >= image.height * 0.97) return null;
  const zoom = Math.min(3, 2000 / w);
  const output = createCanvas(Math.round(w * zoom) + 32, Math.round(h * zoom) + 32);
  const out = output.getContext("2d");
  out.fillStyle = "white";
  out.fillRect(0, 0, output.width, output.height);
  out.drawImage(image, region.left / scale, region.top / scale, w, h, 16, 16, w * zoom, h * zoom);
  let symbols = "";
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  for (let column = 0; column < 64; column++) {
    let value = 0;
    for (let bit = 0; bit < 5; bit++) {
      const x = Math.round(region.left + (204 + column * 8 + 4) * (region.right - region.left + 1) / 920);
      const y = Math.round(region.top + (288 + bit * 8 + 4) * (region.bottom - region.top + 1) / 354);
      let total = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const i = ((y + dy) * width + x + dx) * 4;
        total += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      }
      value = value * 2 + (total / 9 < 130 ? 1 : 0);
    }
    symbols += alphabet[value];
  }
  const machineText = symbols.startsWith("BAH3") ? ["BAH3", ...["A", "B", "C"].map((label, row) =>
    `${label} ${symbols.slice(4 + row * 20, 24 + row * 20)}`)].join("\n") : null;
  let name: Buffer | null = null;
  const nameTop = region.top / scale - 84 * w / 920;
  if (nameTop >= 0) {
    const nameHeight = 60 * w / 920;
    const nameCanvas = createCanvas(Math.round(w * zoom), Math.round(nameHeight * zoom));
    nameCanvas.getContext("2d").drawImage(image, region.left / scale, nameTop, w, nameHeight, 0, 0, nameCanvas.width, nameCanvas.height);
    name = nameCanvas.toBuffer("image/png");
  }
  return { codes: output.toBuffer("image/png"), name, machineText };
}
