/**
 * Reading an Orbit backup file — `.orzip` or `.zip`.
 *
 * ⚠ THE NAME LIES. `.orzip` is NOT a zip: the desktop writes it with
 * `zlib.gzipSync`, so it is a plain **gzip** stream with a house extension. The
 * desktop's own validator decides by magic bytes (`1F 8B` = gzip, `50 4B` = zip)
 * rather than by extension, and this does the same, for the same reason — a user
 * who renames a file must not get a confusing failure.
 *
 *   .orzip  →  gzip(JSON)                     one file, no container
 *   .zip    →  a real zip holding backup.json  (plus avatars/, which this ignores)
 *
 * WHY THERE IS NO ZIP LIBRARY HERE. A zip reader needs DEFLATE, and the platform
 * already ships one: `DecompressionStream('deflate-raw')` is available in the
 * Android WebView and in Electron. So this parses the container itself — which is
 * a couple of hundred bytes of header arithmetic — and hands the compressed
 * payload to the browser to inflate. No dependency, no native plugin, no Java.
 *
 * The payload inside either container is the DESKTOP's shape
 * (`{version, data:{users, friends, messages, groups, settings}}`). Turning that
 * into something the mobile can store is `OrbitAccountTransfer.toMobileAccount()`
 * and is deliberately NOT done here — this module's only job is "bytes in, JSON
 * out", so it stays testable on its own.
 */
(function () {
  'use strict';

  var GZIP_MAGIC = [0x1F, 0x8B];
  var ZIP_MAGIC = [0x50, 0x4B];

  function startsWith(bytes, magic) {
    if (!bytes || bytes.length < magic.length) return false;
    for (var i = 0; i < magic.length; i++) if (bytes[i] !== magic[i]) return false;
    return true;
  }

  /** 'orzip' | 'zip' | null — by CONTENT, never by filename. */
  function detect(bytes) {
    if (startsWith(bytes, GZIP_MAGIC)) return 'orzip';
    if (startsWith(bytes, ZIP_MAGIC)) return 'zip';
    return null;
  }

  /** Native inflate. Returns a Uint8Array. */
  function inflate(bytes, format) {
    if (typeof DecompressionStream === 'undefined') {
      return Promise.reject(new Error('This build cannot decompress backups (no DecompressionStream)'));
    }
    var ds = new DecompressionStream(format);
    var writer = ds.writable.getWriter();
    writer.write(bytes);
    writer.close();
    return new Response(ds.readable).arrayBuffer().then(function (buf) {
      return new Uint8Array(buf);
    });
  }

  function gunzip(bytes) {
    return inflate(bytes, 'gzip');
  }

  /**
   * Find a file inside a zip and return its bytes, inflated.
   *
   * Walks the CENTRAL DIRECTORY rather than the local headers, because the local
   * header's size fields can be zeroed and the real sizes written into a data
   * descriptor after the payload — which is exactly what a streamed zip looks
   * like. The central directory always has the true values.
   */
  function readZipEntry(bytes, wantedName) {
    var dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    // End of Central Directory: scan back from the end. It is followed by an
    // optional comment, so it is not always the final 22 bytes.
    var eocd = -1;
    var floor = Math.max(0, bytes.length - 66000);
    for (var i = bytes.length - 22; i >= floor; i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) return Promise.reject(new Error('Not a zip — no central directory'));

    var count = dv.getUint16(eocd + 10, true);
    var cdOffset = dv.getUint32(eocd + 16, true);

    var p = cdOffset;
    for (var n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;      // central dir header
      var method = dv.getUint16(p + 10, true);
      var compSize = dv.getUint32(p + 20, true);
      var nameLen = dv.getUint16(p + 28, true);
      var extraLen = dv.getUint16(p + 30, true);
      var commentLen = dv.getUint16(p + 32, true);
      var localOffset = dv.getUint32(p + 42, true);

      var name = '';
      for (var c = 0; c < nameLen; c++) name += String.fromCharCode(bytes[p + 46 + c]);

      if (name === wantedName || name === './' + wantedName) {
        // The local header repeats the name and extra fields, and the data starts
        // after BOTH — the local extra length can differ from the central one.
        if (dv.getUint32(localOffset, true) !== 0x04034b50) {
          return Promise.reject(new Error('Damaged zip — bad local header'));
        }
        var lNameLen = dv.getUint16(localOffset + 26, true);
        var lExtraLen = dv.getUint16(localOffset + 28, true);
        var dataAt = localOffset + 30 + lNameLen + lExtraLen;
        var payload = bytes.subarray(dataAt, dataAt + compSize);

        if (method === 0) return Promise.resolve(new Uint8Array(payload));       // stored
        if (method === 8) return inflate(payload, 'deflate-raw');                // deflate
        return Promise.reject(new Error('Unsupported zip compression (method ' + method + ')'));
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    return Promise.reject(new Error('"' + wantedName + '" is not in this archive'));
  }

  /**
   * Bytes in, parsed backup out.
   * @returns {Promise<{kind: string, backup: object}>}
   */
  function read(bytes) {
    if (!bytes || !bytes.length) return Promise.reject(new Error('Empty file'));
    var kind = detect(bytes);
    if (!kind) {
      return Promise.reject(new Error('Not an Orbit backup — expected .orzip or .zip'));
    }

    var jsonBytes = kind === 'orzip'
      ? gunzip(bytes)
      : readZipEntry(bytes, 'backup.json');

    return jsonBytes.then(function (raw) {
      var text = new TextDecoder().decode(raw);
      var backup;
      try { backup = JSON.parse(text); }
      catch (e) { throw new Error('The backup is not readable — it may be truncated'); }
      if (!backup || !backup.data) throw new Error('The backup is missing its data');
      return { kind: kind, backup: backup };
    });
  }

  /** A one-line description for the restore list. */
  function describe(backup) {
    if (!backup || !backup.data) return 'unreadable';
    var d = backup.data;
    var users = Array.isArray(d.users) ? d.users.length : 0;
    var friends = Array.isArray(d.friends) ? d.friends.length : 0;
    var messages = Array.isArray(d.messages) ? d.messages.length : 0;
    var name = (Array.isArray(d.users) && d.users[0] && d.users[0].username) || null;
    var parts = [];
    if (name) parts.push(name);
    parts.push(messages + (messages === 1 ? ' message' : ' messages'));
    parts.push(friends + (friends === 1 ? ' contact' : ' contacts'));
    return parts.join(' \u00b7 ');
  }

  window.OrbitBackupArchive = {
    detect: detect,
    read: read,
    describe: describe,
    _readZipEntry: readZipEntry
  };
})();
