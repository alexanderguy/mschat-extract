import { inflateSync, deflateSync } from "node:zlib";

export interface BGBHeader {
  magic: number;
  version: number;
  copyright: string;
  palette: Uint8Array;
  width: number;
  height: number;
  bitsPerPixel: number;
}

export interface BGBData extends BGBHeader {
  imageData: Buffer;
}

export function parseBGBFile(data: Buffer): BGBData {
  let offset = 0;

  const magic = data.readUInt16LE(offset);
  offset += 2;

  const version = data.readUInt16LE(offset);
  offset += 2;

  if (magic !== 0x8181 || version !== 0x0003) {
    throw new Error(
      `Invalid BGB file: magic=${magic.toString(16)}, version=${version.toString(16)}`
    );
  }

  offset += 12;

  const copyrightStart = offset;
  let copyrightEnd = offset;
  while (data[copyrightEnd] !== 0) copyrightEnd++;
  const copyright = data.toString("utf-8", copyrightStart, copyrightEnd);

  let dibHeaderOffset = -1;
  for (let i = 0x50; i < data.length - 40; i++) {
    if (data.readUInt32LE(i) === 0x28) {
      dibHeaderOffset = i;
      break;
    }
  }

  if (dibHeaderOffset === -1) {
    throw new Error("Could not find DIB header");
  }

  const _dibSize = data.readUInt32LE(dibHeaderOffset);
  const width = data.readUInt32LE(dibHeaderOffset + 4);
  const height = data.readUInt32LE(dibHeaderOffset + 8);
  const bitsPerPixel = data.readUInt16LE(dibHeaderOffset + 14);
  const numColorsField = data.readUInt32LE(dibHeaderOffset + 32);
  const numColors = numColorsField || 1 << bitsPerPixel;

  const paletteSize = numColors * 3;
  const paletteOffset = dibHeaderOffset - paletteSize;
  const palette = data.subarray(paletteOffset, dibHeaderOffset);

  let zlibOffset = -1;
  for (let i = dibHeaderOffset + 40; i < data.length - 2; i++) {
    if (
      data[i] === 0x78 &&
      (data[i + 1] === 0x9c || data[i + 1] === 0xda || data[i + 1] === 0x01)
    ) {
      zlibOffset = i;
      break;
    }
  }

  if (zlibOffset === -1) {
    throw new Error("Could not find zlib compressed data");
  }

  const compressedData = data.subarray(zlibOffset);
  const decompressed = inflateSync(compressedData);

  return {
    magic,
    version,
    copyright,
    palette,
    width,
    height,
    bitsPerPixel,
    imageData: decompressed,
  };
}

export function createPNG(header: BGBData): Buffer {
  const { width, height, palette, imageData, bitsPerPixel } = header;

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  function createChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);

    const typeBuffer = Buffer.from(type, "ascii");
    const chunk = Buffer.concat([typeBuffer, data]);

    const crc = calculateCRC(chunk);
    const crcBuffer = Buffer.alloc(4);
    crcBuffer.writeUInt32BE(crc);

    return Buffer.concat([length, chunk, crcBuffer]);
  }

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

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(3, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const numPaletteEntries = palette.length / 3;
  const plteData = Buffer.alloc(numPaletteEntries * 3);
  for (let i = 0; i < numPaletteEntries; i++) {
    plteData[i * 3] = palette[i * 3];
    plteData[i * 3 + 1] = palette[i * 3 + 1];
    plteData[i * 3 + 2] = palette[i * 3 + 2];
  }

  const scanlineSize = width + 1;
  const filteredData = Buffer.alloc(scanlineSize * height);

  if (bitsPerPixel === 4) {
    const srcRowWidth = Math.floor((width * bitsPerPixel + 31) / 32) * 4;

    for (let y = 0; y < height; y++) {
      const scanlineStart = y * scanlineSize;
      filteredData[scanlineStart] = 0;

      const srcY = height - 1 - y;
      const srcStart = srcY * srcRowWidth;

      for (let x = 0; x < width; x++) {
        const byteIndex = srcStart + Math.floor(x / 2);
        const pixelValue =
          x % 2 === 0 ? (imageData[byteIndex] >> 4) & 0x0f : imageData[byteIndex] & 0x0f;
        filteredData[scanlineStart + 1 + x] = pixelValue;
      }
    }
  } else {
    const srcRowWidth = Math.floor((width * bitsPerPixel + 31) / 32) * 4;

    for (let y = 0; y < height; y++) {
      const scanlineStart = y * scanlineSize;
      filteredData[scanlineStart] = 0;

      const srcY = height - 1 - y;
      const srcStart = srcY * srcRowWidth;

      for (let x = 0; x < width; x++) {
        filteredData[scanlineStart + 1 + x] = imageData[srcStart + x];
      }
    }
  }

  const compressedImageData = deflateSync(filteredData, { level: 9 });

  const chunks = [
    createChunk("IHDR", ihdr),
    createChunk("PLTE", plteData),
    createChunk("IDAT", compressedImageData),
    createChunk("IEND", Buffer.alloc(0)),
  ];

  return Buffer.concat([pngSignature, ...chunks]);
}

export function convertBGBToPNG(bgbData: Buffer): Buffer {
  const parsed = parseBGBFile(bgbData);
  return createPNG(parsed);
}
