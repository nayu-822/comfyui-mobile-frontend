import { describe, expect, it } from 'vitest';
import {
  extractGenerationMetadataFromImageBytes,
  extractWorkflowFromImageBytes,
  isWorkflowImageFile,
} from '../imageWorkflowMetadata';
import { deflateSync } from 'node:zlib';

const SAMPLE_WORKFLOW = JSON.stringify({
  nodes: [{ id: 1, type: 'KSampler' }],
  links: [],
});

function ascii(s: string): number[] {
  return Array.from(s).map((c) => c.charCodeAt(0));
}

// --- PNG builders ---------------------------------------------------------
function pngChunk(type: string, data: number[]): number[] {
  const len = data.length;
  return [
    (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff,
    ...ascii(type),
    ...data,
    0, 0, 0, 0, // dummy CRC (parser doesn't validate)
  ];
}

function makePng(textChunks: Array<{ keyword: string; text: string }>): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const body: number[] = [];
  for (const { keyword, text } of textChunks) {
    body.push(...pngChunk('tEXt', [...ascii(keyword), 0, ...ascii(text)]));
  }
  body.push(...pngChunk('IEND', []));
  return Uint8Array.from([...sig, ...body]);
}

function makePngWithRawChunks(chunks: Array<{ type: string; data: number[] }>): Uint8Array {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return Uint8Array.from([
    ...sig,
    ...chunks.flatMap(({ type, data }) => pngChunk(type, data)),
    ...pngChunk('IEND', []),
  ]);
}

function makeCompressedPng(keyword: string, text: string, type: 'zTXt' | 'iTXt'): Uint8Array {
  const compressed = Array.from(deflateSync(Buffer.from(text, 'utf8')));
  const data = type === 'zTXt'
    ? [...ascii(keyword), 0, 0, ...compressed]
    : [...ascii(keyword), 0, 1, 0, 0, 0, ...compressed];
  return makePngWithRawChunks([{ type, data }]);
}

// --- EXIF (TIFF, little-endian) builder, used by webp + jpeg -------------
function makeExifWithMake(value: string): number[] {
  return makeExifWithMakeBytes(ascii(value));
}

// Build EXIF whose Make tag holds the given raw bytes (null-terminated). Lets a
// test feed UTF-8-encoded content, not just Latin-1.
function makeExifWithMakeBytes(valueBytes: number[]): number[] {
  const str = [...valueBytes, 0]; // null-terminated
  const count = str.length;
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  return [
    ...ascii('II'), ...u16(0x2a), ...u32(8), // TIFF header, IFD0 at offset 8
    ...u16(1), // one entry
    ...u16(0x010f), ...u16(2), ...u32(count), ...u32(26), // Make, ASCII, count, value@26
    ...u32(0), // no next IFD
    ...str, // value at offset 26
  ];
}

function makeExifTags(tags: Array<{ tag: number; value: string }>): number[] {
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  const entriesOffset = 8;
  const dataOffset = entriesOffset + 2 + tags.length * 12 + 4;
  const values = tags.map(({ value }) => [...new TextEncoder().encode(value), 0]);
  const entries: number[] = [
    ...ascii('II'), ...u16(0x2a), ...u32(entriesOffset),
    ...u16(tags.length),
  ];
  let valueOffset = dataOffset;
  tags.forEach(({ tag }, index) => {
    const value = values[index] ?? [0];
    entries.push(...u16(tag), ...u16(2), ...u32(value.length), ...u32(valueOffset));
    valueOffset += value.length;
  });
  entries.push(...u32(0), ...values.flat());
  return entries;
}

function makeWebp(exif: number[]): Uint8Array {
  const u32le = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
  const pad = exif.length & 1 ? [0] : [];
  const body = [...ascii('WEBP'), ...ascii('EXIF'), ...u32le(exif.length), ...exif, ...pad];
  return Uint8Array.from([...ascii('RIFF'), ...u32le(body.length), ...body]);
}

