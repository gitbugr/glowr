// Renders the store promo tiles from the logo (and, for the marquee, the
// card-editor screenshot made by `npm run screenshots`).
import sharp from "sharp";

const dir = "docs/screenshots/store";
const FONT = "DejaVu Sans, Helvetica, Arial, sans-serif";
const logoPng = async (size) =>
  (await sharp("public/icons/icon.svg", { density: 300 }).resize(size, size).png().toBuffer()).toString("base64");

const background = (W, H, glowX) => `
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1a2233"/><stop offset="1" stop-color="#0d1118"/>
    </linearGradient>
    <radialGradient id="glow" cx="${glowX}" cy="0.5" r="0.45">
      <stop offset="0" stop-color="#2ea8ff" stop-opacity=".28"/><stop offset="1" stop-color="#2ea8ff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>`;

const svgDoc = (W, H, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}">${body}</svg>`;

// Small tile, 440×280.
{
  const W = 440,
    H = 280;
  const svg = svgDoc(W, H, `${background(W, H, 0.27)}
  <image x="28" y="70" width="140" height="140" xlink:href="data:image/png;base64,${await logoPng(300)}"/>
  <g font-family="${FONT}" fill="#e9ecf1">
    <text x="190" y="118" font-size="44" font-weight="bold">Glöwr</text>
    <text x="191" y="152" font-size="17" fill="#c7cfdb">Subtitles into Anki cards,</text>
    <text x="191" y="175" font-size="17" fill="#c7cfdb">with the audio.</text>
    <text x="191" y="208" font-size="12.5" fill="#2ea8ff" letter-spacing=".4">S4C · iPlayer · YouTube</text>
  </g>`);
  await sharp(Buffer.from(svg)).png().toFile(`${dir}/promo-440x280.png`);
  console.log(`${dir}/promo-440x280.png`);
}

// Marquee, 1400×560: text on the left, the card editor on the right.
{
  const W = 1400,
    H = 560;
  const shotW = 736,
    shotH = 460,
    shotX = 610,
    shotY = (H - shotH) / 2,
    r = 14;
  const shot = await sharp(`${dir}/2-editor.png`)
    .resize(shotW, shotH)
    .composite([
      {
        input: Buffer.from(svgDoc(shotW, shotH, `<rect width="${shotW}" height="${shotH}" rx="${r}" fill="#fff"/>`)),
        blend: "dest-in",
      },
    ])
    .png()
    .toBuffer();
  const svg = svgDoc(W, H, `${background(W, H, 0.2)}
  <defs><filter id="sh" x="-10%" y="-10%" width="120%" height="130%">
    <feDropShadow dx="0" dy="18" stdDeviation="22" flood-color="#000" flood-opacity=".55"/></filter></defs>
  <rect x="${shotX}" y="${shotY}" width="${shotW}" height="${shotH}" rx="${r}" fill="#0d1118" filter="url(#sh)"/>
  <image x="64" y="120" width="104" height="104" xlink:href="data:image/png;base64,${await logoPng(300)}"/>
  <g font-family="${FONT}" fill="#e9ecf1">
    <text x="186" y="196" font-size="64" font-weight="bold">Glöwr</text>
    <text x="66" y="286" font-size="30">Turn what you watch into</text>
    <text x="66" y="326" font-size="30">Anki flashcards, with the audio.</text>
    <text x="66" y="382" font-size="20" fill="#c7cfdb">Sentence, translation, highlighted word</text>
    <text x="66" y="410" font-size="20" fill="#c7cfdb">and a clip of the line, all on one card.</text>
    <text x="66" y="462" font-size="18" fill="#2ea8ff" letter-spacing=".5">S4C Clic · BBC iPlayer · YouTube</text>
  </g>
  <rect x="${shotX}" y="${shotY}" width="${shotW}" height="${shotH}" rx="${r}" fill="none"
    stroke="#ffffff" stroke-opacity=".14"/>`);
  await sharp(Buffer.from(svg))
    .composite([{ input: shot, left: shotX, top: shotY }])
    .png()
    .toFile(`${dir}/marquee-1400x560.png`);
  console.log(`${dir}/marquee-1400x560.png`);
}
