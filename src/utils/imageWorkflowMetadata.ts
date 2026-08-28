import type { Workflow } from '@/api/types';

// ComfyUI stores the executable workflow and prompt in different metadata
// containers depending on the image writer. Keep the parser local so restoring
// an image never uploads it or changes the active workflow graph.
// PNG uses workflow/prompt tEXt, iTXt, or zTXt keywords; JPEG/WebP EXIF uses
// Make: workflow:{json} and Model: prompt:{json}.

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];
const IMAGE_MIME = /^image\/(png|jpeg|jpg|webp)$/i;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export interface EmbeddedGenerationMetadata {
  /** A valid ComfyUI canvas workflow, when one was embedded. */
  workflow: Workflow | null;
  /** A valid ComfyUI execution prompt, when one was embedded. */
  prompt: Record<string, unknown> | null;
  /** True when a supported ComfyUI metadata key/tag was present. */
  found: boolean;
  /** True when a present key/tag was malformed or used unsupported compression. */
  malformed: boolean;
}

interface TextCandidate {
  kind: 'workflow' | 'prompt';
  text: string | null;
  compressed: Uint8Array | null;
}

/** Whether a file looks like a workflow-carrying image (by MIME or extension). */
export function isWorkflowImageFile(file: { name?: string; type?: string }): boolean {
  if (file.type && IMAGE_MIME.test(file.type)) return true;
  const name = (file.name ?? '').toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => name.endsWith(ext));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function latin1(bytes: Uint8Array, start: number, end: number): string {
  let out = '';
  for (let i = start; i < end; i += 1) out += String.fromCharCode(bytes[i] ?? 0);
  return out;
}

function utf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes);
}

function decodeText(bytes: Uint8Array): string {
  const decoded = utf8(bytes);
  // PNG tEXt is nominally Latin-1, but ComfyUI/custom writers sometimes put
  // UTF-8 JSON in it. Prefer UTF-8 unless decoding visibly produced U+FFFD.
  return decoded.includes('\uFFFD') ? latin1(bytes, 0, bytes.length) : decoded;
}

function fourCC(bytes: Uint8Array, off: number): string {
  return String.fromCharCode(
    bytes[off] ?? 0,
    bytes[off + 1] ?? 0,
    bytes[off + 2] ?? 0,
    bytes[off + 3] ?? 0,
  );
}

function isPng(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function readPngTextCandidates(bytes: Uint8Array): { candidates: TextCandidate[]; malformed: boolean } {
  const candidates: TextCandidate[] = [];
  let malformed = false;
  if (bytes.length < 8) return { candidates, malformed: true };

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = fourCC(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) {
      malformed = true;
      break;
    }
    if (type === 'IEND') break;

    if (type === 'tEXt') {
      let keywordEnd = dataStart;
      while (keywordEnd < dataEnd && bytes[keywordEnd] !== 0) keywordEnd += 1;
      if (keywordEnd >= dataEnd) {
        malformed = true;
      } else {
        const keyword = latin1(bytes, dataStart, keywordEnd).trim().toLowerCase();
        if (keyword === 'workflow' || keyword === 'prompt') {
          candidates.push({
            kind: keyword,
            text: decodeText(bytes.subarray(keywordEnd + 1, dataEnd)),
            compressed: null,
          });
        }
      }
    } else if (type === 'iTXt') {
      let keywordEnd = dataStart;
      while (keywordEnd < dataEnd && bytes[keywordEnd] !== 0) keywordEnd += 1;
      if (keywordEnd >= dataEnd || keywordEnd + 2 >= dataEnd) {
        malformed = true;
      } else {
        const keyword = latin1(bytes, dataStart, keywordEnd).trim().toLowerCase();
        const compressionFlag = bytes[keywordEnd + 1];
        const compressionMethod = bytes[keywordEnd + 2];
        let payloadStart = keywordEnd + 3;
        const languageEnd = bytes.indexOf(0, payloadStart);
        if (languageEnd < 0 || languageEnd >= dataEnd) {
          malformed = true;
        } else {
          payloadStart = languageEnd + 1;
          const translatedEnd = bytes.indexOf(0, payloadStart);
          if (translatedEnd < 0 || translatedEnd >= dataEnd) {
            malformed = true;
          } else {
            payloadStart = translatedEnd + 1;
            if (keyword === 'workflow' || keyword === 'prompt') {
              if (compressionFlag === 0) {
                candidates.push({
                  kind: keyword,
                  text: decodeText(bytes.subarray(payloadStart, dataEnd)),
                  compressed: null,
                });
              } else if (compressionFlag === 1 && compressionMethod === 0) {
                candidates.push({
                  kind: keyword,
                  text: null,
                  compressed: bytes.slice(payloadStart, dataEnd),
                });
              } else {
                candidates.push({ kind: keyword, text: null, compressed: null });
                malformed = true;
              }
            }
          }
        }
      }
    } else if (type === 'zTXt') {
      let keywordEnd = dataStart;
      while (keywordEnd < dataEnd && bytes[keywordEnd] !== 0) keywordEnd += 1;
      if (keywordEnd >= dataEnd || keywordEnd + 1 >= dataEnd) {
        malformed = true;
      } else {
        const keyword = latin1(bytes, dataStart, keywordEnd).trim().toLowerCase();
        if (keyword === 'workflow' || keyword === 'prompt') {
          const compressionMethod = bytes[keywordEnd + 1];
          if (compressionMethod === 0) {
            candidates.push({
              kind: keyword,
              text: null,
              compressed: bytes.slice(keywordEnd + 2, dataEnd),
            });
          } else {
            candidates.push({ kind: keyword, text: null, compressed: null });
            malformed = true;
          }
        }
      }
    }
    offset = dataEnd + 4;
  }
  return { candidates, malformed };
}

