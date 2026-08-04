'use strict';
// tests/upload-guard.test.js
//
// The stored-XSS gate on every path that writes a client-supplied file to S3.
//
// The defect this locks down: multer had no `fileFilter` and `putAsset` wrote
// the CLIENT-SUPPLIED `file.mimetype` straight into the S3 object's
// ContentType. `GET /api/media/local/:id` is unauthenticated and 302s to a
// pre-signed URL, so an authed user could upload an HTML/SVG script payload and
// get back a public link that serves it with that Content-Type — stored XSS on
// the S3 origin. (audit backlog 2026-07-31 P0-1.)
//
// Two independent layers, both required — either alone leaves the trap armed:
//   1. mime allowlist   — rejects a file HONESTLY declared as text/html
//   2. magic-byte sniff — rejects a script payload LYING about its type
//      (rename evil.html to a.pdf, set Content-Type: application/pdf)
//
// Layer 2 is the one that matters: layer 1 is trivially bypassed by the
// attacker who controls the multipart headers.

const {
  fileHasAllowedSignature,
  ALLOWED_UPLOAD_MIMES,
} = require('../src/lib/uploadGuard');

// Minimal real file headers. Each is the leading signature a browser/OS writes.
const SIG = {
  pdf:  Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1'),
  png:  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]),
  jpeg: Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46]),
  gif:  Buffer.from('GIF89a\x00\x00', 'latin1'),
  webp: Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]),
  mp4:  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42')]),
  webm: Buffer.from([0x1A, 0x45, 0xDF, 0xA3, 1, 0, 0, 0]),
  zip:  Buffer.from([0x50, 0x4B, 0x03, 0x04, 20, 0, 0, 0]), // docx/xlsx/pptx too
  ole:  Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]), // legacy .doc/.xls
};

// The payloads an attacker actually sends.
const ATTACK = {
  html:      Buffer.from('<html><script>alert(document.cookie)</script></html>', 'utf8'),
  svg:       Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'utf8'),
  svgNoDecl: Buffer.from('<?xml version="1.0"?><svg onload="alert(1)"/>', 'utf8'),
  js:        Buffer.from('alert(document.domain)//', 'utf8'),
  shell:     Buffer.from('#!/bin/sh\nrm -rf /\n', 'utf8'),
  elf:       Buffer.from([0x7F, 0x45, 0x4C, 0x46, 2, 1, 1, 0]),
};

describe('fileHasAllowedSignature — accepts genuine files', () => {
  for (const [name, buf] of Object.entries(SIG)) {
    test(`${name} header is accepted`, () => {
      expect(fileHasAllowedSignature(buf)).toBe(true);
    });
  }
});

describe('fileHasAllowedSignature — rejects script payloads', () => {
  for (const [name, buf] of Object.entries(ATTACK)) {
    test(`${name} payload is rejected`, () => {
      expect(fileHasAllowedSignature(buf)).toBe(false);
    });
  }

  test('an HTML payload renamed .pdf and declared application/pdf is still rejected', () => {
    // This is the whole point of layer 2 — the declared mime is a lie and the
    // allowlist alone would wave it through.
    expect(ALLOWED_UPLOAD_MIMES.has('application/pdf')).toBe(true);
    expect(fileHasAllowedSignature(ATTACK.html)).toBe(false);
  });

  test('empty and truncated buffers are rejected, not crashed on', () => {
    expect(fileHasAllowedSignature(Buffer.alloc(0))).toBe(false);
    expect(fileHasAllowedSignature(Buffer.from([0x25]))).toBe(false);
    expect(fileHasAllowedSignature(null)).toBe(false);
    expect(fileHasAllowedSignature(undefined)).toBe(false);
  });
});

describe('ALLOWED_UPLOAD_MIMES — the scriptable types are absent', () => {
  // SVG and HTML are the two that turn a file store into an XSS host.
  test.each([
    'image/svg+xml',
    'text/html',
    'application/xhtml+xml',
    'text/javascript',
    'application/javascript',
    'application/x-shockwave-flash',
  ])('%s is NOT allowed', (mime) => {
    expect(ALLOWED_UPLOAD_MIMES.has(mime)).toBe(false);
  });

  test('the media library formats users actually upload ARE allowed', () => {
    for (const mime of [
      'application/pdf',
      'image/png', 'image/jpeg', 'image/gif', 'image/webp',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ]) {
      expect(ALLOWED_UPLOAD_MIMES.has(mime)).toBe(true);
    }
  });

  test('no allowed mime starts with text/ — categoryFromMime maps text/* to document', () => {
    // media.js's categoryFromMime has a `m.startsWith('text/') -> document`
    // branch, which is what let text/html through as a legitimate-looking
    // upload. Nothing text/* may be in the allowlist.
    for (const mime of ALLOWED_UPLOAD_MIMES) {
      expect(mime.startsWith('text/')).toBe(false);
    }
  });
});
