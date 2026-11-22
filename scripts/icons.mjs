// Renders the extension's PNG icons. The flat logo reads better at small
// sizes than the glossy one, so it's used for the PNGs.
import sharp from "sharp";

const src = "assets/icon-flat-square.svg";
for (const size of [16, 32, 48, 96, 128])
  await sharp(src, { density: 300 })
    .resize(size, size)
    .png()
    .toFile(`public/icons/icon-${size}.png`);
console.log("public/icons/icon-{16,32,48,96,128}.png");
