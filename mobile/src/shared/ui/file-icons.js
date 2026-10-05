/**
 * Which icon a file gets, by name and MIME type.
 *
 * The desktop has had this since it grew a file preview; the mobile drew every
 * attachment — a .zip, a .json, a .pdf — with one generic `file` glyph, so a
 * folder of mixed files was a column of identical squares. One mapper now, read
 * by both, so the two cannot disagree about what a .rar looks like.
 *
 * Two steps, deliberately: `kind()` gives the semantic type and `lucide()` maps
 * that to a glyph. Anything that needs to reason about a file — "is this
 * previewable", "group these by type" — should ask for the kind, not the icon.
 */
(function (root) {
  var ARCHIVE = ['zip', 'rar', 'tar', 'gz', '7z', 'bz2', 'xz'];
  var CODE = ['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'py', 'java', 'c', 'h', 'cpp', 'cc',
    'cs', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'scala', 'sh', 'bat', 'ps1', 'sql',
    'html', 'css', 'scss', 'xml', 'yaml', 'yml', 'toml', 'ini', 'json', 'env'];
  var AUDIO = ['mp3', 'wav', 'ogg', 'flac', 'aac', 'wma', 'm4a', 'opus'];
  var VIDEO = ['mp4', 'avi', 'mkv', 'mov', 'wmv', 'webm', 'flv', 'm4v'];
  var TEXT = ['txt', 'log', 'md', 'rtf'];
  var SHEET = ['xls', 'xlsx', 'csv', 'ods'];
  var WORD = ['doc', 'docx', 'odt'];
  var SLIDES = ['ppt', 'pptx', 'odp', 'key'];

  function extOf(name) {
    var s = String(name || '');
    var i = s.lastIndexOf('.');
    return i === -1 ? '' : s.slice(i + 1).toLowerCase();
  }

  function has(list, v) { return list.indexOf(v) !== -1; }

  /** The semantic kind of a file: 'archive', 'code', 'image', … or 'file'. */
  function kind(name, mimeType) {
    var mime = String(mimeType || '').toLowerCase();
    var ext = extOf(name);

    if (mime.indexOf('image/') === 0 || has(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif'], ext)) return 'image';
    if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
    if (mime.indexOf('audio/') === 0 || has(AUDIO, ext)) return 'audio';
    if (mime.indexOf('video/') === 0 || has(VIDEO, ext)) return 'video';
    if (mime.indexOf('zip') !== -1 || mime.indexOf('rar') !== -1 || mime.indexOf('tar') !== -1 ||
        mime.indexOf('gzip') !== -1 || mime.indexOf('7z') !== -1 || has(ARCHIVE, ext)) return 'archive';
    if (mime.indexOf('word') !== -1 || mime.indexOf('opendocument.text') !== -1 || has(WORD, ext)) return 'word';
    if (mime.indexOf('sheet') !== -1 || mime.indexOf('excel') !== -1 || has(SHEET, ext)) return 'sheet';
    if (mime.indexOf('presentation') !== -1 || mime.indexOf('powerpoint') !== -1 || has(SLIDES, ext)) return 'presentation';
    if (mime.indexOf('json') !== -1 || ext === 'json') return 'code';
    if (mime.indexOf('text/') === 0 || has(TEXT, ext)) return 'text';
    if (has(CODE, ext)) return 'code';
    return 'file';
  }

  var LUCIDE = {
    image: 'file-image',
    pdf: 'file-text',
    word: 'file-text',
    sheet: 'file-spreadsheet',
    presentation: 'presentation',
    archive: 'file-archive',
    code: 'file-code',
    audio: 'music',
    video: 'video',
    text: 'file-text',
    file: 'file'
  };

  /** The Lucide icon name for a kind. */
  function lucide(kindName) {
    return LUCIDE[kindName] || 'file';
  }

  /** The Lucide icon name for a file, in one call. */
  function icon(name, mimeType) {
    return lucide(kind(name, mimeType));
  }

  root.FileIcons = {
    kind: kind,
    lucide: lucide,
    icon: icon,
    ext: extOf,
    /** Every kind this knows about, for tests and pickers. */
    kinds: Object.keys(LUCIDE)
  };
})(typeof window !== 'undefined' ? window : globalThis);
