/**
 * S28: WebP versions of the radar PNGs in public/maps/.
 *
 *   npm run maps:webp
 *
 * For every `<map>_radar.png` writes `<map>_radar.webp` (full size, what the
 * canvases draw, ~5× smaller) and `thumbs/<map>.webp` (160 px, the map
 * thumbnails in match lists). The PNGs stay as the source; the WebP files
 * are committed, so run this again after adding or replacing a radar.
 */
import { mkdir, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const DIR = join(process.cwd(), "public", "maps");
const THUMB_PX = 160;

async function main() {
  await mkdir(join(DIR, "thumbs"), { recursive: true });
  const pngs = (await readdir(DIR)).filter((f) => f.endsWith("_radar.png"));
  for (const png of pngs) {
    const map = png.replace(/_radar\.png$/, "");
    const src = join(DIR, png);
    const full = join(DIR, `${map}_radar.webp`);
    const thumb = join(DIR, "thumbs", `${map}.webp`);
    await sharp(src).webp({ quality: 85, effort: 6 }).toFile(full);
    await sharp(src).resize(THUMB_PX).webp({ quality: 80, effort: 6 }).toFile(thumb);
    const [a, b, c] = await Promise.all([stat(src), stat(full), stat(thumb)]);
    console.log(
      `${map}: png ${(a.size / 1024).toFixed(0)} KiB → webp ${(b.size / 1024).toFixed(0)} KiB, thumb ${(c.size / 1024).toFixed(1)} KiB`
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
