/**
 * One-off PWA icon generation from the app's pen-tool logo.
 * Run with: node scripts/generate-icons.mjs
 * Outputs are committed to public/icons/ — this script is not part of the build.
 */
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT_DIR = fileURLToPath(new URL('../public/icons/', import.meta.url));

// The favicon stroke logo, framed on the app's dark background. The maskable
// variant shrinks the glyph into the 80% safe zone required by Android masks.
function iconSvg(size, { maskable = false } = {}) {
    const glyphScale = maskable ? 0.52 : 0.62;
    const glyph = size * glyphScale;
    const offset = (size - glyph) / 2;
    return Buffer.from(`
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${maskable ? 0 : size * 0.18}" fill="#0a0a0a"/>
    <g transform="translate(${offset} ${offset}) scale(${glyph / 24})"
       fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
        <path d="M2 2l7.586 7.586"/>
        <circle cx="11" cy="11" r="2"/>
    </g>
</svg>`);
}

await mkdir(OUT_DIR, { recursive: true });

const jobs = [
    { file: 'icon-192.png', size: 192, maskable: false },
    { file: 'icon-512.png', size: 512, maskable: false },
    { file: 'icon-512-maskable.png', size: 512, maskable: true }
];

for (const { file, size, maskable } of jobs) {
    await sharp(iconSvg(size, { maskable })).png().toFile(join(OUT_DIR, file));
    console.log(`wrote public/icons/${file}`);
}
