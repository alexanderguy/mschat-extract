/**
 * PE Resource Extractor
 *
 * Pure TypeScript implementation for extracting resources from Windows PE executables.
 * Supports standard Windows resources (icons, bitmaps, cursors) and custom formats
 * (AVB, BGB files embedded in CAB archives).
 *
 * Usage:
 *   import { extractResourcesFromPE } from "./resource-extractor";
 *
 *   const result = extractResourcesFromPE({
 *     exePath: "mschat25.exe",
 *     outputDir: "extracted",
 *     extractCabinets: true,
 *     verbose: true
 *   });
 *
 * Features:
 * - Parses PE32 and PE32+ (64-bit) executables
 * - Extracts all standard Windows resource types
 * - Detects and extracts AVB/BGB custom formats
 * - Optional CAB archive extraction (requires cabextract)
 * - Type filtering support
 * - No external dependencies for PE parsing
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

interface PEHeaders {
  dosHeader: DOSHeader;
  peSignature: number;
  coffHeader: COFFHeader;
  optionalHeader: OptionalHeader;
  sections: Section[];
}

interface DOSHeader {
  e_magic: number;
  e_lfanew: number;
}

interface COFFHeader {
  machine: number;
  numberOfSections: number;
  timeDateStamp: number;
  pointerToSymbolTable: number;
  numberOfSymbols: number;
  sizeOfOptionalHeader: number;
  characteristics: number;
}

interface OptionalHeader {
  magic: number;
  addressOfEntryPoint: number;
  imageBase: number;
  sectionAlignment: number;
  fileAlignment: number;
  sizeOfImage: number;
  sizeOfHeaders: number;
  dataDirectories: DataDirectory[];
}

interface DataDirectory {
  virtualAddress: number;
  size: number;
}

interface Section {
  name: string;
  virtualSize: number;
  virtualAddress: number;
  sizeOfRawData: number;
  pointerToRawData: number;
  characteristics: number;
}

interface ResourceDirectory {
  characteristics: number;
  timeDateStamp: number;
  majorVersion: number;
  minorVersion: number;
  numberOfNamedEntries: number;
  numberOfIdEntries: number;
  entries: ResourceDirectoryEntry[];
}

interface ResourceDirectoryEntry {
  nameOrId: number;
  isDirectory: boolean;
  offsetToData: number;
  nameString?: string;
}

interface ResourceDataEntry {
  offsetToData: number;
  size: number;
  codePage: number;
  reserved: number;
}

const RESOURCE_TYPE_NAMES: Record<number, string> = {
  1: "RT_CURSOR",
  2: "RT_BITMAP",
  3: "RT_ICON",
  4: "RT_MENU",
  5: "RT_DIALOG",
  6: "RT_STRING",
  7: "RT_FONTDIR",
  8: "RT_FONT",
  9: "RT_ACCELERATOR",
  10: "RT_RCDATA",
  11: "RT_MESSAGETABLE",
  12: "RT_GROUP_CURSOR",
  14: "RT_GROUP_ICON",
  16: "RT_VERSION",
  17: "RT_DLGINCLUDE",
  19: "RT_PLUGPLAY",
  20: "RT_VXD",
  21: "RT_ANICURSOR",
  22: "RT_ANIICON",
  23: "RT_HTML",
  24: "RT_MANIFEST",
};

function parsePEHeaders(data: Buffer): PEHeaders {
  const e_magic = data.readUInt16LE(0);
  if (e_magic !== 0x5a4d) {
    throw new Error("Not a valid DOS executable (missing MZ signature)");
  }

  const e_lfanew = data.readUInt32LE(0x3c);

  const peSignature = data.readUInt32LE(e_lfanew);
  if (peSignature !== 0x4550) {
    throw new Error("Not a valid PE file (missing PE signature)");
  }

  const coffHeaderOffset = e_lfanew + 4;
  const machine = data.readUInt16LE(coffHeaderOffset);
  const numberOfSections = data.readUInt16LE(coffHeaderOffset + 2);
  const timeDateStamp = data.readUInt32LE(coffHeaderOffset + 4);
  const pointerToSymbolTable = data.readUInt32LE(coffHeaderOffset + 8);
  const numberOfSymbols = data.readUInt32LE(coffHeaderOffset + 12);
  const sizeOfOptionalHeader = data.readUInt16LE(coffHeaderOffset + 16);
  const characteristics = data.readUInt16LE(coffHeaderOffset + 18);

  const optionalHeaderOffset = coffHeaderOffset + 20;
  const magic = data.readUInt16LE(optionalHeaderOffset);
  const is64Bit = magic === 0x20b;

  const addressOfEntryPoint = data.readUInt32LE(optionalHeaderOffset + 16);
  const imageBase = is64Bit
    ? Number(data.readBigUInt64LE(optionalHeaderOffset + 24))
    : data.readUInt32LE(optionalHeaderOffset + 28);
  const sectionAlignment = data.readUInt32LE(optionalHeaderOffset + 32);
  const fileAlignment = data.readUInt32LE(optionalHeaderOffset + 36);
  const sizeOfImage = data.readUInt32LE(optionalHeaderOffset + 56);
  const sizeOfHeaders = data.readUInt32LE(optionalHeaderOffset + 60);

  const numberOfRvaAndSizes = is64Bit
    ? data.readUInt32LE(optionalHeaderOffset + 108)
    : data.readUInt32LE(optionalHeaderOffset + 92);

  const dataDirectoryOffset = is64Bit ? optionalHeaderOffset + 112 : optionalHeaderOffset + 96;

  const dataDirectories: DataDirectory[] = [];
  for (let i = 0; i < numberOfRvaAndSizes; i++) {
    const virtualAddress = data.readUInt32LE(dataDirectoryOffset + i * 8);
    const size = data.readUInt32LE(dataDirectoryOffset + i * 8 + 4);
    dataDirectories.push({ virtualAddress, size });
  }

  const sectionTableOffset = optionalHeaderOffset + sizeOfOptionalHeader;
  const sections: Section[] = [];

  for (let i = 0; i < numberOfSections; i++) {
    const sectionOffset = sectionTableOffset + i * 40;
    const nameBytes = data.subarray(sectionOffset, sectionOffset + 8);
    const nameEnd = nameBytes.indexOf(0);
    const name = nameBytes.toString("ascii", 0, nameEnd === -1 ? 8 : nameEnd);
    const virtualSize = data.readUInt32LE(sectionOffset + 8);
    const virtualAddress = data.readUInt32LE(sectionOffset + 12);
    const sizeOfRawData = data.readUInt32LE(sectionOffset + 16);
    const pointerToRawData = data.readUInt32LE(sectionOffset + 20);
    const characteristics = data.readUInt32LE(sectionOffset + 36);

    sections.push({
      name,
      virtualSize,
      virtualAddress,
      sizeOfRawData,
      pointerToRawData,
      characteristics,
    });
  }

  return {
    dosHeader: { e_magic, e_lfanew },
    peSignature,
    coffHeader: {
      machine,
      numberOfSections,
      timeDateStamp,
      pointerToSymbolTable,
      numberOfSymbols,
      sizeOfOptionalHeader,
      characteristics,
    },
    optionalHeader: {
      magic,
      addressOfEntryPoint,
      imageBase,
      sectionAlignment,
      fileAlignment,
      sizeOfImage,
      sizeOfHeaders,
      dataDirectories,
    },
    sections,
  };
}

function rvaToFileOffset(rva: number, sections: Section[]): number {
  for (const section of sections) {
    if (rva >= section.virtualAddress && rva < section.virtualAddress + section.virtualSize) {
      return rva - section.virtualAddress + section.pointerToRawData;
    }
  }
  throw new Error(`Could not convert RVA ${rva.toString(16)} to file offset`);
}

function parseResourceDirectory(
  data: Buffer,
  offset: number,
  baseOffset: number
): ResourceDirectory {
  const characteristics = data.readUInt32LE(offset);
  const timeDateStamp = data.readUInt32LE(offset + 4);
  const majorVersion = data.readUInt16LE(offset + 8);
  const minorVersion = data.readUInt16LE(offset + 10);
  const numberOfNamedEntries = data.readUInt16LE(offset + 12);
  const numberOfIdEntries = data.readUInt16LE(offset + 14);

  const entries: ResourceDirectoryEntry[] = [];
  let entryOffset = offset + 16;

  const totalEntries = numberOfNamedEntries + numberOfIdEntries;
  for (let i = 0; i < totalEntries; i++) {
    const nameOrId = data.readUInt32LE(entryOffset);
    const offsetToDataOrDirectory = data.readUInt32LE(entryOffset + 4);

    const isDirectory = (offsetToDataOrDirectory & 0x80000000) !== 0;
    const offsetToData = offsetToDataOrDirectory & 0x7fffffff;

    let nameString: string | undefined;
    if ((nameOrId & 0x80000000) !== 0) {
      const nameOffset = baseOffset + (nameOrId & 0x7fffffff);
      const nameLength = data.readUInt16LE(nameOffset);
      nameString = data.toString("utf16le", nameOffset + 2, nameOffset + 2 + nameLength * 2);
    }

    entries.push({
      nameOrId: nameOrId & 0x7fffffff,
      isDirectory,
      offsetToData,
      nameString,
    });

    entryOffset += 8;
  }

  return {
    characteristics,
    timeDateStamp,
    majorVersion,
    minorVersion,
    numberOfNamedEntries,
    numberOfIdEntries,
    entries,
  };
}

function parseResourceDataEntry(data: Buffer, offset: number): ResourceDataEntry {
  return {
    offsetToData: data.readUInt32LE(offset),
    size: data.readUInt32LE(offset + 4),
    codePage: data.readUInt32LE(offset + 8),
    reserved: data.readUInt32LE(offset + 12),
  };
}

interface ExtractedResource {
  type: string;
  typeId: number;
  id: number;
  name?: string;
  data: Buffer;
  language: number;
}

function extractResources(data: Buffer, headers: PEHeaders): ExtractedResource[] {
  const resourceDirectory = headers.optionalHeader.dataDirectories[2];
  if (!resourceDirectory || resourceDirectory.virtualAddress === 0) {
    return [];
  }

  const resourceSectionOffset = rvaToFileOffset(resourceDirectory.virtualAddress, headers.sections);

  const resources: ExtractedResource[] = [];

  const rootDir = parseResourceDirectory(data, resourceSectionOffset, resourceSectionOffset);

  for (const typeEntry of rootDir.entries) {
    if (!typeEntry.isDirectory) continue;

    const typeId = typeEntry.nameOrId;
    const typeName = typeEntry.nameString || RESOURCE_TYPE_NAMES[typeId] || `TYPE_${typeId}`;

    const typeDir = parseResourceDirectory(
      data,
      resourceSectionOffset + typeEntry.offsetToData,
      resourceSectionOffset
    );

    for (const idEntry of typeDir.entries) {
      if (!idEntry.isDirectory) continue;

      const langDir = parseResourceDirectory(
        data,
        resourceSectionOffset + idEntry.offsetToData,
        resourceSectionOffset
      );

      for (const langEntry of langDir.entries) {
        if (langEntry.isDirectory) continue;

        const dataEntry = parseResourceDataEntry(
          data,
          resourceSectionOffset + langEntry.offsetToData
        );

        const dataOffset = rvaToFileOffset(dataEntry.offsetToData, headers.sections);
        const resourceData = data.subarray(dataOffset, dataOffset + dataEntry.size);

        resources.push({
          type: typeName,
          typeId,
          id: idEntry.nameOrId,
          name: idEntry.nameString,
          data: resourceData,
          language: langEntry.nameOrId,
        });
      }
    }
  }

  return resources;
}

function getFileExtension(resource: ExtractedResource): string {
  if (resource.type === "RT_BITMAP" || resource.typeId === 2) {
    return "bmp";
  }
  if (resource.type === "RT_ICON" || resource.typeId === 3) {
    return "ico";
  }
  if (resource.type === "RT_CURSOR" || resource.typeId === 1) {
    return "cur";
  }
  if (resource.type === "RT_GROUP_ICON" || resource.typeId === 14) {
    return "ico";
  }
  if (resource.type === "RT_GROUP_CURSOR" || resource.typeId === 12) {
    return "cur";
  }

  const magic = resource.data.readUInt16LE(0);
  if (magic === 0x8181) {
    const version = resource.data.readUInt16LE(2);
    if (version === 0x0001 || version === 0x0002) {
      return "avb";
    }
    if (version === 0x0003) {
      return "bgb";
    }
  }

  if (resource.data[0] === 0x42 && resource.data[1] === 0x4d) {
    return "bmp";
  }

  return "bin";
}

function createBMPFile(dibData: Buffer): Buffer {
  const dibSize = dibData.length;
  const bmpFileHeaderSize = 14;
  const fileSize = bmpFileHeaderSize + dibSize;

  const bmpHeader = Buffer.alloc(bmpFileHeaderSize);
  bmpHeader.write("BM", 0, "ascii");
  bmpHeader.writeUInt32LE(fileSize, 2);
  bmpHeader.writeUInt32LE(0, 6);
  bmpHeader.writeUInt32LE(bmpFileHeaderSize, 10);

  return Buffer.concat([bmpHeader, dibData]);
}

export interface ExtractResourcesOptions {
  exePath: string;
  outputDir: string;
  types?: string[];
  verbose?: boolean;
  extractCabinets?: boolean;
}

export interface ExtractResourcesResult {
  totalResources: number;
  extractedResources: number;
  resourcesByType: Record<string, number>;
  files: string[];
}

export function extractResourcesFromPE(options: ExtractResourcesOptions): ExtractResourcesResult {
  const { exePath, outputDir, types, verbose } = options;

  if (verbose) {
    console.log(`Reading PE file: ${exePath}`);
  }

  const data = readFileSync(exePath);
  const headers = parsePEHeaders(data);

  if (verbose) {
    console.log(`PE file parsed successfully`);
    console.log(`  Machine: ${headers.coffHeader.machine.toString(16)}`);
    console.log(`  Sections: ${headers.coffHeader.numberOfSections}`);
  }

  const resources = extractResources(data, headers);

  if (verbose) {
    console.log(`Found ${resources.length} resources`);
  }

  mkdirSync(outputDir, { recursive: true });

  const resourcesByType: Record<string, number> = {};
  const files: string[] = [];
  let extractedCount = 0;

  const typeFilter = types?.map((t) => t.toUpperCase());

  for (const resource of resources) {
    const typeName = resource.type.toUpperCase();
    resourcesByType[typeName] = (resourcesByType[typeName] || 0) + 1;

    if (typeFilter && !typeFilter.includes(typeName)) {
      continue;
    }

    const ext = getFileExtension(resource);
    const fileName = resource.name
      ? `${typeName}_${resource.name}.${ext}`
      : `${typeName}_${resource.id}_${resource.language}.${ext}`;

    const outputPath = join(outputDir, fileName);

    let outputData = resource.data;

    if (ext === "bmp" && resource.typeId === 2) {
      outputData = createBMPFile(resource.data);
    }

    writeFileSync(outputPath, outputData);
    files.push(outputPath);
    extractedCount++;

    if (verbose) {
      console.log(`  Extracted: ${fileName} (${resource.data.length} bytes)`);
    }

    if (options.extractCabinets && ext === "bin" && resource.name === "CABINET") {
      if (verbose) {
        console.log(`  Extracting CAB archive: ${fileName}`);
      }

      const cabFiles = extractCabinet(outputPath, outputDir, verbose);
      files.push(...cabFiles);

      if (verbose) {
        console.log(`  Extracted ${cabFiles.length} files from CAB archive`);
      }
    }
  }

  return {
    totalResources: resources.length,
    extractedResources: extractedCount,
    resourcesByType,
    files,
  };
}

function extractCabinet(cabPath: string, outputDir: string, verbose?: boolean): string[] {
  const cabOutputDir = join(outputDir, "cabinet_extracted");
  mkdirSync(cabOutputDir, { recursive: true });

  const result = spawnSync("cabextract", ["-d", cabOutputDir, cabPath], {
    encoding: "utf-8",
  });

  if (result.error) {
    if (verbose) {
      console.warn(`  Warning: cabextract not available, skipping CAB extraction`);
    }
    return [];
  }

  if (result.status !== 0) {
    if (verbose) {
      console.warn(`  Warning: cabextract failed: ${result.stderr}`);
    }
    return [];
  }

  try {
    const extractedFiles = readdirSync(cabOutputDir);
    return extractedFiles.map((f) => join(cabOutputDir, f));
  } catch {
    return [];
  }
}
