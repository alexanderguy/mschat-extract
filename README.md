# MS Chat Graphics Extractor

A TypeScript/Bun toolkit for extracting graphics from Microsoft Chat 2.5 (circa 1996-1997).

## Overview

This tool extracts and converts proprietary graphics formats from MS Chat executables:

- **AVB files** - Character avatars with multiple poses (2-bit transparency)
- **BGB files** - Chat room backgrounds (256-color palette)
- **Standard Windows resources** - ICO, CUR, BMP files

All formats are converted to PNG for modern use using pure TypeScript implementations.

## Requirements

- [Bun](https://bun.sh) runtime
- MS Chat 2.5 executable (`mschat25.exe`) - **not included** (Microsoft proprietary)

## Installation

```bash
# Install dev dependencies (for formatting, linting, type-checking)
bun install

# Or use make to install and build
make deps
```

## Usage

### Extract All Graphics

```bash
bun mschat-extract-graphics.ts <path-to-mschat25.exe> <output-directory>
```

Example:

```bash
bun mschat-extract-graphics.ts ~/Downloads/mschat25.exe ./extracted
```

This creates:

- `extracted/characters/` - 22 AVB files + 73 character PNG files
- `extracted/backgrounds/` - 5 BGB files + 5 background PNG files
- `extracted/standard/` - Windows icon resources (ICO, BMP) as PNG files

### Verify Extraction

To verify the automated extraction matches a manual reference extraction:

```bash
bun test/verify-extraction.ts <path-to-mschat25.exe> <test-output-dir>
```

This performs byte-level comparison between:

- Test output (automated extraction)
- Reference extraction in `./characters/` and `./backgrounds/`

**Note:** Reference files must be present for verification to work.

### Utility Scripts

Individual format converters are also available:

```bash
# Convert a single AVB file to PNG
bun avb-to-png.ts <avb-file> [output-directory]

# Convert a single BGB file to PNG
bun bgb-to-png.ts <bgb-file> <output-png>

# Test resource extraction (low-level PE resource dumping)
bun test-resource-extractor.ts <exe-path> <output-dir>
```

## Development

### Build & Test

```bash
# Run all checks (formatting, linting, type-checking, tests)
make

# Run individual targets
make format        # Format code with Prettier
make lint          # Run ESLint and Prettier checks + TypeScript type-check
make test          # Run tests (currently manual verification only)
make clean         # Remove build artifacts

# Parallel build (faster)
make -j4
```

The Makefile uses stamp files (`.make/`) to avoid redundant work. After the first build, subsequent runs only reprocess changed files.

### Code Quality

- **Formatting**: Prettier (`.prettierrc`)
- **Linting**: ESLint with TypeScript rules (`.eslintrc.json`)
- **Type-checking**: TypeScript strict mode (`tsconfig.json`)

## Project Structure

```
mschat/
├── src/
│   ├── avb-converter.ts          # AVB format decoder
│   ├── bgb-converter.ts          # BGB format decoder
│   └── resource-extractor.ts     # PE resource extraction
├── test/
│   └── verify-extraction.ts      # Byte-level verification
├── mschat-extract-graphics.ts    # Main CLI tool (unified extractor)
├── avb-to-png.ts                 # Standalone AVB converter
├── bgb-to-png.ts                 # Standalone BGB converter
├── test-resource-extractor.ts    # Low-level resource dumping
├── Makefile                      # Build orchestration
├── FILEFORMAT.md                 # File format documentation
└── README.md
```

## File Formats

### AVB (Avatar) Format

- Custom Microsoft format for character sprites
- 2-bit transparency support (transparent/translucent/opaque)
- Multiple poses per character (2-5 poses)
- 256-color palette

### BGB (Background) Format

- Custom Microsoft format for chat room backgrounds
- 256-color palette
- Fixed dimensions

See `FILEFORMAT.md` for detailed format specifications.

## Characters

MS Chat 2.5 includes 22 characters with varying pose counts:

- **2 poses**: jordan
- **3 poses**: anna, armando, bolo, cro, denise, kevin, lance, lynnea, maynard, mike, sage, scotty, tongtyed, xeno
- **4 poses**: hugh, kwensa, margaret, rebecca, susan, tiki
- **5 poses**: dan

Total: **73 character PNG files**

## Backgrounds

5 chat room backgrounds:

- den
- field
- pastoral
- room
- volcano

## Legal Notice

**This repository does NOT include Microsoft's proprietary files:**

- MS Chat executable (`mschat25.exe`)
- Extracted graphics (AVB, BGB, PNG files)

You must obtain MS Chat 2.5 from a legitimate source to use this tool. The tool itself is provided for archival and educational purposes.

## License

This extraction toolkit is released under [LICENSE]. The file format documentation was created through reverse engineering for archival purposes.

Microsoft Chat and its graphics are proprietary to Microsoft Corporation (circa 1996-1997).
