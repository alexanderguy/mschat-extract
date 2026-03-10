#!/usr/bin/env bun

import { extractResourcesFromPE } from "./src/resource-extractor";
import { convertBGBToPNG } from "./src/bgb-converter";
import { convertAVBToPNG } from "./src/avb-converter";
import { convertBMPToPNG, convertICOToPNG } from "./src/standard-converter";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, basename } from "node:path";

interface ConversionStats {
  bgbFiles: number;
  bgbConverted: number;
  avbFiles: number;
  avbConverted: number;
  standardFiles: number;
  standardConverted: number;
  errors: string[];
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: bun mschat-extract-graphics.ts <exe-path> <output-dir>");
    console.log("\nExtract all graphics from an MS Chat executable and convert them to PNG.");
    console.log("\nExample:");
    console.log("  bun mschat-extract-graphics.ts mschat25.exe ./output");
    process.exit(1);
  }

  const exePath = args[0];
  const outputDir = args[1];

  if (!existsSync(exePath)) {
    console.error(`Error: Executable not found: ${exePath}`);
    process.exit(1);
  }

  console.log("MS Chat Graphics Extractor");
  console.log("==========================\n");
  console.log(`Executable: ${exePath}`);
  console.log(`Output directory: ${outputDir}\n`);

  const tempDir = join(outputDir, ".temp");
  const charactersDir = join(outputDir, "characters");
  const backgroundsDir = join(outputDir, "backgrounds");
  const standardDir = join(outputDir, "standard");

  mkdirSync(tempDir, { recursive: true });
  mkdirSync(charactersDir, { recursive: true });
  mkdirSync(backgroundsDir, { recursive: true });
  mkdirSync(standardDir, { recursive: true });

  console.log("Step 1: Extracting resources from PE executable...");
  const extractResult = extractResourcesFromPE({
    exePath,
    outputDir: tempDir,
    verbose: false,
    extractCabinets: true,
  });

  console.log(`  Found ${extractResult.totalResources} resources`);
  console.log(`  Extracted ${extractResult.extractedResources} resources`);
  console.log(`  Created ${extractResult.files.length} files\n`);

  const stats: ConversionStats = {
    bgbFiles: 0,
    bgbConverted: 0,
    avbFiles: 0,
    avbConverted: 0,
    standardFiles: 0,
    standardConverted: 0,
    errors: [],
  };

  console.log("Step 2: Processing extracted files...\n");

  for (const filePath of extractResult.files) {
    const fileName = basename(filePath);
    const ext = fileName.split(".").pop()?.toLowerCase();

    try {
      if (ext === "bgb") {
        stats.bgbFiles++;
        console.log(`  Converting BGB: ${fileName}`);

        const bgbData = readFileSync(filePath);
        const pngData = convertBGBToPNG(bgbData);

        const outputPath = join(backgroundsDir, fileName.replace(/\.bgb$/i, ".png"));
        writeFileSync(outputPath, pngData);

        const originalPath = join(backgroundsDir, fileName);
        writeFileSync(originalPath, bgbData);

        stats.bgbConverted++;
        console.log(`    -> ${basename(outputPath)}`);
      } else if (ext === "avb") {
        stats.avbFiles++;
        console.log(`  Converting AVB: ${fileName}`);

        const avbData = readFileSync(filePath);
        const pngBuffers = convertAVBToPNG(avbData);

        const baseName = fileName.replace(/\.avb$/i, "");
        const originalPath = join(charactersDir, fileName);
        writeFileSync(originalPath, avbData);

        if (pngBuffers.length === 1) {
          const outputPath = join(charactersDir, `${baseName}.png`);
          writeFileSync(outputPath, pngBuffers[0]);
          console.log(`    -> ${basename(outputPath)}`);
        } else {
          for (let i = 0; i < pngBuffers.length; i++) {
            const outputPath = join(charactersDir, `${baseName}_${i + 1}.png`);
            writeFileSync(outputPath, pngBuffers[i]);
            console.log(`    -> ${basename(outputPath)}`);
          }
        }

        stats.avbConverted++;
      } else if (ext && ["ico", "cur", "bmp", "dib"].includes(ext)) {
        if (fileName.includes("RT_GROUP_ICON") || fileName.includes("RT_GROUP_CURSOR")) {
          console.log(`  Skipping ${ext.toUpperCase()}: ${fileName} (metadata only)`);
          continue;
        }

        stats.standardFiles++;
        console.log(`  Converting ${ext.toUpperCase()}: ${fileName}`);

        const fileData = readFileSync(filePath);
        const originalPath = join(standardDir, fileName);
        writeFileSync(originalPath, fileData);

        const baseName = fileName.substring(0, fileName.lastIndexOf("."));
        const outputPath = join(standardDir, `${baseName}.png`);

        let pngData: Buffer;
        if (ext === "bmp") {
          pngData = convertBMPToPNG(fileData);
        } else {
          pngData = convertICOToPNG(fileData);
        }

        writeFileSync(outputPath, pngData);
        stats.standardConverted++;
        console.log(`    -> ${basename(outputPath)}`);
      }
    } catch (error) {
      const errorMsg = `Error processing ${fileName}: ${error instanceof Error ? error.message : String(error)}`;
      stats.errors.push(errorMsg);
      console.error(`  ! ${errorMsg}`);
    }
  }

  console.log("\n==========================");
  console.log("Extraction Complete\n");
  console.log("Summary:");
  console.log(`  Background files (BGB): ${stats.bgbFiles} found, ${stats.bgbConverted} converted`);
  console.log(`  Character files (AVB): ${stats.avbFiles} found, ${stats.avbConverted} converted`);
  console.log(
    `  Standard resources: ${stats.standardFiles} found, ${stats.standardConverted} converted`
  );

  if (stats.errors.length > 0) {
    console.log(`\nErrors (${stats.errors.length}):`);
    for (const error of stats.errors) {
      console.log(`  - ${error}`);
    }
  }

  console.log(`\nOutput directories:`);
  console.log(`  Characters: ${charactersDir}`);
  console.log(`  Backgrounds: ${backgroundsDir}`);
  console.log(`  Standard resources: ${standardDir}`);
}

main();
