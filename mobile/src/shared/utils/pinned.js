// shared/utils/pinned.js
//
// The rules for pinned messages, in one place, because both platforms need the same
// ones and neither had them:
//
//   * a limit per chat type — 3 in a direct message, 5 in a group
//   * a deleted message must leave the pinned list immediately, not linger as a stub
//   * the order is the user's to change, and changing it is an event other people in the
//     group are told about
//
// Pure functions only: no store, no DOM, no network. The platforms keep their own
// storage shape and call these to decide what is allowed. That also makes the whole set
// testable, which is the point — the rules are where a pinned feature goes wrong.
//
// Shared by both platforms: edit this file, then run `npm run shared:sync` in mobile/.
(function () {
  'use strict';

  var MAX_DM = 3;
  var MAX_GROUP = 5;

  function limitFor(isGroup) {
    return isGroup ? MAX_GROUP : MAX_DM;
  }

  // Entries are { msgId, pinnedAt?, pinnedBy? }. Anything else is dropped rather than
  // trusted: this list is persisted and can come back from an older build.
  function normalise(list) {
    if (!Array.isArray(list)) return [];
    var seen = {};
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i];
      if (!p || typeof p !== 'object') continue;
      var id = p.msgId == null ? '' : String(p.msgId);
      if (!id || seen[id]) continue;
      seen[id] = true;
      // Keep the entry's own fields and normalise only the ones this module owns.
      // Rebuilding the object from scratch dropped everything else — including the text
      // the UI shows — which is why every pinned row rendered as "(attachment)". The
      // unit tests missed it because they only ever checked msgId.
      out.push(Object.assign({}, p, {
        msgId: id,
        pinnedAt: typeof p.pinnedAt === 'number' ? p.pinnedAt : 0,
        pinnedBy: p.pinnedBy == null ? '' : String(p.pinnedBy)
      }));
    }
    return out;
  }

  // Drop anything whose message is gone. `hasMessage` is a predicate so the caller can
  // answer from whatever store it has — a map, a DB, a set of ids.
  //
  // This is what makes a deleted message disappear from the pinned list at the moment it
  // is deleted, rather than leaving a row that scrolls to nothing.
  function prune(list, hasMessage) {
    var clean = normalise(list);
    if (typeof hasMessage !== 'function') return clean;
    var out = [];
    for (var i = 0; i < clean.length; i++) {
      if (hasMessage(clean[i].msgId)) out.push(clean[i]);
    }
    return out;
  }

  function isPinned(list, msgId) {
    var id = String(msgId);
    return normalise(list).some(function (p) { return p.msgId === id; });
  }

  // Can one more be pinned? Returns a reason when not, so the UI can say why instead of
  // silently refusing — a full list is a rule, not a failure.
  function canPin(list, isGroup) {
    var clean = normalise(list);
    var limit = limitFor(isGroup);
    if (clean.length < limit) return { ok: true };
    return { ok: false, limit: limit, reason: 'limit', message: 'You can pin up to ' + limit + ' messages here. Unpin one first.' };
  }

  // Add, enforcing the limit. Returns a new list; the caller decides whether to persist.
  function add(list, entry, isGroup) {
    var clean = normalise(list);
    var id = entry && entry.msgId != null ? String(entry.msgId) : '';
    if (!id) return { ok: false, reason: 'bad-id', list: clean };
    if (isPinned(clean, id)) return { ok: true, list: clean, unchanged: true };
    var allowed = canPin(clean, isGroup);
    if (!allowed.ok) return { ok: false, reason: 'limit', message: allowed.message, list: clean };
    // Keep the entry's own fields and normalise only the ones this module owns. Rebuilding
    // it from scratch dropped `text` — the same mistake normalise() made, in the function
    // next door, and it made every pin render as "(attachment)" on mobile.
    clean.push(Object.assign({}, entry, {
      msgId: id,
      pinnedAt: typeof entry.pinnedAt === 'number' ? entry.pinnedAt : Date.now(),
      pinnedBy: entry.pinnedBy == null ? '' : String(entry.pinnedBy)
    }));
    return { ok: true, list: clean };
  }

  function remove(list, msgId) {
    var id = String(msgId);
    return normalise(list).filter(function (p) { return p.msgId !== id; });
  }

  // Move one entry to another position. Out-of-range indices are clamped rather than
  // throwing: a reorder that arrives from a drag gesture can be off by one.
  function reorder(list, fromIndex, toIndex) {
    var clean = normalise(list);
    if (clean.length < 2) return { ok: false, reason: 'nothing-to-reorder', list: clean };
    var from = Math.max(0, Math.min(clean.length - 1, Number(fromIndex)));
    var to = Math.max(0, Math.min(clean.length - 1, Number(toIndex)));
    if (!isFinite(from) || !isFinite(to)) return { ok: false, reason: 'bad-index', list: clean };
    if (from === to) return { ok: false, reason: 'same-position', list: clean };
    var moved = clean.splice(from, 1)[0];
    clean.splice(to, 0, moved);
    return { ok: true, list: clean, moved: moved.msgId };
  }

  // Did anything actually change? Used to decide whether the reorder is worth announcing:
  // dragging a row and dropping it where it started is not news.
  function orderChanged(before, after) {
    var a = normalise(before).map(function (p) { return p.msgId; });
    var b = normalise(after).map(function (p) { return p.msgId; });
    if (a.length !== b.length) return true;
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return true;
    return false;
  }

  // What a pinned message should be called in a list.
  //
  // A file-only message has no text, and the old fallback was the literal "(attachment)" —
  // so pinning a photo or a document produced a pin labelled "(attachment)", which says
  // nothing about which one it is. Both platforms had that fallback, written twice.
  //
  // The ladder, in the vocabulary the apps already use for attachments:
  //   caption -> file name -> "Photo" / "Video" / "Voice message" / "File" -> "(attachment)"
  function labelFor(msg) {
    if (!msg) return '(attachment)';
    var text = String(msg.text == null ? '' : msg.text).trim();
    if (text) return text;
    var att = (msg.attachments && msg.attachments[0]) || msg.attachment || null;
    if (!att) return '(attachment)';
    var kind = att.type || '';
    if (!kind && att.mimeType) {
      if (/^image\//.test(att.mimeType)) kind = 'image';
      else if (/^video\//.test(att.mimeType)) kind = 'video';
      else if (/^audio\//.test(att.mimeType)) kind = 'audio';
    }
    var name = String(att.name || att.fileName || '').trim();
    if (name) return name;
    if (kind === 'image') return 'Photo';
    if (kind === 'video') return 'Video';
    if (kind === 'audio') return 'Voice message';
    return 'File';
  }

  // The note other people see. Dan's wording, tidied: it is a system line in the chat, so
  // it should read as a sentence about a person, and name them.
  function orderChangedText(username) {
    var who = String(username == null ? '' : username).trim() || 'Someone';
    return who + ' has changed the pinned message order.';
  }

  window.OrbitPinned = {
    MAX_DM: MAX_DM,
    MAX_GROUP: MAX_GROUP,
    limitFor: limitFor,
    normalise: normalise,
    prune: prune,
    isPinned: isPinned,
    canPin: canPin,
    add: add,
    remove: remove,
    reorder: reorder,
    orderChanged: orderChanged,
    orderChangedText: orderChangedText,
    labelFor: labelFor
  };
})();