function isWorkflow(value: unknown): value is Workflow {
  return isRecord(value) && Array.isArray(value.nodes);
}

function unwrapPrompt(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  const nested = value.prompt;
  return isRecord(nested) ? nested : value;
}

function parseCandidate(
  candidate: TextCandidate,
  raw: string,
): Workflow | Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return candidate.kind === 'workflow'
      ? (isWorkflow(parsed) ? parsed : null)
      : unwrapPrompt(parsed);
  } catch {
    return null;
  }
}

class DeflateBitReader {
  private offset = 0;
  private bitOffset = 0;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  readBits(count: number): number {
    let value = 0;
    for (let index = 0; index < count; index += 1) {
      if (this.offset >= this.bytes.length) throw new Error('Unexpected end of deflate stream.');
      value |= ((this.bytes[this.offset] ?? 0) >> this.bitOffset & 1) << index;
      this.bitOffset += 1;
      if (this.bitOffset === 8) {
        this.bitOffset = 0;
        this.offset += 1;
      }
    }
    return value;
  }

  alignToByte(): void {
    if (this.bitOffset !== 0) {
      this.bitOffset = 0;
      this.offset += 1;
    }
  }

  readBytes(count: number): Uint8Array {
    this.alignToByte();
    if (this.offset + count > this.bytes.length) throw new Error('Unexpected end of deflate stream.');
    const result = this.bytes.slice(this.offset, this.offset + count);
    this.offset += count;
    return result;
  }
}

function reverseBits(value: number, count: number): number {
  let result = 0;
  for (let index = 0; index < count; index += 1) {
    result = (result << 1) | (value & 1);
    value >>= 1;
  }
  return result;
}

class DeflateHuffmanTable {
  private readonly codes = new Map<string, number>();

  constructor(lengths: number[]) {
    const counts = Array.from({ length: 16 }, () => 0);
    for (const length of lengths) {
      if (length < 0 || length > 15) throw new Error('Invalid deflate code length.');
      if (length > 0) counts[length] = (counts[length] ?? 0) + 1;
    }
    const nextCodes = Array.from({ length: 16 }, () => 0);
    let code = 0;
    for (let length = 1; length <= 15; length += 1) {
      code = (code + (counts[length - 1] ?? 0)) << 1;
      nextCodes[length] = code;
    }
    lengths.forEach((length, symbol) => {
      if (length === 0) return;
      const canonical = nextCodes[length] ?? 0;
      nextCodes[length] = canonical + 1;
      this.codes.set(`${length}:${reverseBits(canonical, length)}`, symbol);
    });
  }

  decode(reader: DeflateBitReader): number {
    let code = 0;
    for (let length = 1; length <= 15; length += 1) {
      code |= reader.readBits(1) << (length - 1);
      const symbol = this.codes.get(`${length}:${code}`);
      if (symbol !== undefined) return symbol;
    }
    throw new Error('Invalid deflate Huffman code.');
  }
}

