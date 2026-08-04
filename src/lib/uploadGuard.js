// src/lib/uploadGuard.js
// Stored-XSS gate for every path that writes a client-supplied file to S3.
//
// WHY THIS EXISTS
// `assetStorage.putAsset()` writes the caller's `file.mimetype` straight into
// the S3 object's ContentType, and the serve route 302s to a fresh pre-signed
// URL. So before this module, an authenticated user could upload an HTML or SVG
// script payload and get back a link that served it as `text/html` on the S3
// origin. Stored XSS. (Audit backlog 2026-07-31, P0-1.)
//
// The serve route's own auth does NOT close this. salesport's
// `GET /api/media/local/:id` is unauthenticated outright; hubport's requires
// auth — but either way the pre-signed URL it redirects to is public for its
// full TTL once minted, so the attacker just fetches their own asset and shares
// the resulting link. The gate has to be at write time.
//
// TWO LAYERS, BOTH REQUIRED — either alone leaves the trap armed:
//   1. `makeFileFilter` — a multer fileFilter allowlist. Rejects a file that
//      HONESTLY declares a scriptable type. Cheap, runs before the body is read.
//   2. `assertFileSignature` — magic-byte verification of the parsed buffer.
//      Rejects a payload LYING about its type. The client controls the multipart
//      Content-Type header, so layer 1 on its own is a formality — an attacker
//      renames evil.html to a.pdf and declares application/pdf. Layer 2 is what
//      actually stops them.
//
// Ported from reviewport/src/middleware/upload.js, which has shipped this gate
// since the 2026-06-15 security review. Kept as a per-repo copy to match how the
// fleet already carries logRedact.js — see the hoist finding in the 07-31 audit
// backlog for the eventual microport-auth extraction.

'use strict';

// The types the media library actually stores. Mirrors reviewport's
// SUPPORTED_MIME_TYPES so the two gates can't drift.
//
// DELIBERATELY ABSENT — do not add without a security review:
//   image/svg+xml  — SVG carries <script>; served inline it IS stored XSS
//   text/html, text/*  — media.js's categoryFromMime maps text/* to 'document',
//                        which is precisely how text/html read as a legitimate
//                        upload. Nothing text/* belongs here.
// Every entry below is a binary format with a signature `fileHasAllowedSignature`
// can verify. That invariant is what makes layer 2 total: a type with no
// recognisable header cannot be allowlisted, because it could not be checked.
const ALLOWED_UPLOAD_MIMES = new Set([
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/zip',
]);

// Screenshots only — the bug-report intake. Matches the allowlist hubport and
// productport already enforce on their own bug-report receivers, so the three
// stay in signer/receiver parity. SVG excluded for the reason above.
const ALLOWED_IMAGE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
]);

/**
 * Magic-byte verification. Reads the leading bytes of the parsed buffer and
 * accepts only headers belonging to one of the allowed binary formats, so a
 * mislabelled file (HTML / SVG / script / executable) cannot slip the mime
 * allowlist and get stored, then later served with an attacker-chosen
 * Content-Type.
 *
 * Signatures cover exactly the ALLOWED_UPLOAD_MIMES set above.
 */
function fileHasAllowedSignature(buf) {
  if (!buf || buf.length < 4) return false;
  const at = (bytes, offset = 0) =>
    buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
  const ascii = (str, offset = 0) =>
    at([...str].map(c => c.charCodeAt(0)), offset);

  if (ascii('%PDF')) return true;                                        // PDF
  if (at([0xFF, 0xD8, 0xFF])) return true;                               // JPEG
  if (at([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return true; // PNG
  if (ascii('GIF87a') || ascii('GIF89a')) return true;                   // GIF
  if (ascii('RIFF') && ascii('WEBP', 8)) return true;                    // WEBP
  // mp4 / quicktime — ISO base-media-format box type at offset 4
  if (['ftyp', 'moov', 'mdat', 'free', 'skip', 'wide'].some(t => ascii(t, 4))) return true;
  if (at([0x1A, 0x45, 0xDF, 0xA3])) return true;                         // webm / Matroska (EBML)
  // zip + every OOXML container (docx / xlsx / pptx)
  if (at([0x50, 0x4B, 0x03, 0x04]) || at([0x50, 0x4B, 0x05, 0x06]) || at([0x50, 0x4B, 0x07, 0x08])) return true;
  if (at([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])) return true; // OLE compound (legacy doc/xls/ppt)
  return false;
}

/**
 * Build a multer `fileFilter` over a mime allowlist. Tags the rejection with
 * `code: 'UNSUPPORTED_FILE_TYPE'` so a route wrapper can turn it into a clean
 * 400 instead of bubbling a raw MulterError to the generic error handler.
 */
function makeFileFilter(allowed) {
  return (_req, file, cb) => {
    if (allowed.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(
      new Error(`File type not allowed: ${file.mimetype || 'unknown'}`),
      { code: 'UNSUPPORTED_FILE_TYPE', status: 400 },
    ));
  };
}

/**
 * Express middleware — layer 2. Runs after multer has parsed the body.
 * A missing file is NOT an error here; the route handler reports that case with
 * its own message (some routes make the file optional).
 */
function assertFileSignature(req, res, next) {
  if (!req.file) return next();
  if (!fileHasAllowedSignature(req.file.buffer)) {
    return res.status(400).json({
      error: 'File contents do not match an allowed file type.',
      code:  'FILE_SIGNATURE_MISMATCH',
    });
  }
  next();
}

/**
 * Non-middleware form, for the paths that obtain bytes server-side rather than
 * through multer (e.g. the ReviewPort asset import, which fetches the buffer
 * over HTTP). Throws a tagged error the route's catch turns into a 400.
 */
function assertBufferSignature(buffer, mimeType) {
  if (mimeType != null && !ALLOWED_UPLOAD_MIMES.has(mimeType)) {
    throw Object.assign(new Error(`File type not allowed: ${mimeType}`), { status: 400 });
  }
  if (!fileHasAllowedSignature(buffer)) {
    throw Object.assign(new Error('File contents do not match an allowed file type.'), { status: 400 });
  }
}

module.exports = {
  ALLOWED_UPLOAD_MIMES,
  ALLOWED_IMAGE_MIMES,
  fileHasAllowedSignature,
  makeFileFilter,
  assertFileSignature,
  assertBufferSignature,
};
