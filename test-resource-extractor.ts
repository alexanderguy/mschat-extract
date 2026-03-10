#!/usr/bin/env bun

import { extractResourcesFromPE } from "./src/resource-extractor";

const args = process.argv.slice(2);

if (args.length < 2) {
  console.log(
    "Usage: bun test-resource-extractor.ts <exe-path> <output-dir> [type1,type2,...] [--extract-cab]"
  );
  console.log("\nExample:");
  console.log("  bun test-resource-extractor.ts mschat25.exe tmp/resources");
  console.log(
    "  bun test-resource-extractor.ts mschat25.exe tmp/resources RT_BITMAP,TYPE_300,TYPE_301"
  );
  console.log("  bun test-resource-extractor.ts mschat25.exe tmp/resources --extract-cab");
  process.exit(1);
}

const exePath = args[0];
const outputDir = args[1];
const extractCab = args.includes("--extract-cab");
const typeArg = args[2] && !args[2].startsWith("--") ? args[2] : undefined;
const types = typeArg?.split(",").map((t) => t.trim());

try {
  const result = extractResourcesFromPE({
    exePath,
    outputDir,
    types,
    verbose: true,
    extractCabinets: extractCab,
  });

  console.log("\nExtraction complete!");
  console.log(`Total resources found: ${result.totalResources}`);
  console.log(`Resources extracted: ${result.extractedResources}`);
  console.log(`Files created: ${result.files.length}`);
  console.log("\nResources by type:");
  for (const [type, count] of Object.entries(result.resourcesByType)) {
    console.log(`  ${type}: ${count}`);
  }
} catch (error) {
  console.error("Error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
}
