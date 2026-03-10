import { deflateSync } from "node:zlib";

function calculateCRC(data: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createPNGChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);

  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.concat([typeBuffer, data]);

  const crc = calculateCRC(chunk);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc);

  return Buffer.concat([length, chunk, crcBuffer]);
}

export function convertDIBToPNG(dibData: Buffer): Buffer {
  const _headerSize = dibData.readUInt32LE(0);
  const width = dibData.readUInt32LE(4);
  let height = dibData.readInt32LE(8);
  const bitsPerPixel = dibData.readUInt16LE(14);
  const compression = dibData.readUInt32LE(16);

  if (compression !== 0) {
    throw new Error(`Compressed DIB not supported (compression=${compression})`);
  }

  const isTopDown = height < 0;
  if (isTopDown) {
    height = -height;
  }

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  if (bitsPerPixel === 1 || bitsPerPixel === 4 || bitsPerPixel === 8) {
    const numColorsField = dibData.readUInt32LE(32);
    const numColors = numColorsField || 1 << bitsPerPixel;
    const paletteOffset = 40;
    const paletteSize = numColors * 4;

    const palette: number[][] = [];
    for (let i = 0; i < numColors; i++) {
      const b = dibData[paletteOffset + i * 4];
      const g = dibData[paletteOffset + i * 4 + 1];
      const r = dibData[paletteOffset + i * 4 + 2];
      palette.push([r, g, b]);
    }

    const imageDataOffset = paletteOffset + paletteSize;
    const srcRowWidth = Math.floor((width * bitsPerPixel + 31) / 32) * 4;

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(3, 9);
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);

    const plteData = Buffer.alloc(numColors * 3);
    for (let i = 0; i < numColors; i++) {
      plteData[i * 3] = palette[i][0];
      plteData[i * 3 + 1] = palette[i][1];
      plteData[i * 3 + 2] = palette[i][2];
    }

    const scanlineSize = width + 1;
    const filteredData = Buffer.alloc(scanlineSize * height);

    if (bitsPerPixel === 4) {
      for (let y = 0; y < height; y++) {
        const scanlineStart = y * scanlineSize;
        filteredData[scanlineStart] = 0;

        const srcY = isTopDown ? y : height - 1 - y;
        const srcStart = imageDataOffset + srcY * srcRowWidth;

        for (let x = 0; x < width; x++) {
          const byteIndex = srcStart + Math.floor(x / 2);
          const pixelValue =
            x % 2 === 0 ? (dibData[byteIndex] >> 4) & 0x0f : dibData[byteIndex] & 0x0f;
          filteredData[scanlineStart + 1 + x] = pixelValue;
        }
      }
    } else if (bitsPerPixel === 8) {
      for (let y = 0; y < height; y++) {
        const scanlineStart = y * scanlineSize;
        filteredData[scanlineStart] = 0;

        const srcY = isTopDown ? y : height - 1 - y;
        const srcStart = imageDataOffset + srcY * srcRowWidth;

        for (let x = 0; x < width; x++) {
          filteredData[scanlineStart + 1 + x] = dibData[srcStart + x];
        }
      }
    } else if (bitsPerPixel === 1) {
      for (let y = 0; y < height; y++) {
        const scanlineStart = y * scanlineSize;
        filteredData[scanlineStart] = 0;

        const srcY = isTopDown ? y : height - 1 - y;
        const srcStart = imageDataOffset + srcY * srcRowWidth;

        for (let x = 0; x < width; x++) {
          const byteIndex = srcStart + Math.floor(x / 8);
          const bitIndex = 7 - (x % 8);
          const pixelValue = (dibData[byteIndex] >> bitIndex) & 0x01;
          filteredData[scanlineStart + 1 + x] = pixelValue;
        }
      }
    }

    const compressedImageData = deflateSync(filteredData, { level: 9 });

    const chunks = [
      createPNGChunk("IHDR", ihdr),
      createPNGChunk("PLTE", plteData),
      createPNGChunk("IDAT", compressedImageData),
      createPNGChunk("IEND", Buffer.alloc(0)),
    ];

    return Buffer.concat([pngSignature, ...chunks]);
  } else if (bitsPerPixel === 24 || bitsPerPixel === 32) {
    const imageDataOffset = 40;
    const bytesPerPixel = bitsPerPixel / 8;
    const srcRowWidth = Math.floor((width * bitsPerPixel + 31) / 32) * 4;

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr.writeUInt8(8, 8);
    ihdr.writeUInt8(bitsPerPixel === 32 ? 6 : 2, 9);
    ihdr.writeUInt8(0, 10);
    ihdr.writeUInt8(0, 11);
    ihdr.writeUInt8(0, 12);

    const outputBytesPerPixel = bitsPerPixel === 32 ? 4 : 3;
    const scanlineSize = width * outputBytesPerPixel + 1;
    const filteredData = Buffer.alloc(scanlineSize * height);

    for (let y = 0; y < height; y++) {
      const scanlineStart = y * scanlineSize;
      filteredData[scanlineStart] = 0;

      const srcY = isTopDown ? y : height - 1 - y;
      const srcStart = imageDataOffset + srcY * srcRowWidth;

      for (let x = 0; x < width; x++) {
        const srcPixelStart = srcStart + x * bytesPerPixel;
        const b = dibData[srcPixelStart];
        const g = dibData[srcPixelStart + 1];
        const r = dibData[srcPixelStart + 2];
        const a = bitsPerPixel === 32 ? dibData[srcPixelStart + 3] : 255;

        const destPixelStart = scanlineStart + 1 + x * outputBytesPerPixel;
        filteredData[destPixelStart] = r;
        filteredData[destPixelStart + 1] = g;
        filteredData[destPixelStart + 2] = b;
        if (bitsPerPixel === 32) {
          filteredData[destPixelStart + 3] = a;
        }
      }
    }

    const compressedImageData = deflateSync(filteredData, { level: 9 });

    const chunks = [
      createPNGChunk("IHDR", ihdr),
      createPNGChunk("IDAT", compressedImageData),
      createPNGChunk("IEND", Buffer.alloc(0)),
    ];

    return Buffer.concat([pngSignature, ...chunks]);
  } else {
    throw new Error(`Unsupported bit depth: ${bitsPerPixel}`);
  }
}

export function convertBMPToPNG(bmpData: Buffer): Buffer {
  if (bmpData[0] !== 0x42 || bmpData[1] !== 0x4d) {
    throw new Error("Not a valid BMP file");
  }

  const dibData = bmpData.subarray(14);
  return convertDIBToPNG(dibData);
}

export function convertICOToPNG(icoData: Buffer): Buffer {
  return convertDIBToPNG(icoData);
}
