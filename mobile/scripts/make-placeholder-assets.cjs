/**
 * Placeholder icon and splash so the apps build and look intentional before
 * final brand art exists. Replace resources/*.png with real artwork (same
 * names and sizes) and re-run `npm run assets`.
 */
const path = require("node:path");
const sharp = require("sharp");

const BRAND = "#3F46C8";
const out = (f) => path.join(__dirname, "..", "resources", f);

function mark(size, fontSize, bg, fg) {
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<rect width="${size}" height="${size}" fill="${bg}"/>` +
      `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="Helvetica, Arial, sans-serif" ` +
      `font-weight="800" font-size="${fontSize}" fill="${fg}">RX</text></svg>`
  );
}

(async () => {
  await sharp(mark(1024, 380, BRAND, "#ffffff")).png().toFile(out("icon.png"));
  await sharp(mark(2732, 520, BRAND, "#ffffff")).png().toFile(out("splash.png"));
  await sharp(mark(2732, 520, "#151a2e", "#ffffff")).png().toFile(out("splash-dark.png"));
  console.log("placeholder assets written to mobile/resources/");
})();
