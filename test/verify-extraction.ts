#!/usr/bin/env bun

import { readdirSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

interface VerificationResult {
  passed: boolean;
  message: string;
  details?: string[];
}

interface CharacterExpectations {
  [key: string]: number;
}

const EXPECTED_CHARACTERS: CharacterExpectations = {
  anna: 3,
  armando: 3,
  bolo: 3,
  cro: 3,
  dan: 5,
  denise: 3,
  hugh: 4,
  jordan: 2,
  kevin: 3,
  kwensa: 4,
  lance: 3,
  lynnea: 3,
  margaret: 4,
  maynard: 3,
  mike: 3,
  rebecca: 4,
  sage: 3,
  scotty: 3,
  susan: 4,
  tiki: 4,
  tongtyed: 3,
  xeno: 3,
};

const EXPECTED_BACKGROUNDS = ["den", "field", "pastoral", "room", "volcano"];

const REFERENCE_CHARACTERS_DIR = join(process.cwd(), "characters");
const REFERENCE_BACKGROUNDS_DIR = join(process.cwd(), "backgrounds");

function verifyBGBCount(testDir: string): VerificationResult {
  const backgroundsDir = join(testDir, "backgrounds");
  if (!existsSync(backgroundsDir)) {
    return {
      passed: false,
      message: "Backgrounds directory not found",
    };
  }

  const bgbFiles = readdirSync(backgroundsDir).filter((f) => f.endsWith(".bgb"));

  if (bgbFiles.length !== 5) {
    return {
      passed: false,
      message: `Expected 5 BGB files, found ${bgbFiles.length}`,
      details: bgbFiles,
    };
  }

  return {
    passed: true,
    message: `BGB files: ${bgbFiles.length}/5`,
  };
}

function verifyAVBCount(testDir: string): VerificationResult {
  const charactersDir = join(testDir, "characters");
  if (!existsSync(charactersDir)) {
    return {
      passed: false,
      message: "Characters directory not found",
    };
  }

  const avbFiles = readdirSync(charactersDir).filter((f) => f.endsWith(".avb"));

  if (avbFiles.length !== 22) {
    return {
      passed: false,
      message: `Expected 22 AVB files, found ${avbFiles.length}`,
      details: avbFiles,
    };
  }

  return {
    passed: true,
    message: `AVB files: ${avbFiles.length}/22`,
  };
}

function verifyBackgroundPNGs(testDir: string): VerificationResult {
  const backgroundsDir = join(testDir, "backgrounds");
  if (!existsSync(backgroundsDir)) {
    return {
      passed: false,
      message: "Backgrounds directory not found",
    };
  }

  const pngFiles = readdirSync(backgroundsDir).filter((f) => f.endsWith(".png"));

  if (pngFiles.length !== 5) {
    return {
      passed: false,
      message: `Expected 5 background PNGs, found ${pngFiles.length}`,
      details: pngFiles,
    };
  }

  const missingBackgrounds: string[] = [];
  for (const bg of EXPECTED_BACKGROUNDS) {
    if (!pngFiles.includes(`${bg}.png`)) {
      missingBackgrounds.push(bg);
    }
  }

  if (missingBackgrounds.length > 0) {
    return {
      passed: false,
      message: "Missing expected background files",
      details: missingBackgrounds.map((bg) => `${bg}.png`),
    };
  }

  return {
    passed: true,
    message: `Background PNGs: ${pngFiles.length}/5`,
  };
}

function verifyCharacterPNGs(testDir: string): VerificationResult {
  const charactersDir = join(testDir, "characters");
  if (!existsSync(charactersDir)) {
    return {
      passed: false,
      message: "Characters directory not found",
    };
  }

  const pngFiles = readdirSync(charactersDir).filter((f) => f.endsWith(".png"));

  if (pngFiles.length !== 73) {
    return {
      passed: false,
      message: `Expected 73 character PNGs, found ${pngFiles.length}`,
    };
  }

  const errors: string[] = [];

  for (const [character, expectedCount] of Object.entries(EXPECTED_CHARACTERS)) {
    const characterPNGs = pngFiles.filter((f) => {
      const match = f.match(/^(.+)_(\d+)\.png$/);
      return match && match[1] === character;
    });

    if (characterPNGs.length !== expectedCount) {
      errors.push(`${character}: expected ${expectedCount}, found ${characterPNGs.length}`);
    }
  }

  if (errors.length > 0) {
    return {
      passed: false,
      message: "Character PNG counts mismatch",
      details: errors,
    };
  }

  return {
    passed: true,
    message: `Character PNGs: ${pngFiles.length}/73 (all characters correct)`,
  };
}

function compareFiles(file1: string, file2: string): boolean {
  if (!existsSync(file1) || !existsSync(file2)) {
    return false;
  }

  const stat1 = statSync(file1);
  const stat2 = statSync(file2);

  if (stat1.size !== stat2.size) {
    return false;
  }

  const buffer1 = readFileSync(file1);
  const buffer2 = readFileSync(file2);

  return buffer1.equals(buffer2);
}

function verifyBGBByteIdentical(testDir: string): VerificationResult {
  const testBackgroundsDir = join(testDir, "backgrounds");
  const details: string[] = [];
  let identicalCount = 0;

  for (const bg of EXPECTED_BACKGROUNDS) {
    const refFile = join(REFERENCE_BACKGROUNDS_DIR, `${bg}.bgb`);
    const testFile = join(testBackgroundsDir, `${bg}.bgb`);

    if (!existsSync(testFile)) {
      details.push(`${bg}.bgb: MISSING`);
      continue;
    }

    if (compareFiles(refFile, testFile)) {
      identicalCount++;
    } else {
      const refSize = statSync(refFile).size;
      const testSize = statSync(testFile).size;
      details.push(`${bg}.bgb: DIFFERENT (ref: ${refSize} bytes, test: ${testSize} bytes)`);
    }
  }

  if (identicalCount === 5) {
    return {
      passed: true,
      message: `BGB files byte-identical: ${identicalCount}/5`,
    };
  }

  return {
    passed: false,
    message: `BGB files byte-identical: ${identicalCount}/5`,
    details,
  };
}

function verifyAVBByteIdentical(testDir: string): VerificationResult {
  const testCharactersDir = join(testDir, "characters");
  const details: string[] = [];
  let identicalCount = 0;

  for (const character of Object.keys(EXPECTED_CHARACTERS)) {
    const refFile = join(REFERENCE_CHARACTERS_DIR, `${character}.avb`);
    const testFile = join(testCharactersDir, `${character}.avb`);

    if (!existsSync(testFile)) {
      details.push(`${character}.avb: MISSING`);
      continue;
    }

    if (compareFiles(refFile, testFile)) {
      identicalCount++;
    } else {
      const refSize = statSync(refFile).size;
      const testSize = statSync(testFile).size;
      details.push(`${character}.avb: DIFFERENT (ref: ${refSize} bytes, test: ${testSize} bytes)`);
    }
  }

  if (identicalCount === 22) {
    return {
      passed: true,
      message: `AVB files byte-identical: ${identicalCount}/22`,
    };
  }

  return {
    passed: false,
    message: `AVB files byte-identical: ${identicalCount}/22`,
    details,
  };
}

function verifyPNGsExist(testDir: string): VerificationResult {
  const testCharactersDir = join(testDir, "characters");
  const testBackgroundsDir = join(testDir, "backgrounds");
  const details: string[] = [];
  let matchCount = 0;
  let totalExpected = 0;

  for (const bg of EXPECTED_BACKGROUNDS) {
    totalExpected++;
    const testFile = join(testBackgroundsDir, `${bg}.png`);

    if (!existsSync(testFile)) {
      details.push(`${bg}.png: MISSING`);
    } else {
      matchCount++;
    }
  }

  for (const [character, count] of Object.entries(EXPECTED_CHARACTERS)) {
    for (let i = 0; i < count; i++) {
      totalExpected++;
      const testFileName = `${character}_${i + 1}.png`;
      const testFile = join(testCharactersDir, testFileName);

      if (!existsSync(testFile)) {
        details.push(`${testFileName}: MISSING`);
      } else {
        matchCount++;
      }
    }
  }

  if (matchCount === totalExpected) {
    return {
      passed: true,
      message: `PNG files exist: ${matchCount}/${totalExpected}`,
    };
  }

  return {
    passed: false,
    message: `PNG files exist: ${matchCount}/${totalExpected}`,
    details,
  };
}

function verifyPNGsByteComparison(testDir: string): VerificationResult {
  const testCharactersDir = join(testDir, "characters");
  const testBackgroundsDir = join(testDir, "backgrounds");
  const details: string[] = [];
  let identicalCount = 0;
  let similarCount = 0;
  let totalCompared = 0;

  for (const bg of EXPECTED_BACKGROUNDS) {
    const refFile = join(REFERENCE_BACKGROUNDS_DIR, `${bg}.png`);
    const testFile = join(testBackgroundsDir, `${bg}.png`);

    if (!existsSync(testFile)) {
      continue;
    }

    totalCompared++;
    const refSize = statSync(refFile).size;
    const testSize = statSync(testFile).size;

    if (compareFiles(refFile, testFile)) {
      identicalCount++;
    } else {
      const sizeDiff = Math.abs(refSize - testSize);
      const percentDiff = (sizeDiff / refSize) * 100;

      if (percentDiff < 5) {
        similarCount++;
        details.push(`${bg}.png: SIMILAR (${percentDiff.toFixed(2)}% size difference)`);
      } else {
        details.push(
          `${bg}.png: DIFFERENT (ref: ${refSize} bytes, test: ${testSize} bytes, ${percentDiff.toFixed(2)}% diff)`
        );
      }
    }
  }

  for (const [character, count] of Object.entries(EXPECTED_CHARACTERS)) {
    for (let i = 0; i < count; i++) {
      const refFileName = `${character}_${i}.png`;
      const testFileName = `${character}_${i + 1}.png`;
      const refFile = join(REFERENCE_CHARACTERS_DIR, refFileName);
      const testFile = join(testCharactersDir, testFileName);

      if (!existsSync(testFile) || !existsSync(refFile)) {
        continue;
      }

      totalCompared++;
      const refSize = statSync(refFile).size;
      const testSize = statSync(testFile).size;

      if (compareFiles(refFile, testFile)) {
        identicalCount++;
      } else {
        const sizeDiff = Math.abs(refSize - testSize);
        const percentDiff = (sizeDiff / refSize) * 100;

        if (percentDiff < 5) {
          similarCount++;
        } else {
          details.push(
            `${testFileName} vs ${refFileName}: DIFFERENT (ref: ${refSize} bytes, test: ${testSize} bytes, ${percentDiff.toFixed(2)}% diff)`
          );
        }
      }
    }
  }

  const message = `PNG byte comparison: ${identicalCount} identical, ${similarCount} similar, ${totalCompared - identicalCount - similarCount} different (of ${totalCompared} total)`;

  if (identicalCount === totalCompared) {
    return {
      passed: true,
      message,
    };
  }

  if (identicalCount + similarCount === totalCompared) {
    return {
      passed: true,
      message,
      details,
    };
  }

  return {
    passed: false,
    message,
    details,
  };
}

function runExtraction(exePath: string, outputDir: string): boolean {
  console.log("Running extraction...");
  const result = spawnSync("bun", ["mschat-extract-graphics.ts", exePath, outputDir], {
    encoding: "utf-8",
    stdio: "inherit",
  });

  return result.status === 0;
}

function printResult(name: string, result: VerificationResult, indent = 0) {
  const prefix = "  ".repeat(indent);
  const status = result.passed ? "✓" : "✗";
  console.log(`${prefix}${status} ${name}: ${result.message}`);

  if (result.details && result.details.length > 0) {
    for (const detail of result.details) {
      console.log(`${prefix}    ${detail}`);
    }
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log("Usage: bun test/verify-extraction.ts <exe-path> <test-output-dir>");
    console.log(
      "\nVerify that mschat-extract-graphics.ts produces the same output as manual extraction."
    );
    console.log("\nExample:");
    console.log("  bun test/verify-extraction.ts tmp/mschat25.exe tmp/test-output");
    process.exit(1);
  }

  const exePath = args[0];
  const testOutputDir = args[1];

  if (!existsSync(exePath)) {
    console.error(`Error: Executable not found: ${exePath}`);
    console.error("\nTo run this verification test, you need:");
    console.error("1. MS Chat 2.5 executable (mschat25.exe)");
    console.error("2. Manual reference extraction in ./characters/ and ./backgrounds/");
    console.error("\nThese files are not included in the repository due to Microsoft copyright.");
    console.error("You must extract them yourself from a legitimate copy of MS Chat 2.5.");
    process.exit(1);
  }

  if (!existsSync(REFERENCE_CHARACTERS_DIR) || !existsSync(REFERENCE_BACKGROUNDS_DIR)) {
    console.error("Error: Reference extraction directories not found");
    console.error(
      `  Missing: ${!existsSync(REFERENCE_CHARACTERS_DIR) ? REFERENCE_CHARACTERS_DIR : ""}`
    );
    console.error(
      `  Missing: ${!existsSync(REFERENCE_BACKGROUNDS_DIR) ? REFERENCE_BACKGROUNDS_DIR : ""}`
    );
    console.error("\nTo run this verification test, you need manual reference extraction in:");
    console.error("  ./characters/ - 22 AVB files and 73 PNG files");
    console.error("  ./backgrounds/ - 5 BGB files and 5 PNG files");
    console.error("\nThese files are not included in the repository due to Microsoft copyright.");
    console.error("Run the extraction tool first to generate reference files:");
    console.error(`  bun mschat-extract-graphics.ts ${exePath} .`);
    process.exit(1);
  }

  if (existsSync(testOutputDir)) {
    console.log(`Cleaning up existing test output directory: ${testOutputDir}`);
    rmSync(testOutputDir, { recursive: true, force: true });
  }

  console.log("MS Chat Graphics Extraction Verification");
  console.log("=========================================\n");
  console.log(`Executable: ${exePath}`);
  console.log(`Test output: ${testOutputDir}`);
  console.log(`Reference characters: ${REFERENCE_CHARACTERS_DIR}`);
  console.log(`Reference backgrounds: ${REFERENCE_BACKGROUNDS_DIR}\n`);

  if (!runExtraction(exePath, testOutputDir)) {
    console.error("\n✗ Extraction failed");
    process.exit(1);
  }

  console.log("\n=========================================");
  console.log("Verification Results");
  console.log("=========================================\n");

  const results: Array<{ name: string; result: VerificationResult }> = [];

  console.log("File Count Verification:");
  results.push({ name: "BGB Count", result: verifyBGBCount(testOutputDir) });
  results.push({ name: "AVB Count", result: verifyAVBCount(testOutputDir) });
  results.push({ name: "Background PNG Count", result: verifyBackgroundPNGs(testOutputDir) });
  results.push({ name: "Character PNG Count", result: verifyCharacterPNGs(testOutputDir) });

  for (const { name, result } of results) {
    printResult(name, result, 1);
  }

  console.log("\nBinary File Verification:");
  const bgbResult = verifyBGBByteIdentical(testOutputDir);
  printResult("BGB Files", bgbResult, 1);
  results.push({ name: "BGB Byte-Identical", result: bgbResult });

  const avbResult = verifyAVBByteIdentical(testOutputDir);
  printResult("AVB Files", avbResult, 1);
  results.push({ name: "AVB Byte-Identical", result: avbResult });

  console.log("\nPNG File Verification:");
  const pngExistResult = verifyPNGsExist(testOutputDir);
  printResult("PNG Files Exist", pngExistResult, 1);
  results.push({ name: "PNG Files Exist", result: pngExistResult });

  const pngCompareResult = verifyPNGsByteComparison(testOutputDir);
  printResult("PNG Comparison", pngCompareResult, 1);
  results.push({ name: "PNG Byte Comparison", result: pngCompareResult });

  const allPassed = results.every((r) => r.result.passed);

  console.log("\n=========================================");
  if (allPassed) {
    console.log("✓ All verification checks passed");
    process.exit(0);
  } else {
    const failedCount = results.filter((r) => !r.result.passed).length;
    console.log(`✗ ${failedCount} verification check(s) failed`);
    process.exit(1);
  }
}

main();
