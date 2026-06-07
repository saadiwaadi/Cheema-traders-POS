const fs = require('fs');
const path = require('path');
const Jimp = require('jimp');
const pngToIco = require('png-to-ico').default;

async function main() {
    try {
        const inputPath = "C:\\Users\\GWB\\.gemini\\antigravity\\brain\\2f1b1673-f078-4f4c-8101-dc8769e95134\\media__1780841244487.png";
        console.log("Loading image from", inputPath);
        
        const image = await Jimp.read(inputPath);
        console.log("Original dimensions:", image.bitmap.width, "x", image.bitmap.height);
        
        // 2. Remove transparent padding
        image.autocrop();
        console.log("Autocropped dimensions:", image.bitmap.width, "x", image.bitmap.height);
        
        // 3. Center the artwork perfectly (make it a square canvas)
        const maxDim = Math.max(image.bitmap.width, image.bitmap.height);
        // We can add a little bit of padding so it doesn't touch the edges completely.
        const canvasSize = Math.ceil(maxDim * 1.05); // 5% padding
        
        const squareImage = new Jimp(canvasSize, canvasSize, 0x00000000); // transparent
        const xOffset = Math.floor((canvasSize - image.bitmap.width) / 2);
        const yOffset = Math.floor((canvasSize - image.bitmap.height) / 2);
        
        squareImage.composite(image, xOffset, yOffset);
        console.log("Centered squared dimensions:", squareImage.bitmap.width, "x", squareImage.bitmap.height);
        
        // 4. Generate sizes
        const sizes = [16, 24, 32, 48, 64, 128, 256];
        const buffers = [];
        
        for (const size of sizes) {
            const resized = squareImage.clone().resize(size, size, Jimp.RESIZE_BICUBIC);
            const buffer = await resized.getBufferAsync(Jimp.MIME_PNG);
            buffers.push(buffer);
            console.log(`Generated size: ${size}x${size}`);
        }
        
        // Ensure build directory exists
        const buildDir = path.join(__dirname, 'build');
        if (!fs.existsSync(buildDir)) {
            fs.mkdirSync(buildDir);
        }
        
        // 5. Generate ICO and save
        const icoBuffer = await pngToIco(buffers);
        const outputPath = path.join(buildDir, 'icon.ico');
        fs.writeFileSync(outputPath, icoBuffer);
        
        console.log("SUCCESS: Icon saved to", outputPath);
        
    } catch (err) {
        console.error("ERROR:", err);
    }
}

main();
