#!/usr/bin/env bun

import { readFileSync, writeFileSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseAVBFile, createPNG } from "./src/avb-converter.js";

async function convertAVBToPNG(inputPath: string, outputPath?: string): Promise<void> {
  console.log(`Converting ${inputPath}...`);

  const data = readFileSync(inputPath);
  const parsed = parseAVBFile(data);

  console.log(`  Character: ${parsed.header.characterName}`);
  console.log(`  Copyright: ${parsed.header.copyright}`);
  console.log(`  Images found: ${parsed.images.length}`);

  if (parsed.images.length === 0) {
    console.log(`  No images found in ${inputPath}`);
    return;
  }

  for (let i = 0; i < parsed.images.length; i++) {
    const image = parsed.images[i];
    console.log(`  Image ${i + 1}: ${image.width}x${image.height}, ${image.bitsPerPixel}-bit`);

    const output = outputPath
      ? parsed.images.length === 1
        ? outputPath
        : outputPath.replace(/\.png$/i, `_${i}.png`)
      : inputPath.replace(/\.avb$/i, parsed.images.length === 1 ? `.png` : `_${i}.png`);

    const png = createPNG(image);
    writeFileSync(output, png);

    console.log(`    Saved to ${output}`);
  }
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage: bun avb-to-png.ts <input.avb> [output.png]");
  console.log("   or: bun avb-to-png.ts <directory>");
  process.exit(1);
}

const inputPath = args[0];

let stats;
try {
  stats = statSync(inputPath);
} catch (error) {
  console.error(`File or directory not found: ${inputPath}`);
  process.exit(1);
}

const isFile = stats.isFile();

if (isFile) {
  const outputPath = args[1];
  await convertAVBToPNG(inputPath, outputPath);
} else {
  const files = readdirSync(inputPath).filter((f) => f.toLowerCase().endsWith(".avb"));

  console.log(`Found ${files.length} AVB files in ${inputPath}\n`);

  for (const file of files) {
    const input = join(inputPath, file);
    await convertAVBToPNG(input);
  }

  console.log(`\nProcessed ${files.length} files!`);
}
