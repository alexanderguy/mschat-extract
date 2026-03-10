#!/usr/bin/env bun

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseBGBFile, createPNG } from "./src/bgb-converter";

async function convertBGBToPNG(inputPath: string, outputPath: string): Promise<void> {
  console.log(`Converting ${inputPath}...`);

  const data = readFileSync(inputPath);
  const parsed = parseBGBFile(data);

  console.log(`  Size: ${parsed.width}x${parsed.height}`);
  console.log(`  Bits per pixel: ${parsed.bitsPerPixel}`);
  console.log(`  Copyright: ${parsed.copyright}`);

  const png = await createPNG(parsed);
  writeFileSync(outputPath, png);

  console.log(`  Saved to ${outputPath}`);
}

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("Usage: bun bgb-to-png.ts <input.bgb> [output.png]");
  console.log("   or: bun bgb-to-png.ts <directory>");
  process.exit(1);
}

const inputPath = args[0];
const { statSync } = await import("node:fs");

let stats;
try {
  stats = statSync(inputPath);
} catch (error) {
  console.error(`File or directory not found: ${inputPath}`);
  process.exit(1);
}

const isFile = stats.isFile();

if (isFile) {
  const outputPath = args[1] || inputPath.replace(/\.bgb$/i, ".png");
  await convertBGBToPNG(inputPath, outputPath);
} else {
  const { readdirSync } = await import("node:fs");
  const files = readdirSync(inputPath).filter((f) => f.toLowerCase().endsWith(".bgb"));

  console.log(`Found ${files.length} BGB files in ${inputPath}\n`);

  for (const file of files) {
    const input = join(inputPath, file);
    const output = join(inputPath, file.replace(/\.bgb$/i, ".png"));
    await convertBGBToPNG(input, output);
  }

  console.log(`\nConverted ${files.length} files successfully!`);
}
