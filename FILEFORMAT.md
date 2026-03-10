# Microsoft Chat Graphics File Formats

This document describes the proprietary graphics file formats used in Microsoft Chat 2.5 (mschat25.exe), discovered through reverse engineering during the extraction project.

## Overview

Microsoft Chat uses two custom binary formats for storing graphics:

- **AVB (Avatar)**: Character sprite files containing multiple poses/expressions per character
- **BGB (Background)**: Background scene files containing a single image

Both formats share a common header structure and use zlib compression for image data.

## Common Header Structure

Both AVB and BGB files begin with an identical 8-byte header:

```
Offset  Size  Type    Description
------  ----  ------  -----------
0x00    2     uint16  Magic number (0x8181)
0x02    2     uint16  Version number
0x04    4     uint32  Total file size in bytes
```

### Magic Number

- Fixed value: `0x8181` (little-endian)
- Present in all AVB and BGB files
- Used to identify the file format family

### Version Number

Determines the file type and internal structure:

- `0x0001` = AVB format (older character sprites)
- `0x0002` = AVB format (newer character sprites)
- `0x0003` = BGB format (background images)

## AVB Format (Character Sprites)

### Version Detection

AVB files use version `0x0001` or `0x0002`. The version number affects the header structure but not the image encoding.

### File Structure (Version 0x0002)

```
Offset  Size  Type    Description
------  ----  ------  -----------
0x00    2     uint16  Magic (0x8181)
0x02    2     uint16  Version (0x0002)
0x04    4     uint32  File size
0x08    4     uint32  Image count (number of DIB images in file)
0x0C    4     uint32  Unknown field
0x10    var   Image   First DIB image block
...     var   Image   Additional DIB image blocks
```

### File Structure (Version 0x0001)

Version 0x0001 omits the "unknown field" at offset 0x0C:

```
Offset  Size  Type    Description
------  ----  ------  -----------
0x00    2     uint16  Magic (0x8181)
0x02    2     uint16  Version (0x0001)
0x04    4     uint32  File size
0x08    4     uint32  Image count
0x0C    var   Image   First DIB image block
...     var   Image   Additional DIB image blocks
```

### DIB Image Block Structure

Each character pose is stored as a separate DIB image block:

```
Offset  Size    Type    Description
------  ------  ------  -----------
0x00    4       uint32  Compressed data size
0x04    4       uint32  Uncompressed data size
0x08    var     bytes   Zlib-compressed image data
```

The compressed data contains:

1. **RGB Palette** (comes first)
   - Size: `paletteEntries * 3` bytes
   - Format: RGB triplets (3 bytes per color)
   - Palette entries = `2^bitsPerPixel`
2. **DIB Header** (BITMAPINFOHEADER)
   - Size: 40 bytes
   - Standard Windows DIB format
3. **Pixel Data**
   - Bottom-up scanline order (standard BMP)
   - Row padding: `Math.floor((width * bitsPerPixel + 31) / 32) * 4` bytes per row
   - Pixel values are palette indices

### Color Depths

AVB files support multiple bit depths:

- **2-bit**: 4 colors (used for most character sprites)
- **4-bit**: 16 colors (used for some detailed sprites)
- **8-bit**: 256 colors (used for complex sprites)

### Critical Discovery: 2-bit Transparency Mapping

**The stored RGB palette is NOT used for 2-bit images.**

Instead, 2-bit AVB images use a hardcoded color mapping to achieve transparency:

| Index | RGBA Value             | Purpose                        |
| ----- | ---------------------- | ------------------------------ |
| 0     | `(0, 0, 0, 0)`         | Fully transparent (background) |
| 1     | `(255, 255, 255, 255)` | White (outlines/highlights)    |
| 2     | `(240, 240, 240, 255)` | Off-white (fill/shading)       |
| 3     | `(0, 0, 0, 255)`       | Black (shadows/details)        |

This mapping was discovered through testing, not documented anywhere in the file format. It enables character sprites to be composited over any background in the Microsoft Chat comic interface.

**For 4-bit and 8-bit images**: Use the stored RGB palette normally.

### Typical Image Counts

Most character AVB files contain 2-5 images representing:

- Default/neutral pose
- Talking/speaking pose
- Emotional expressions (happy, sad, surprised, etc.)
- Gesture variations

## BGB Format (Background Images)

### File Structure