function fixedDeflateTables(): { literal: DeflateHuffmanTable; distance: DeflateHuffmanTable } {
  const literalLengths = Array.from({ length: 288 }, (_, symbol) => {
    if (symbol <= 143) return 8;
    if (symbol <= 255) return 9;
    if (symbol <= 279) return 7;
    return 8;
  });
  return {
    literal: new DeflateHuffmanTable(literalLengths),
    distance: new DeflateHuffmanTable(Array.from({ length: 32 }, () => 5)),
  };
}

function dynamicDeflateTables(reader: DeflateBitReader): {
  literal: DeflateHuffmanTable;
  distance: DeflateHuffmanTable;
} {
  const literalCount = reader.readBits(5) + 257;
  const distanceCount = reader.readBits(5) + 1;
  const codeLengthCount = reader.readBits(4) + 4;
  const codeLengthOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];
  const codeLengthLengths = Array.from({ length: 19 }, () => 0);
  for (let index = 0; index < codeLengthCount; index += 1) {
    const symbol = codeLengthOrder[index];
    if (symbol !== undefined) codeLengthLengths[symbol] = reader.readBits(3);
  }
  const codeLengthTable = new DeflateHuffmanTable(codeLengthLengths);
  const lengths: number[] = [];
  const total = literalCount + distanceCount;
  while (lengths.length < total) {
    const symbol = codeLengthTable.decode(reader);
    if (symbol <= 15) {
      lengths.push(symbol);
    } else if (symbol === 16) {
      const previous = lengths[lengths.length - 1];
      if (previous === undefined) throw new Error('Invalid deflate repeat code.');
      const repeat = reader.readBits(2) + 3;
      for (let index = 0; index < repeat; index += 1) lengths.push(previous);
    } else if (symbol === 17) {
      const repeat = reader.readBits(3) + 3;
      for (let index = 0; index < repeat; index += 1) lengths.push(0);
    } else if (symbol === 18) {
      const repeat = reader.readBits(7) + 11;
      for (let index = 0; index < repeat; index += 1) lengths.push(0);
    } else {
      throw new Error('Invalid deflate code-length symbol.');
    }
    if (lengths.length > total) throw new Error('Deflate code lengths exceed the declared size.');
  }
  return {
    literal: new DeflateHuffmanTable(lengths.slice(0, literalCount)),
    distance: new DeflateHuffmanTable(lengths.slice(literalCount)),
  };
}

const DEFLATE_LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27,
  31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258,
];
const DEFLATE_LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2,
  3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DEFLATE_DISTANCE_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129,
  193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145,
  8193, 12289, 16385, 24577,
];
const DEFLATE_DISTANCE_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6,
  7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];

function inflateDeflate(bytes: Uint8Array): Uint8Array {
  const reader = new DeflateBitReader(bytes);
  const output: number[] = [];
  let finalBlock = false;
  while (!finalBlock) {
    finalBlock = reader.readBits(1) === 1;
    const blockType = reader.readBits(2);
    if (blockType === 0) {
      const blockLengthBytes = reader.readBytes(4);
      const length = (blockLengthBytes[0] ?? 0) | ((blockLengthBytes[1] ?? 0) << 8);
      const inverse = (blockLengthBytes[2] ?? 0) | ((blockLengthBytes[3] ?? 0) << 8);
      if ((length ^ inverse) !== 0xffff) throw new Error('Invalid stored deflate block.');
      output.push(...reader.readBytes(length));
      continue;
    }
    if (blockType === 3) throw new Error('Reserved deflate block type.');
    const tables = blockType === 1
      ? fixedDeflateTables()
      : dynamicDeflateTables(reader);
    while (true) {
      const symbol = tables.literal.decode(reader);
      if (symbol < 256) {
        output.push(symbol);
        continue;
      }
      if (symbol === 256) break;
      const lengthIndex = symbol - 257;
      const lengthBase = DEFLATE_LENGTH_BASE[lengthIndex];
      const lengthExtra = DEFLATE_LENGTH_EXTRA[lengthIndex];
      if (lengthBase === undefined || lengthExtra === undefined) throw new Error('Invalid deflate length symbol.');
      const length = lengthBase + reader.readBits(lengthExtra);
      const distanceSymbol = tables.distance.decode(reader);
      const distanceBase = DEFLATE_DISTANCE_BASE[distanceSymbol];
      const distanceExtra = DEFLATE_DISTANCE_EXTRA[distanceSymbol];
      if (distanceBase === undefined || distanceExtra === undefined || distanceBase > output.length) {
        throw new Error('Invalid deflate distance symbol.');
      }
      const distance = distanceBase + reader.readBits(distanceExtra);
      if (distance > output.length) throw new Error('Deflate distance exceeds output.');
      for (let index = 0; index < length; index += 1) {
        const source = output.length - distance;
        const value = output[source];
        if (value === undefined) throw new Error('Invalid deflate back-reference.');
        output.push(value);
      }
    }
  }
  return Uint8Array.from(output);
}

