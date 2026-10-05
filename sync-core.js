/*
 * sync-core.js - the merge rules for tudo's real-time sync.
 *
 * Shared, byte for byte, by the desktop app (tudo), the Android app
 * (tudo-mobile) and the relay (tudo-web/server.js). It is plain JavaScript with
 * no dependencies so all three can load it as-is; the canonical copy is
 * tudo-mobile/src/sync/sync-core.js, and the others must be identical to it.
 *
 * THE MODEL
 *
 * A board is a set of tasks. Each task is one *record*:
 *
 *   { id, s: status, p: position, t: time, c: client, f: { ...fields } }
 *   { id, t, c, d: 1 }                                  <- a deleted task
 *
 * Two devices that have seen the same set of records show the same board, in the
 * same order, whatever order the records arrived in, and however many times each
 * arrived. That is what lets the relay stay dumb: it only keeps the newest
 * record per task and passes changes on.
 *
 *  - The newest record per task wins. "Newest" is the time `t`, ties broken by
 *    the client id, so every device picks the same one. The time is a hybrid
 *    logical clock: it never runs behind any record the device has seen, so an
 *    edit made after seeing someone else's can't lose to it because of a slow
 *    clock. Two edits made without seeing each other do resolve by wall clock.
 *  - A delete is a record too (a tombstone), so it beats older edits and can be
 *    beaten by newer ones. Tombstones are kept for good; they are tiny.
 *  - Order inside a column is each task's position `p`, sorted by (p, id). A
 *    move gives only the moved task a new `p`, halfway between its neighbours.
 *  - Per-device state (a card folded or not) is not synced at all.
 *
 * Everything here is pure: no sockets, no storage, no clock of its own.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.TudoSyncCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var STATUSES = ['todo', 'doing', 'onhold', 'done'];
  var IMPORTANCE = ['Not Set', 'Low', 'Medium', 'High'];
  // The task fields that travel. Anything else on a task stays on its device.
  var SYNCED_FIELDS = [
    'text',
    'due',
    'importance',
    'showCountdown',
    'remind',
    'remindOffset',
    'reminderFired',
    'additionalDescription',
  ];

  var LIMITS = {
    text: 200,
    description: 20000,
    remindMax: 60 * 24 * 30,
    // Per room, deleted tasks included - their tombstones are kept for good.
    maxRecords: 20000,
    // A record stamped further ahead than this is refused, so one device with a
    // wrong clock can't make its edits unbeatable.
    maxFutureMs: 7 * 24 * 60 * 60 * 1000,
  };

  var STEP = 1000;
  // Below this gap between neighbours a column is renumbered rather than split again.
  var MIN_GAP = 1e-6;

  var DEFAULT_SERVER_URL = 'wss://tudo-denn.freeddns.org/sync';

  var DUE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;
  var ID_RE = /^[A-Za-z0-9_.:-]{1,64}$/;
  var CLIENT_RE = /^[A-Za-z0-9_-]{1,64}$/;

  function isObj(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /* --------------------------------------------------------------- fields */

  // The synced fields of a task as they would be sent, or null if the task is
  // not something that can be synced (no title).
  function sanitizeFields(f) {
    if (!isObj(f)) return null;
    var text = typeof f.text === 'string' ? f.text.trim().slice(0, LIMITS.text) : '';
    if (!text) return null;

    var due = typeof f.due === 'string' && DUE_RE.test(f.due) && !isNaN(Date.parse(f.due)) ? f.due : null;
    var offset = typeof f.remindOffset === 'number' && isFinite(f.remindOffset) ? Math.round(f.remindOffset) : 0;

    return {
      text: text,
      due: due,
      importance: IMPORTANCE.indexOf(f.importance) >= 0 ? f.importance : 'Not Set',
      showCountdown: f.showCountdown !== false,
      // A reminder counts back from the due date, so without one there is none.
      remind: f.remind === true && due !== null,
      remindOffset: Math.min(Math.max(offset, 0), LIMITS.remindMax),
      reminderFired: f.reminderFired === true,
      additionalDescription:
        typeof f.additionalDescription === 'string' ? f.additionalDescription.slice(0, LIMITS.description) : '',
    };
  }

  function extractFields(task) {
    var out = {};
    for (var i = 0; i < SYNCED_FIELDS.length; i++) out[SYNCED_FIELDS[i]] = task[SYNCED_FIELDS[i]];
    return sanitizeFields(out);
  }

  function signature(status, fields) {
    var parts = [status];
    for (var i = 0; i < SYNCED_FIELDS.length; i++) parts.push(fields[SYNCED_FIELDS[i]]);
    return JSON.stringify(parts);
  }

  // Validates one record from the wire. Used by the relay on what clients send
  // and by clients on what the relay sends, so neither has to trust the other.
  function sanitizeRecord(r, now, maxFutureMs) {
    if (!isObj(r)) return null;
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
    if (typeof r.c !== 'string' || !CLIENT_RE.test(r.c)) return null;
    var limit = (now === undefined ? Date.now() : now) + (maxFutureMs === undefined ? LIMITS.maxFutureMs : maxFutureMs);
    if (typeof r.t !== 'number' || !isFinite(r.t) || Math.floor(r.t) !== r.t || r.t <= 0 || r.t > limit) return null;

    if (r.d === 1 || r.d === true) return { id: r.id, t: r.t, c: r.c, d: 1 };

    if (STATUSES.indexOf(r.s) < 0) return null;
    if (typeof r.p !== 'number' || !isFinite(r.p) || Math.abs(r.p) > 1e15) return null;
    var f = sanitizeFields(r.f);
    if (!f) return null;
    return { id: r.id, s: r.s, p: r.p, t: r.t, c: r.c, f: f };
  }

  /* ----------------------------------------------------------- precedence */

  // Does record `a` beat record `b`? Every device must give the same answer,
  // which is why ties fall to the client id and not to who looked first.
  function newer(a, b) {
    return a.t > b.t || (a.t === b.t && a.c > b.c);
  }

  // The relay's side: keep the newest record per task. True if `rec` was kept.
  function mergeInto(store, rec) {
    var cur = store.get(rec.id);
    if (cur && !newer(rec, cur)) return false;
    store.set(rec.id, rec);
    return true;
  }

  /* ------------------------------------------------------------- ordering */

  // The tasks whose positions already read in order, as many as possible, so a
  // single move rewrites a single position instead of everything after it.
  // Longest strictly increasing run of (p, id).
  function keepInOrder(items) {
    var idx = [];
    for (var i = 0; i < items.length; i++) if (items[i].p !== null) idx.push(i);

    function less(a, b) {
      return items[a].p < items[b].p || (items[a].p === items[b].p && items[a].id < items[b].id);
    }

    var tails = [];
    var prev = [];
    for (var n = 0; n < items.length; n++) prev.push(-1);

    for (var q = 0; q < idx.length; q++) {
      var cur = idx[q];
      var lo = 0;
      var hi = tails.length;
      while (lo < hi) {
        var mid = (lo + hi) >> 1;
        if (less(tails[mid], cur)) lo = mid + 1;
        else hi = mid;
      }
      if (lo > 0) prev[cur] = tails[lo - 1];
      tails[lo] = cur;
    }

    var keep = [];
    for (var m = 0; m < items.length; m++) keep.push(false);
    var k = tails.length ? tails[tails.length - 1] : -1;
    while (k !== -1) {
      keep[k] = true;
      k = prev[k];
    }
    return keep;
  }

  // New positions for the tasks that aren't kept, spaced evenly between the
  // kept neighbours either side. Null if there's no room left to split, in which
  // case the caller renumbers the whole column.
  function placeBetween(items, keep) {
    var n = items.length;
    var out = new Array(n);
    var i = 0;
    var prevP = null;

    while (i < n) {
      if (keep[i]) {
        out[i] = items[i].p;
        prevP = items[i].p;
        i += 1;
        continue;
      }

      var j = i;
      while (j < n && !keep[j]) j += 1;
      var run = j - i;
      var hiP = j < n ? items[j].p : null;

      var last = prevP;
      for (var m = 0; m < run; m++) {
        var p;
        if (prevP !== null && hiP !== null) p = prevP + ((hiP - prevP) * (m + 1)) / (run + 1);
        else if (prevP !== null) p = prevP + STEP * (m + 1);
        else if (hiP !== null) p = hiP - STEP * (run - m);
        else p = STEP * (m + 1);

        if (last !== null && !(p - last > MIN_GAP)) return null;
        out[i + m] = p;
        last = p;
      }
      if (hiP !== null && last !== null && !(hiP - last > MIN_GAP)) return null;
      i = j;
    }
    return out;
  }

  function copyMap(m) {
    var out = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) out[k] = m[k];
    return out;
  }

  /* --------------------------------------------------------- local changes */

  function emptyState(clientId) {
    return { clientId: clientId, clock: 0, meta: {}, tombstones: {} };
  }

  // Cleans whatever was saved, so a damaged or hand-edited file can't wedge sync.
  function normalizeState(raw, clientId) {
    var s = emptyState(clientId);
    if (!isObj(raw)) return s;
    if (typeof raw.clientId === 'string' && CLIENT_RE.test(raw.clientId)) s.clientId = raw.clientId;
    if (typeof raw.clock === 'number' && isFinite(raw.clock) && raw.clock > 0) s.clock = Math.floor(raw.clock);

    if (isObj(raw.meta)) {
      for (var id in raw.meta) {
        var m = raw.meta[id];
        if (!ID_RE.test(id) || !isObj(m)) continue;
        if (typeof m.t !== 'number' || typeof m.p !== 'number' || !isFinite(m.p) || typeof m.c !== 'string') continue;
        s.meta[id] = { t: m.t, c: m.c, p: m.p, sig: typeof m.sig === 'string' ? m.sig : '' };
      }
    }
    if (isObj(raw.tombstones)) {
      for (var tid in raw.tombstones) {
        var tb = raw.tombstones[tid];
        if (!ID_RE.test(tid) || !isObj(tb) || typeof tb.t !== 'number' || typeof tb.c !== 'string') continue;
        s.tombstones[tid] = { t: tb.t, c: tb.c };
      }
    }
    return s;
  }

  /*
   * Compares the board with what was last synced and turns the difference into
   * records: new and edited tasks, moved tasks, deleted tasks. Safe to call as
   * often as you like - nothing changed means no records - and it is what makes
   * remote changes harmless to apply, because the board then already matches
   * the meta and there is nothing to send back.
   */
  function reconcileLocal(state, board, now) {
    var clock = state.clock || 0;
    var clientId = state.clientId;
    var meta = {};
    var tombstones = copyMap(state.tombstones);
    var changes = [];
    var present = {};

    function stamp() {
      clock = Math.max(now, clock + 1);
      return clock;
    }

    for (var si = 0; si < STATUSES.length; si++) {
      var status = STATUSES[si];
      var list = (board && board[status]) || [];

      // Tasks that can't be synced (no usable title) are left alone.
      var items = [];
      for (var i = 0; i < list.length; i++) {
        var fields = extractFields(list[i]);
        if (!fields || typeof list[i].id !== 'string' || !ID_RE.test(list[i].id)) continue;
        var known = state.meta[list[i].id];
        items.push({ id: list[i].id, fields: fields, p: known ? known.p : null });
      }

      var positions = placeBetween(items, keepInOrder(items));
      if (!positions) {
        positions = [];
        for (var r = 0; r < items.length; r++) positions.push((r + 1) * STEP);
      }

      for (var k = 0; k < items.length; k++) {
        var it = items[k];
        present[it.id] = true;
        var prior = state.meta[it.id];
        var sig = signature(status, it.fields);
        var p = positions[k];

        if (prior && prior.sig === sig && prior.p === p) {
          meta[it.id] = prior;
          continue;
        }

        var t = stamp();
        meta[it.id] = { t: t, c: clientId, p: p, sig: sig };
        delete tombstones[it.id];
        changes.push({ id: it.id, s: status, p: p, t: t, c: clientId, f: it.fields });
      }
    }

    for (var id in state.meta) {
      if (present[id] || !Object.prototype.hasOwnProperty.call(state.meta, id)) continue;
      var dt = stamp();
      tombstones[id] = { t: dt, c: clientId };
      changes.push({ id: id, t: dt, c: clientId, d: 1 });
    }

    return {
      state: { clientId: clientId, clock: clock, meta: meta, tombstones: tombstones },
      changes: changes,
    };
  }

  /* -------------------------------------------------------- remote changes */

  function compareForSort(meta) {
    return function (a, b) {
      var ma = meta[a.id];
      var mb = meta[b.id];
      // A task with no meta has not been reconciled yet; it goes last, in order.
      if (!ma && !mb) return 0;
      if (!ma) return 1;
      if (!mb) return -1;
      if (ma.p !== mb.p) return ma.p < mb.p ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };
  }

  // Array.prototype.sort is stable in every engine in use, but the comparator
  // above returns 0 only for tasks with no meta, whose order must be kept.
  function sortColumn(list, meta) {
    return list.slice().sort(compareForSort(meta));
  }

  /*
   * Folds records from elsewhere into the board. Returns the new board (the old
   * one is not touched), the new sync state, and whether anything on the board
   * actually changed. Records that are not newer than what is held are ignored,
   * so applying the same record twice, or an old one late, does nothing.
   *
   * `reconcileLocal` must have been run first, so that local edits already have
   * records of their own and are compared fairly instead of being overwritten.
   */
  function applyRemote(state, board, records) {
    var clock = state.clock || 0;
    var meta = copyMap(state.meta);
    var tombstones = copyMap(state.tombstones);
    var changed = false;

    var next = {};
    var byId = {};
    for (var si = 0; si < STATUSES.length; si++) {
      var status = STATUSES[si];
      next[status] = ((board && board[status]) || []).slice();
      for (var i = 0; i < next[status].length; i++) byId[next[status][i].id] = status;
    }

    function removeFrom(status, id) {
      next[status] = next[status].filter(function (t) {
        return t.id !== id;
      });
    }

    for (var ri = 0; ri < records.length; ri++) {
      var rec = records[ri];
      if (rec.t > clock) clock = rec.t;

      var current = meta[rec.id] || tombstones[rec.id] || null;
      if (current && !newer(rec, current)) continue;

      if (rec.d) {
        if (byId[rec.id]) {
          removeFrom(byId[rec.id], rec.id);
          delete byId[rec.id];
          changed = true;
        }
        delete meta[rec.id];
        tombstones[rec.id] = { t: rec.t, c: rec.c };
        continue;
      }

      var existingStatus = byId[rec.id];
      var task;
      if (existingStatus) {
        var old = next[existingStatus].filter(function (t) {
          return t.id === rec.id;
        })[0];
        // Fields that live only on this device (a card being folded) are kept.
        task = {};
        for (var key in old) if (Object.prototype.hasOwnProperty.call(old, key)) task[key] = old[key];
        for (var f in rec.f) task[f] = rec.f[f];
        removeFrom(existingStatus, rec.id);
      } else {
        task = { id: rec.id, collapsed: false };
        for (var nf in rec.f) task[nf] = rec.f[nf];
      }
      next[rec.s].push(task);
      byId[rec.id] = rec.s;

      meta[rec.id] = { t: rec.t, c: rec.c, p: rec.p, sig: signature(rec.s, rec.f) };
      delete tombstones[rec.id];
      changed = true;
    }

    if (changed) {
      for (var sj = 0; sj < STATUSES.length; sj++) next[STATUSES[sj]] = sortColumn(next[STATUSES[sj]], meta);
    }

    return {
      board: changed ? next : board,
      state: { clientId: state.clientId, clock: clock, meta: meta, tombstones: tombstones },
      changed: changed,
    };
  }

  // Everything this device knows, as records - what it sends when it connects.
  function snapshotRecords(state, board) {
    var out = [];
    for (var si = 0; si < STATUSES.length; si++) {
      var status = STATUSES[si];
      var list = (board && board[status]) || [];
      for (var i = 0; i < list.length; i++) {
        var m = state.meta[list[i].id];
        var fields = extractFields(list[i]);
        if (!m || !fields) continue;
        out.push({ id: list[i].id, s: status, p: m.p, t: m.t, c: m.c, f: fields });
      }
    }
    for (var id in state.tombstones) {
      if (!Object.prototype.hasOwnProperty.call(state.tombstones, id)) continue;
      out.push({ id: id, t: state.tombstones[id].t, c: state.tombstones[id].c, d: 1 });
    }
    return out;
  }

  /* -------------------------------------------------------------- the key */

  // Exactly 32 symbols - so a random byte modulo 32 is uniform - without 0/O or
  // 1/I, which get misread. 20 of them is 100 bits.
  var KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var KEY_LENGTH = 20;

  // `randomBytes(n)` must return n cryptographically random bytes; each platform
  // supplies its own.
  function generateKey(randomBytes) {
    var bytes = randomBytes(KEY_LENGTH);
    var out = '';
    for (var i = 0; i < KEY_LENGTH; i++) out += KEY_ALPHABET.charAt(bytes[i] % KEY_ALPHABET.length);
    return out;
  }

  // What a person types or pastes -> the canonical key, or null if it isn't one.
  // Case, spaces and dashes don't matter. 0, 1, I and O are never in a key, so
  // one typed is a mistake worth reporting rather than a character to guess at.
  function normalizeKey(input) {
    if (typeof input !== 'string') return null;
    var s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (s.length !== KEY_LENGTH) return null;
    for (var i = 0; i < s.length; i++) if (KEY_ALPHABET.indexOf(s.charAt(i)) < 0) return null;
    return s;
  }

  function formatKey(key) {
    return key.replace(/(.{5})(?=.)/g, '$1-');
  }

  /* -------------------------------------------------------------- sha-256 */

  var K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  function utf8(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
        var d = str.charCodeAt(i + 1);
        if (d >= 0xdc00 && d <= 0xdfff) {
          c = 0x10000 + ((c - 0xd800) << 10) + (d - 0xdc00);
          i += 1;
        }
      }
      if (c < 0x80) bytes.push(c);
      else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return bytes;
  }

  function sha256Hex(str) {
    var bytes = utf8(str);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    // The length is a 64-bit big-endian number; JS integers are exact to 2^53.
    var hiBits = Math.floor(bitLen / 0x100000000);
    var loBits = bitLen >>> 0;
    bytes.push((hiBits >>> 24) & 255, (hiBits >>> 16) & 255, (hiBits >>> 8) & 255, hiBits & 255);
    bytes.push((loBits >>> 24) & 255, (loBits >>> 16) & 255, (loBits >>> 8) & 255, loBits & 255);

    var h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
    var w = new Array(64);

    for (var off = 0; off < bytes.length; off += 64) {
      for (var i = 0; i < 16; i++) {
        w[i] =
          ((bytes[off + i * 4] << 24) |
            (bytes[off + i * 4 + 1] << 16) |
            (bytes[off + i * 4 + 2] << 8) |
            bytes[off + i * 4 + 3]) >>>
          0;
      }
      for (var j = 16; j < 64; j++) {
        var x = w[j - 15];
        var y = w[j - 2];
        var s0 = ((x >>> 7) | (x << 25)) ^ ((x >>> 18) | (x << 14)) ^ (x >>> 3);
        var s1 = ((y >>> 17) | (y << 15)) ^ ((y >>> 19) | (y << 13)) ^ (y >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) >>> 0;
      }

      var a = h[0], b = h[1], c = h[2], d = h[3], e = h[4], f = h[5], g = h[6], hh = h[7];
      for (var r = 0; r < 64; r++) {
        var S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
        var ch = (e & f) ^ (~e & g);
        var t1 = (hh + S1 + ch + K[r] + w[r]) >>> 0;
        var S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + b) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
      h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
    }

    var hex = '';
    for (var k = 0; k < 8; k++) hex += ('00000000' + h[k].toString(16)).slice(-8);
    return hex;
  }

  // The room a key opens. Only this hash ever reaches the relay.
  function roomIdForKey(key) {
    return sha256Hex('tudo-sync-v1:' + key);
  }

  function isValidRoomId(id) {
    return typeof id === 'string' && /^[a-f0-9]{64}$/.test(id);
  }

  /* ----------------------------------------------------------- server url */

  // What a person types for the server -> a ws(s):// URL ending in a path, or
  // null. "my.host" and "https://my.host" both mean wss://my.host/sync.
  function normalizeServerUrl(input) {
    if (typeof input !== 'string') return null;
    var s = input.trim();
    if (!s) return null;
    s = s.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://');
    // A scheme that isn't one of ours is a mistake, not a hostname to prefix.
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) && !/^wss?:\/\//i.test(s)) return null;
    if (!/^wss?:\/\//i.test(s)) s = 'wss://' + s;
    var m = /^(wss?):\/\/([^/?#\s]+)(\/[^?#\s]*)?$/i.exec(s);
    if (!m) return null;
    var path = m[3] && m[3] !== '/' ? m[3].replace(/\/+$/, '') : '/sync';
    return m[1].toLowerCase() + '://' + m[2] + path;
  }

  // ws:// sends the board in the clear; fine for a machine on your own network,
  // not across the internet. Used to warn, never to refuse.
  function isInsecureUrl(url) {
    return /^ws:\/\//i.test(url);
  }

  return {
    STATUSES: STATUSES,
    SYNCED_FIELDS: SYNCED_FIELDS,
    LIMITS: LIMITS,
    DEFAULT_SERVER_URL: DEFAULT_SERVER_URL,
    sanitizeFields: sanitizeFields,
    sanitizeRecord: sanitizeRecord,
    newer: newer,
    mergeInto: mergeInto,
    emptyState: emptyState,
    normalizeState: normalizeState,
    reconcileLocal: reconcileLocal,
    applyRemote: applyRemote,
    snapshotRecords: snapshotRecords,
    generateKey: generateKey,
    normalizeKey: normalizeKey,
    formatKey: formatKey,
    sha256Hex: sha256Hex,
    roomIdForKey: roomIdForKey,
    isValidRoomId: isValidRoomId,
    normalizeServerUrl: normalizeServerUrl,
    isInsecureUrl: isInsecureUrl,
  };
});
