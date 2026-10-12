import { LIMITS, IMAGE_MIME, VIDEO_MIME } from "@/lib/config";

/**
 * Server-side file validation. The browser also checks, but these checks are the
 * ones that count: MIME type, magic bytes and size are all re-verified here.
 *
 * Deliberately free of `server-only` and of any I/O: the API route is the only
 * caller, and keeping it pure means the rules are unit-testable.
 */

export type FileKind = "image" | "video";

export type ValidatedFile = {
  kind: FileKind;
  mime: string;
  bytes: number;
};

/**
 * Signature table, ordered from most specific to least. JPEG is checked before
 * the ISO-BMFF family on purpose: a JPEG's own bytes can contain an `ftyp` box,
 * and the leading bytes are the ones that decide.
 */
const MAGIC: Array<{ kind: FileKind; mime: string; test: (b: Uint8Array) => boolean }> = [
  {
    kind: "image",
    mime: "image/jpeg",
    test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    kind: "image",
    mime: "image/png",
    test: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
      b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
  },
  {
    kind: "image",
    mime: "image/gif",
    test: (b) =>
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38 &&
      (b[4] === 0x37 || b[4] === 0x39) && b[5] === 0x61,
  },
  {
    kind: "image",
    mime: "image/webp",
    test: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    kind: "video",
    mime: "video/webm",
    test: (b) =>
      b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 &&
      b[4] === 0x93 && b[5] === 0x42 && b[6] === 0x82 && b[7] === 0x88,
  },
  {
    // Only the `avif` brand. The generic `mif1` HEIF brand is ambiguous and most
    // browsers cannot render those stills, so accepting it would only ship
    // broken frames.
    kind: "image",
    mime: "image/avif",
    test: (b) =>
      b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
      b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66,
  },
  {
    kind: "video",
    mime: "video/quicktime",
    test: (b) =>
      b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
      b[8] === 0x71 && b[9] === 0x74,
  },
  {
    kind: "video",
    mime: "video/mp4",
    test: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
];

export function sniffMime(head: Uint8Array): { kind: FileKind; mime: string } | null {
  if (head.length < 12) return null;
  for (const entry of MAGIC) {
    if (entry.test(head)) return { kind: entry.kind, mime: entry.mime };
  }
  return null;
}

export type ValidationFailure = { ok: false; error: string };
export type ValidationSuccess = { ok: true; file: ValidatedFile };

export async function validateUpload(input: {
  head: Uint8Array;
  declaredMime: string;
  size: number;
  expect: FileKind;
}): Promise<ValidationSuccess | ValidationFailure> {
  const sniffed = sniffMime(input.head);
  if (!sniffed) {
    return { ok: false, error: "Unrecognised file. Use JPEG, PNG, WebP, AVIF, GIF, MP4, WebM or MOV." };
  }
  if (sniffed.kind !== input.expect) {
    return {
      ok: false,
      error: `That file is a ${sniffed.kind}, not a ${input.expect}.`,
    };
  }

  const allowed = input.expect === "image" ? IMAGE_MIME : VIDEO_MIME;
  if (!(allowed as readonly string[]).includes(sniffed.mime)) {
    return { ok: false, error: `Format ${sniffed.mime} is not accepted.` };
  }

  const limit = input.expect === "image" ? LIMITS.image.bytes : LIMITS.video.bytes;
  if (input.size > limit) {
    return {
      ok: false,
      error: `That file is larger than the ${input.expect === "image" ? LIMITS.image.label : LIMITS.video.label} limit.`,
    };
  }
  if (input.size < 64) {
    return { ok: false, error: "That file looks truncated or empty." };
  }

  return { ok: true, file: { kind: sniffed.kind, mime: sniffed.mime, bytes: input.size } };
}