function inflateZlibSync(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 6) throw new Error('Invalid zlib stream.');
  const cmf = bytes[0] ?? 0;
  const flg = bytes[1] ?? 0;
  if ((cmf & 0x0f) !== 8 || ((cmf << 8) | flg) % 31 !== 0) {
    throw new Error('Invalid zlib header.');
  }
  const deflateStart = (flg & 0x20) !== 0 ? 6 : 2;
  if (deflateStart + 4 > bytes.length) throw new Error('Invalid zlib dictionary header.');
  return inflateDeflate(bytes.subarray(deflateStart, bytes.length - 4));
}

async function inflateZlib(bytes: Uint8Array): Promise<Uint8Array> {
  try {
    return inflateZlibSync(bytes);
  } catch (syncError) {
    if (typeof DecompressionStream === 'undefined') throw syncError;
    const source = new Response(bytes.slice().buffer).body;
    if (!source) throw new Error('Unable to read compressed PNG metadata.');
    const decompressed = source.pipeThrough(new DecompressionStream('deflate'));
    return new Uint8Array(await new Response(decompressed).arrayBuffer());
  }
}

async function resolveCandidate(candidate: TextCandidate): Promise<{
  value: Workflow | Record<string, unknown> | null;
  malformed: boolean;
}> {
  if (candidate.text !== null) {
    const value = parseCandidate(candidate, candidate.text);
    return { value, malformed: value === null };
  }
  if (!candidate.compressed) return { value: null, malformed: true };
  try {
    const text = decodeText(await inflateZlib(candidate.compressed));
    const value = parseCandidate(candidate, text);
    return { value, malformed: value === null };
  } catch {
    return { value: null, malformed: true };
  }
}

function emptyMetadata(): EmbeddedGenerationMetadata {
  return { workflow: null, prompt: null, found: false, malformed: false };
}

async function resolveCandidates(
  candidates: TextCandidate[],
  malformed: boolean,
): Promise<EmbeddedGenerationMetadata> {
  const result = emptyMetadata();
  result.found = candidates.length > 0;
  result.malformed = malformed;
  for (const candidate of candidates) {
    const resolved = await resolveCandidate(candidate);
    result.malformed ||= resolved.malformed;
    if (candidate.kind === 'workflow' && isWorkflow(resolved.value) && !result.workflow) {
      result.workflow = resolved.value;
    }
    if (candidate.kind === 'prompt' && isRecord(resolved.value) && !result.prompt) {
      result.prompt = resolved.value;
    }
  }
  return result;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes.length >= 12 && fourCC(bytes, 0) === 'RIFF' && fourCC(bytes, 8) === 'WEBP';
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function stripExifPrefix(bytes: Uint8Array): Uint8Array {
  return bytes.length >= 6 && latin1(bytes, 0, 6) === 'Exif\0\0'
    ? bytes.subarray(6)
    : bytes;
}

function readWebpExif(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    if (dataStart + size > bytes.length) return null;
    if (fourCC(bytes, offset) === 'EXIF') return stripExifPrefix(bytes.subarray(dataStart, dataStart + size));
    offset = dataStart + size + (size & 1);
  }
  return null;
}

function readJpegExif(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = view.getUint16(offset + 2);
    if (length < 2 || offset + 2 + length > bytes.length) return null;
    if (marker === 0xe1) {
      const segment = bytes.subarray(offset + 4, offset + 2 + length);
      const stripped = stripExifPrefix(segment);
      if (stripped !== segment) return stripped;
    }
    offset += 2 + length;
  }
  return null;
}