```
Offset  Size  Type    Description
------  ----  ------  -----------
0x00    2     uint16  Magic (0x8181)
0x02    2     uint16  Version (0x0003)
0x04    4     uint32  File size
0x08    4     uint32  Compressed data size
0x0C    4     uint32  Uncompressed data size
0x10    var   bytes   Zlib-compressed image data
```

### Image Data Structure

BGB files contain a single background image. The compressed data layout is identical to AVB DIB blocks:

1. **RGB Palette** (comes first)
   - Size: `paletteEntries * 3` bytes
   - Format: RGB triplets
2. **DIB Header** (BITMAPINFOHEADER)
   - Size: 40 bytes
3. **Pixel Data**
   - Bottom-up scanline order
   - Row padding applies

### Color Depths

BGB files typically use:

- **4-bit**: 16 colors (simple backgrounds)
- **8-bit**: 256 colors (detailed backgrounds)

**BGB files use their stored RGB palettes normally** - there is no special transparency mapping.

## Compression

All image data (palette + DIB header + pixels) is compressed using **zlib (DEFLATE)**:

- Standard zlib format with header
- Compression level varies by file
- Decompression is straightforward using standard zlib libraries

## Row Padding Formula

Both formats use standard BMP row padding:

```
bytesPerRow = Math.floor((width * bitsPerPixel + 31) / 32) * 4
```

This ensures each scanline starts on a 4-byte boundary, which is critical for correct image decoding.

## Pixel Bit Packing

Pixels are packed into bytes with **most significant bits first**:

**2-bit example** (4 pixels per byte):

```
Byte value: 0b11100100
Pixel 0: bits 7-6 = 11 (index 3)
Pixel 1: bits 5-4 = 10 (index 2)
Pixel 2: bits 3-2 = 01 (index 1)
Pixel 3: bits 1-0 = 00 (index 0)
```

**4-bit example** (2 pixels per byte):

```
Byte value: 0xA3
Pixel 0: upper nibble = 0xA (index 10)
Pixel 1: lower nibble = 0x3 (index 3)
```

## Known Files

### From mschat25.exe

**AVB Files (22 characters):**

- anna.avb, ashley.avb, baxter.avb, carlos.avb, figure.avb, jazmine.avb, jordan.avb, julia.avb, kevin.avb, kyle.avb, lmfish.avb, melissa.avb, michelle.avb, msagent.avb, preston.avb, rachel.avb, rascal.avb, raymond.avb, saywhat.avb, taylor.avb, tikiGod.avb, william.avb

**BGB Files (5 backgrounds):**

- den.bgb, field.bgb, pastoral.bgb, room.bgb, volcano.bgb

### Typical Dimensions

- **Characters**: 60-120 pixels wide, 80-160 pixels tall
- **Backgrounds**: 320x240 or 640x480 pixels (VGA resolutions)

## Implementation Notes

### Decoding Process

1. Read and validate header (magic = 0x8181)
2. Check version to determine format (AVB vs BGB)
3. Read compression metadata (compressed/uncompressed sizes)
4. Decompress image data using zlib
5. Extract palette (first N\*3 bytes where N = 2^bitsPerPixel)
6. Parse DIB header (40 bytes)
7. Extract pixel data with proper row padding
8. Unpack pixel bits to palette indices
9. Map indices to colors:
   - For 2-bit AVB: Use hardcoded transparency mapping
   - For all others: Use stored RGB palette
10. Convert to desired output format (PNG, etc.)

### Gotchas

1. **Palette comes BEFORE DIB header** (unusual ordering)
2. **2-bit transparency mapping overrides palette** (undocumented behavior)
3. **Row padding is critical** - off-by-one errors will corrupt the image
4. **Bottom-up scanlines** - row 0 is at the bottom of the image
5. **Version 0x0001 vs 0x0002** - different header sizes but same image encoding

## Tools

Reference implementation: `mschat` extraction toolkit (TypeScript/Bun)

- `src/avb-converter.ts` - AVB decoder with 2-bit transparency support
- `src/bgb-converter.ts` - BGB decoder
- `mschat-extract-graphics.ts` - Unified extraction CLI

## License & Usage

These file formats are proprietary to Microsoft Chat 2.5 (circa 1996-1997). This documentation was created through reverse engineering for archival and educational purposes.

## Version History

- **2026-03-09**: Initial documentation based on extraction project findings
