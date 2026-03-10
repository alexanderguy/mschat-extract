import { inflateSync, deflateSync } from "node:zlib";

export interface AVBHeader {
  magic: number;
  version: number;
  characterName: string;
  copyright: string;
}

export interface AVBImage {
  width: number;
  height: number;
  bitsPerPixel: number;
  palette: Buffer;
  imageData: Buffer;
}

export interface ParsedAVB {
  header: AVBHeader;
  images: AVBImage[];
}

export function parseAVBFile(data: Buffer): ParsedAVB {
  let offset = 0;

  const magic = data.readUInt16LE(offset);
  offset += 2;

  const version = data.readUInt16LE(offset);
  offset += 2;

  if (magic !== 0x8181 || (version !== 0x0001 && version !== 0x0002)) {
    throw new Error(
      `Invalid AVB file: magic=${magic.toString(16)}, version=${version.toString(16)}`
    );
  }

  offset += 12;

  const nameStart = offset;
  let nameEnd = offset;
  while (data[nameEnd] !== 0) nameEnd++;
  const characterName = data.toString("utf-8", nameStart, nameEnd);

  offset = nameEnd + 1;

  while (offset < data.length && data[offset] !== 0x43) offset++;

  const copyrightStart = offset;
  let copyrightEnd = offset;
  while (copyrightEnd < data.length && data[copyrightEnd] !== 0) copyrightEnd++;
  const copyright = data.toString("utf-8", copyrightStart, copyrightEnd);

  const images: AVBImage[] = [];

  let searchOffset = copyrightEnd;
  while (searchOffset < data.length - 40) {
    let dibHeaderOffset = -1;
    for (let i = searchOffset; i < data.length - 40; i++) {
      if (data.readUInt32LE(i) === 0x28 && data.readUInt16LE(i + 12) === 1) {
        dibHeaderOffset = i;
        break;
      }
    }

    if (dibHeaderOffset === -1) break;

    const width = data.readUInt32LE(dibHeaderOffset + 4);
    const height = data.readUInt32LE(dibHeaderOffset + 8);
    const bitsPerPixel = data.readUInt16LE(dibHeaderOffset + 14);
    const numColorsField = data.readUInt32LE(dibHeaderOffset + 32);
    const numColors = numColorsField || 1 << bitsPerPixel;

    const paletteSize = numColors * 3;
    const paletteOffset = dibHeaderOffset - paletteSize;

    if (paletteOffset < 0) {
      searchOffset = dibHeaderOffset + 40;
      continue;
    }

    const palette = data.subarray(paletteOffset, dibHeaderOffset);

    let zlibOffset = -1;
    for (let i = dibHeaderOffset + 40; i < Math.min(data.length - 2, dibHeaderOffset + 200); i++) {
      if (
        data[i] === 0x78 &&
        (data[i + 1] === 0x9c || data[i + 1] === 0xda || data[i + 1] === 0x01)
      ) {
        zlibOffset = i;
        break;
      }
    }

    if (zlibOffset === -1) {
      searchOffset = dibHeaderOffset + 40;
      continue;
    }

    const expectedDataSize = Math.ceil((width * height * bitsPerPixel) / 8);
    const maxCompressedSize = expectedDataSize * 2 + 100;

    try {
      const compressedData = data.subarray(zlibOffset, zlibOffset + maxCompressedSize);
      const imageData = inflateSync(compressedData);

      images.push({
        width,
        height,
        bitsPerPixel,
        palette,
        imageData,
      });

      searchOffset = zlibOffset + compressedData.length;
    } catch (error) {
      searchOffset = dibHeaderOffset + 40;
    }
  }

  return {
    header: {
      magic,
      version,
      characterName,
      copyright,
    },
    images,
  };
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

export function createPNG(image: AVBImage): Buffer {
  const { width, height, palette, imageData, bitsPerPixel } = image;

  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const use2BitMapping = bitsPerPixel === 2;

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(use2BitMapping ? 6 : 3, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const srcRowWidth = Math.floor((width * bitsPerPixel + 31) / 32) * 4;

  let filteredData: Buffer;
  let chunks: Buffer[];

  if (use2BitMapping) {
    const scanlineSize = width * 4 + 1;
    filteredData = Buffer.alloc(scanlineSize * height);

    const colorMapping = [
      [0, 0, 0, 0], // Index 0: Transparent
      [255, 255, 255, 255], // Index 1: White
      [240, 240, 240, 255], // Index 2: Off-white
      [0, 0, 0, 255], // Index 3: Black
    ];

    for (let y = 0; y < height; y++) {
      const scanlineStart = y * scanlineSize;
      filteredData[scanlineStart] = 0;

      const srcY = height - 1 - y;
      const srcStart = srcY * srcRowWidth;

      for (let x = 0; x < width; x++) {
        const byteIndex = srcStart + Math.floor(x / 4);
        const bitShift = 6 - (x % 4) * 2;
        const pixelValue = (imageData[byteIndex] >> bitShift) & 0x03;

        const rgba = colorMapping[pixelValue];
        const pixelStart = scanlineStart + 1 + x * 4;
        filteredData[pixelStart] = rgba[0];
        filteredData[pixelStart + 1] = rgba[1];
        filteredData[pixelStart + 2] = rgba[2];
        filteredData[pixelStart + 3] = rgba[3];
      }
    }

    const compressedImageData = deflateSync(filteredData, { level: 9 });

    chunks = [
      createChunk("IHDR", ihdr),
      createChunk("IDAT", compressedImageData),
      createChunk("IEND", Buffer.alloc(0)),
    ];
  } else {
    const numPaletteEntries = palette.length / 3;
    const plteData = Buffer.alloc(numPaletteEntries * 3);
    for (let i = 0; i < numPaletteEntries; i++) {
      plteData[i * 3] = palette[i * 3];
      plteData[i * 3 + 1] = palette[i * 3 + 1];
      plteData[i * 3 + 2] = palette[i * 3 + 2];
    }

    const scanlineSize = width + 1;
    filteredData = Buffer.alloc(scanlineSize * height);

    if (bitsPerPixel === 4) {
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

    chunks = [
      createChunk("IHDR", ihdr),
      createChunk("PLTE", plteData),
      createChunk("IDAT", compressedImageData),
      createChunk("IEND", Buffer.alloc(0)),
    ];
  }

  return Buffer.concat([pngSignature, ...chunks]);
}

export function convertAVBToPNG(avbData: Buffer): Buffer[] {
  const parsed = parseAVBFile(avbData);
  return parsed.images.map((image) => createPNG(image));
}