function readExifTagString(exif: Uint8Array, tags: number[]): string | null {
  if (exif.length < 8) return null;
  const little = exif[0] === 0x49 && exif[1] === 0x49;
  const big = exif[0] === 0x4d && exif[1] === 0x4d;
  if (!little && !big) return null;
  const view = new DataView(exif.buffer, exif.byteOffset, exif.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, little);
  const u32 = (offset: number) => view.getUint32(offset, little);
  const ifd0 = u32(4);
  if (ifd0 + 2 > exif.length) return null;
  const count = u16(ifd0);
  for (let index = 0; index < count; index += 1) {
    const entry = ifd0 + 2 + index * 12;
    if (entry + 12 > exif.length) break;
    const tag = u16(entry);
    if (!tags.includes(tag) || u16(entry + 2) !== 2) continue;
    const length = u32(entry + 4);
    const valueOffset = length <= 4 ? entry + 8 : u32(entry + 8);
    if (valueOffset + length > exif.length) continue;
    let end = valueOffset + length;
    while (end > valueOffset && exif[end - 1] === 0) end -= 1;
    return decodeText(exif.subarray(valueOffset, end));
  }
  return null;
}

function addExifCandidate(
  candidates: TextCandidate[],
  kind: 'workflow' | 'prompt',
  value: string | null,
): void {
  if (!value) return;
  const separator = value.indexOf(':');
  if (separator >= 0) {
    const prefix = value.slice(0, separator).trim().toLowerCase();
    if (prefix === 'workflow' || prefix === 'prompt') {
      candidates.push({ kind: prefix, text: value.slice(separator + 1), compressed: null });
      return;
    }
  }
  // EXIF Make is conventionally workflow and Model is conventionally prompt.
  candidates.push({ kind, text: value, compressed: null });
}

function exifCandidates(exif: Uint8Array | null): TextCandidate[] {
  if (!exif) return [];
  const candidates: TextCandidate[] = [];
  addExifCandidate(candidates, 'workflow', readExifTagString(exif, [0x010f])); // Make
  addExifCandidate(candidates, 'prompt', readExifTagString(exif, [0x0110])); // Model
  addExifCandidate(candidates, 'workflow', readExifTagString(exif, [0x010e])); // ImageDescription fallback
  return candidates;
}

function synchronousWorkflowFromCandidates(candidates: TextCandidate[]): Workflow | null {
  for (const candidate of candidates) {
    if (candidate.kind !== 'workflow') continue;
    let text = candidate.text;
    if (text === null && candidate.compressed) {
      try {
        text = decodeText(inflateZlibSync(candidate.compressed));
      } catch {
        continue;
      }
    }
    if (text === null) continue;
    const value = parseCandidate(candidate, text);
    if (isWorkflow(value)) return value;
  }
  return null;
}

/**
 * Extract all supported ComfyUI metadata from raw bytes. The async API also
 * provides a browser-stream fallback for compressed PNG text when needed.
 */
export async function extractGenerationMetadataFromImageBytes(
  bytes: Uint8Array,
): Promise<EmbeddedGenerationMetadata> {
  if (isPng(bytes)) {
    const png = readPngTextCandidates(bytes);
    return resolveCandidates(png.candidates, png.malformed);
  }
  if (isWebp(bytes)) return resolveCandidates(exifCandidates(readWebpExif(bytes)), false);
  if (isJpeg(bytes)) return resolveCandidates(exifCandidates(readJpegExif(bytes)), false);
  return emptyMetadata();
}

/** Read a File and extract workflow and/or prompt metadata from it. */
export async function extractGenerationMetadataFromImageFile(
  file: File,
): Promise<EmbeddedGenerationMetadata> {
  const buffer = await file.arrayBuffer();
  return extractGenerationMetadataFromImageBytes(new Uint8Array(buffer));
}

/**
 * Backward-compatible synchronous workflow helper. It supports the same PNG
 * text formats as the async metadata API, including zTXt/compressed iTXt.
 */
export function extractWorkflowFromImageBytes(bytes: Uint8Array): Workflow | null {
  if (isPng(bytes)) {
    return synchronousWorkflowFromCandidates(readPngTextCandidates(bytes).candidates);
  }
  if (isWebp(bytes)) return synchronousWorkflowFromCandidates(exifCandidates(readWebpExif(bytes)));
  if (isJpeg(bytes)) return synchronousWorkflowFromCandidates(exifCandidates(readJpegExif(bytes)));
  return null;
}

/** Read a File and extract its embedded ComfyUI workflow, or null. */
export async function extractWorkflowFromImageFile(file: File): Promise<Workflow | null> {
  const metadata = await extractGenerationMetadataFromImageFile(file);
  return metadata.workflow;
}
