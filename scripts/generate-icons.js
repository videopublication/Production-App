const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SOURCE_FILE = path.join(__dirname, '../public/vp-logo.png');
const PUBLIC_DIR = path.join(__dirname, '../public');

async function generateIcons() {
    if (!fs.existsSync(SOURCE_FILE)) {
        console.error('Source file not found:', SOURCE_FILE);
        process.exit(1);
    }

    console.log('Processing icons from:', SOURCE_FILE);

    // 1. Generate Main Logo (Optimized for usage in app) - 512x512
    await sharp(SOURCE_FILE)
        .trim() // Remove transparent border
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFile(path.join(PUBLIC_DIR, 'logo.png'));
    console.log('Generated public/logo.png');

    // 2. Icon 192 (PWA)
    await sharp(SOURCE_FILE)
        .trim() // Remove transparent border
        .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFile(path.join(PUBLIC_DIR, 'icon-192.png'));
    console.log('Generated public/icon-192.png');

    // 3. Icon 512 (PWA)
    await sharp(SOURCE_FILE)
        .trim() // Remove transparent border
        .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFile(path.join(PUBLIC_DIR, 'icon-512.png'));
    console.log('Generated public/icon-512.png');

    // 4. Apple Touch Icon (180x180)
    await sharp(SOURCE_FILE)
        .trim() // Remove transparent border
        .resize(180, 180, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFile(path.join(PUBLIC_DIR, 'apple-touch-icon.png'));
    console.log('Generated public/apple-touch-icon.png');

    // 5. Favicon (png) - 32x32
    await sharp(SOURCE_FILE)
        .trim() // Remove transparent border
        .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .toFile(path.join(PUBLIC_DIR, 'favicon.png'));
    console.log('Generated public/favicon.png');

    // 6. Favicon (ico) - often requested, but png is mostly fine for modern. Let's stick to png as per existing file list 'favicon.png'.

    console.log('All icons generated successfully!');
}

generateIcons().catch(err => {
    console.error('Error generating icons:', err);
    process.exit(1);
});