function makeJpeg(exif: number[]): Uint8Array {
  const payload = [...ascii('Exif'), 0, 0, ...exif];
  const len = payload.length + 2; // APP1 length includes the 2 length bytes
  return Uint8Array.from([
    0xff, 0xd8, // SOI
    0xff, 0xe1, (len >> 8) & 0xff, len & 0xff, ...payload, // APP1 / EXIF
    0xff, 0xd9, // EOI
  ]);
}

describe('isWorkflowImageFile', () => {
  it('matches by mime type', () => {
    expect(isWorkflowImageFile({ type: 'image/png' })).toBe(true);
    expect(isWorkflowImageFile({ type: 'image/webp' })).toBe(true);
    expect(isWorkflowImageFile({ type: 'application/json' })).toBe(false);
  });
  it('matches by extension', () => {
    expect(isWorkflowImageFile({ name: 'out.PNG' })).toBe(true);
    expect(isWorkflowImageFile({ name: 'out.jpeg' })).toBe(true);
    expect(isWorkflowImageFile({ name: 'flow.json' })).toBe(false);
  });
});

describe('extractWorkflowFromImageBytes', () => {
  it('extracts a workflow from a PNG tEXt chunk', () => {
    const png = makePng([
      { keyword: 'prompt', text: '{"foo":1}' },
      { keyword: 'workflow', text: SAMPLE_WORKFLOW },
    ]);
    const wf = extractWorkflowFromImageBytes(png);
    expect(wf).not.toBeNull();
    expect(wf!.nodes[0].type).toBe('KSampler');
  });

  it('returns null for a PNG with no workflow chunk', () => {
    const png = makePng([{ keyword: 'prompt', text: '{"foo":1}' }]);
    expect(extractWorkflowFromImageBytes(png)).toBeNull();
  });

  it('returns null when the embedded value is not valid JSON', () => {
    const png = makePng([{ keyword: 'workflow', text: 'not json {{{' }]);
    expect(extractWorkflowFromImageBytes(png)).toBeNull();
  });

  it('returns null when the JSON lacks a nodes array', () => {
    const png = makePng([{ keyword: 'workflow', text: '{"links":[]}' }]);
    expect(extractWorkflowFromImageBytes(png)).toBeNull();
  });

  it('extracts a workflow from WEBP EXIF (Make = "workflow:{json}")', () => {
    const webp = makeWebp(makeExifWithMake(`workflow:${SAMPLE_WORKFLOW}`));
    const wf = extractWorkflowFromImageBytes(webp);
    expect(wf).not.toBeNull();
    expect(wf!.nodes[0].id).toBe(1);
  });

  it('extracts a workflow from JPEG EXIF (Make = "workflow:{json}")', () => {
    const jpeg = makeJpeg(makeExifWithMake(`workflow:${SAMPLE_WORKFLOW}`));
    const wf = extractWorkflowFromImageBytes(jpeg);
    expect(wf).not.toBeNull();
    expect(wf!.nodes[0].id).toBe(1);
  });

  it('decodes EXIF as UTF-8 so non-Latin-1 characters survive', () => {
    // ComfyUI packs UTF-8 JSON into the (nominally ASCII) EXIF tag; a Latin-1
    // decode would mojibake emoji/CJK in prompts and node titles. It still
    // parses as JSON, so the workflow loads looking fine but corrupted, and a
    // re-run generates from the mangled prompt.
    const wfWithEmoji = JSON.stringify({
      nodes: [{ id: 1, type: 'KSampler', title: 'Sampler \u{1F7E2} \u65E5\u672C\u8A9E' }],
      links: [],
    });
    const bytes = Array.from(new TextEncoder().encode(`workflow:${wfWithEmoji}`));
    const webp = makeWebp(makeExifWithMakeBytes(bytes));
    const wf = extractWorkflowFromImageBytes(webp);
    expect(wf).not.toBeNull();
    expect((wf!.nodes[0] as { title?: string }).title).toBe('Sampler \u{1F7E2} \u65E5\u672C\u8A9E');
  });

  it('ignores EXIF that holds only a prompt (no workflow tag)', () => {
    const webp = makeWebp(makeExifWithMake(`prompt:${SAMPLE_WORKFLOW}`));
    expect(extractWorkflowFromImageBytes(webp)).toBeNull();
  });

  it('returns null for non-image bytes', () => {
    expect(extractWorkflowFromImageBytes(Uint8Array.from(ascii('just text')))).toBeNull();
  });

  it('reads uncompressed iTXt and zTXt workflow metadata', async () => {
    const iTxt = makePngWithRawChunks([{
      type: 'iTXt',
      data: [...ascii('workflow'), 0, 0, 0, 0, 0, ...ascii(SAMPLE_WORKFLOW)],
    }]);
    const zTxt = makeCompressedPng('workflow', SAMPLE_WORKFLOW, 'zTXt');
    const compressedITxt = makeCompressedPng('workflow', SAMPLE_WORKFLOW, 'iTXt');

    expect(extractWorkflowFromImageBytes(zTxt)?.nodes).toHaveLength(1);
    expect(extractWorkflowFromImageBytes(compressedITxt)?.nodes).toHaveLength(1);

    await expect(extractGenerationMetadataFromImageBytes(iTxt)).resolves.toMatchObject({
      found: true,
      malformed: false,
      workflow: expect.objectContaining({ nodes: expect.any(Array) }),
    });
    await expect(extractGenerationMetadataFromImageBytes(zTxt)).resolves.toMatchObject({
      found: true,
      malformed: false,
      workflow: expect.objectContaining({ nodes: expect.any(Array) }),
    });
    await expect(extractGenerationMetadataFromImageBytes(compressedITxt)).resolves.toMatchObject({
      found: true,
      malformed: false,
      workflow: expect.objectContaining({ nodes: expect.any(Array) }),
    });
  });

  it('falls back to PNG prompt metadata when workflow is absent', async () => {
    const prompt = JSON.stringify({ '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'missing.safetensors' } } });
    const png = makePng([{ keyword: 'prompt', text: prompt }]);

    const metadata = await extractGenerationMetadataFromImageBytes(png);
    expect(metadata.workflow).toBeNull();
    expect(metadata.prompt).toEqual(JSON.parse(prompt));
    expect(metadata.found).toBe(true);
  });

  it('distinguishes absent metadata from malformed metadata', async () => {
    const empty = await extractGenerationMetadataFromImageBytes(makePng([]));
    const malformed = await extractGenerationMetadataFromImageBytes(
      makePng([{ keyword: 'workflow', text: '{broken' }]),
    );

    expect(empty).toEqual({ workflow: null, prompt: null, found: false, malformed: false });
    expect(malformed).toMatchObject({ workflow: null, found: true, malformed: true });
  });

  it('reads workflow from Make and prompt from Model in WebP EXIF', async () => {
    const prompt = JSON.stringify({ '1': { class_type: 'CheckpointLoaderSimple', inputs: {} } });
    const webp = makeWebp(makeExifTags([
      { tag: 0x010f, value: `workflow:${SAMPLE_WORKFLOW}` },
      { tag: 0x0110, value: `prompt:${prompt}` },
    ]));

    await expect(extractGenerationMetadataFromImageBytes(webp)).resolves.toMatchObject({
      workflow: expect.objectContaining({ nodes: expect.any(Array) }),
      prompt: JSON.parse(prompt),
      found: true,
    });
  });

  it('reads prompt-only Model EXIF from JPEG', async () => {
    const prompt = JSON.stringify({ '1': { class_type: 'CLIPTextEncode', inputs: { text: 'restore me' } } });
    const jpeg = makeJpeg(makeExifTags([{ tag: 0x0110, value: `prompt:${prompt}` }]));

    const metadata = await extractGenerationMetadataFromImageBytes(jpeg);
    expect(metadata.workflow).toBeNull();
    expect(metadata.prompt).toEqual(JSON.parse(prompt));
    expect(extractWorkflowFromImageBytes(jpeg)).toBeNull();
  });
});
