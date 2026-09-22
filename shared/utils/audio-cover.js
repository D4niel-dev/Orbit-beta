// src/js/utils/audio-cover.js
//
// Extract the embedded cover art ("sound track image") from an audio file.
//
// Pure and synchronous: give it an ArrayBuffer, get back
//   { url: 'data:image/jpeg;base64,...', mime: 'image/jpeg', kind: 'id3'|'mp4'|'flac' }
// or null when the file carries no artwork.
//
// It must NEVER throw and never be slow — cover art is a nicety, and a malformed
// tag must not be able to break playback. Every parse path is bounds-checked and
// wrapped by the caller in a try/catch as well.
//
// Containers handled:
//   ID3v2  (MP3)  — APIC frame (v2.3 / v2.4) and PIC (v2.2)
//   MP4/M4A       — `covr` atom under moov.udta.meta.ilst
//   FLAC          — PICTURE metadata block
//
// Ogg/Vorbis/Opus (METADATA_BLOCK_PICTURE) is deliberately not handled: the
// picture is base64 inside a comment header, which is rare in practice and
// awkward to bound-check. Those files simply fall back to the default icon.
window.OrbitAudioCover = (function() {
  'use strict';

  // A single embedded image larger than this is almost certainly not artwork.
  var MAX_IMAGE_BYTES = 12 * 1024 * 1024;

  function _bytesToBase64(bytes) {
    if (typeof btoa === 'function') {
      // Chunked so we never blow the argument limit on large images.
      var CHUNK = 0x8000;
      var out = '';
      for (var i = 0; i < bytes.length; i += CHUNK) {
        out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
      }
      return btoa(out);
    }
    if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
    return null;
  }

  function _finish(bytes, mime, kind) {
    if (!bytes || bytes.length < 32 || bytes.length > MAX_IMAGE_BYTES) return null;
    if (!mime || mime.indexOf('image/') !== 0) mime = _sniffMime(bytes);
    var b64 = _bytesToBase64(bytes);
    if (!b64) return null;
    return { url: 'data:' + mime + ';base64,' + b64, mime: mime, kind: kind };
  }

  // Fall back to magic bytes when a container reports a useless mime type.
  function _sniffMime(b) {
    if (b[0] === 0xFF && b[1] === 0xD8) return 'image/jpeg';
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47) return 'image/png';
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return 'image/gif';
    if (b[0] === 0x42 && b[1] === 0x4D) return 'image/bmp';
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46) return 'image/webp';
    return 'image/jpeg';
  }

  function _ascii(b, from, to) {
    var s = '';
    for (var i = from; i < to; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  // ---- ID3v2 (MP3) -------------------------------------------------------

  // ID3 sizes are "syncsafe": 7 bits per byte, high bit always clear.
  function _syncsafe(b, o) {
    return ((b[o] & 0x7F) << 21) | ((b[o + 1] & 0x7F) << 14) | ((b[o + 2] & 0x7F) << 7) | (b[o + 3] & 0x7F);
  }

  function _u32(b, o) {
    return ((b[o] << 24) | (b[o + 1] << 16) | (b[o + 2] << 8) | b[o + 3]) >>> 0;
  }

  function _fromId3(b) {
    if (b.length < 10) return null;
    // 'ID3'
    if (b[0] !== 0x49 || b[1] !== 0x44 || b[2] !== 0x33) return null;
    var major = b[3];
    if (major < 2 || major > 4) return null;
    var flags = b[5];
    var size = _syncsafe(b, 6);
    if (size <= 0) return null;
    var end = Math.min(b.length, 10 + size);

    var p = 10;
    // Extended header — must be skipped or the first frame id is garbage.
    if (flags & 0x40) {
      if (p + 4 > end) return null;
      p += (major >= 4) ? _syncsafe(b, p) : _u32(b, p) + 4;
    }

    var idLen = (major === 2) ? 3 : 4;
    var headerLen = (major === 2) ? 6 : 10;

    while (p + headerLen <= end) {
      var id = _ascii(b, p, p + idLen);
      if (!/^[A-Z0-9]{3,4}$/.test(id)) break; // padding or a frame we cannot trust

      var fsize;
      if (major === 2) fsize = (b[p + 3] << 16) | (b[p + 4] << 8) | b[p + 5];
      else if (major >= 4) fsize = _syncsafe(b, p + 4);
      else fsize = _u32(b, p + 4);

      if (fsize <= 0 || p + headerLen + fsize > end) break;

      if (id === 'APIC' || id === 'PIC') {
        var f = p + headerLen;
        var fe = f + fsize;
        var enc = b[f];
        var q = f + 1;
        var mime;

        if (id === 'PIC') {
          // v2.2: 3-character image format instead of a mime string.
          mime = 'image/' + _ascii(b, q, q + 3).toLowerCase();
          q += 3;
        } else {
          var z = q;
          while (z < fe && b[z] !== 0) z++;
          mime = _ascii(b, q, z) || 'image/jpeg';
          q = z + 1;
        }

        q += 1; // picture type byte

        // Description is terminated with \0 (single-byte encodings) or \0\0 (UTF-16).
        if (enc === 1 || enc === 2) {
          while (q + 1 < fe && !(b[q] === 0 && b[q + 1] === 0)) q += 2;
          q += 2;
        } else {
          while (q < fe && b[q] !== 0) q++;
          q += 1;
        }

        if (q < fe) return _finish(b.subarray(q, fe), mime, 'id3');
        return null;
      }

      p += headerLen + fsize;
    }
    return null;
  }

  // ---- MP4 / M4A ---------------------------------------------------------

  // Scan for the `covr` atom rather than walking the whole box tree: it is
  // equally reliable, survives files where `moov` sits at the end (non-faststart),
  // and works on a partial (head or tail) buffer.
  function _fromMp4(b) {
    for (var i = 4; i + 16 <= b.length; i++) {
      if (b[i] !== 0x63 || b[i + 1] !== 0x6F || b[i + 2] !== 0x76 || b[i + 3] !== 0x72) continue; // 'covr'
      var covrSize = _u32(b, i - 4);
      if (covrSize < 16 || i - 4 + covrSize > b.length) continue;
      // The first child box must be `data`. Its 4-byte size comes first, so the
      // tag sits 8 bytes after the 'covr' tag — not 4.
      if (b[i + 8] !== 0x64 || b[i + 9] !== 0x61 || b[i + 10] !== 0x74 || b[i + 11] !== 0x61) continue;
      var dataSize = _u32(b, i + 4);
      if (dataSize < 12) continue;
      // 4 bytes of version/flags; the low byte of the first is the image type.
      var typeByte = b[i + 12];
      var start = i + 16;
      var stop = Math.min(b.length, i + 4 + dataSize);
      if (stop <= start) continue;
      var mime = (typeByte === 0x0E) ? 'image/png' : (typeByte === 0x0D) ? 'image/jpeg' : _sniffMime(b.subarray(start, start + 4));
      return _finish(b.subarray(start, stop), mime, 'mp4');
    }
    return null;
  }

  // ---- FLAC --------------------------------------------------------------

  function _fromFlac(b) {
    if (b.length < 8) return null;
    // 'fLaC'
    if (b[0] !== 0x66 || b[1] !== 0x4C || b[2] !== 0x61 || b[3] !== 0x43) return null;
    var p = 4;
    while (p + 4 <= b.length) {
      var header = b[p];
      var isLast = (header & 0x80) !== 0;
      var type = header & 0x7F;
      var len = (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3];
      var body = p + 4;
      if (len < 0 || body + len > b.length) return null;

      if (type === 6) { // PICTURE
        var q = body;
        q += 4; // picture type
        if (q + 4 > body + len) return null;
        var mimeLen = _u32(b, q); q += 4;
        if (q + mimeLen + 4 > body + len) return null;
        var mime = _ascii(b, q, q + mimeLen); q += mimeLen;
        var descLen = _u32(b, q); q += 4;
        if (q + descLen + 20 > body + len) return null;
        q += descLen;
        q += 16; // width, height, depth, colors
        var dataLen = _u32(b, q); q += 4;
        if (q + dataLen > body + len) return null;
        return _finish(b.subarray(q, q + dataLen), mime, 'flac');
      }

      if (isLast) break;
      p = body + len;
    }
    return null;
  }

  // ---- public API --------------------------------------------------------

  return {
    /**
     * @param {ArrayBuffer|Uint8Array} input full file bytes, or a head/tail slice
     * @returns {{url:string, mime:string, kind:string}|null}
     */
    extract: function(input) {
      try {
        if (!input) return null;
        var b = (input instanceof Uint8Array) ? input : new Uint8Array(input);
        if (b.length < 32) return null;
        return _fromId3(b) || _fromMp4(b) || _fromFlac(b);
      } catch (e) {
        return null;
      }
    },

    // Exposed for the unit tests.
    _fromId3: _fromId3,
    _fromMp4: _fromMp4,
    _fromFlac: _fromFlac,
    MAX_IMAGE_BYTES: MAX_IMAGE_BYTES
  };
})();
