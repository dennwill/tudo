/*
 * changelog.js - reading a changelog, and deciding what a person has not seen yet.
 *
 * Plain JavaScript with no dependencies, so the app loads it with a <script> tag
 * and a test can `require` it. The desktop app and tudo-web use this same file,
 * byte for byte; tudo-mobile has the same logic in TypeScript (src/changelog.ts).
 *
 * The changelog is CHANGELOG.md, one heading per release, newest first:
 *
 *   ## 1.7.1 - 2026-10-29
 *
 *   - What changed, in a sentence a person would say.
 *   - Another change.
 *
 * A heading that is not a version ("## Unreleased") is skipped, and so are the
 * notes under it: they are not out yet.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  else root.TudoChangelog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // "## 1.7.1 - 2026-10-29", or just "## 1.7.1".
  var VERSION_HEADING = /^##\s+v?(\d+(?:\.\d+)*)(?:\s+-\s+(\S+))?\s*$/;
  var VERSION = /^\d+(?:\.\d+)*$/;

  // The releases in the markdown, in the order written (newest first), each with
  // its version, its date (or '') and its notes.
  function parse(markdown) {
    var entries = [];
    var current = null;
    var lines = String(markdown || '').split(/\r?\n/);

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];

      var heading = VERSION_HEADING.exec(line);
      if (heading) {
        current = { version: heading[1], date: heading[2] || '', notes: [] };
        entries.push(current);
        continue;
      }
      // Some other section ("Unreleased"): its notes belong to no release.
      if (/^#{1,6}\s/.test(line)) {
        current = null;
        continue;
      }
      if (!current) continue;

      var bullet = /^[-*]\s+(.*\S)\s*$/.exec(line);
      if (bullet) current.notes.push(bullet[1]);
      // A bullet wrapped onto the next line carries on from the one above.
      else if (/^\s+\S/.test(line) && current.notes.length) current.notes[current.notes.length - 1] += ' ' + line.trim();
    }

    return entries.filter(function (entry) {
      return entry.notes.length > 0;
    });
  }

  // -1, 0 or 1. Numbers, not text: 1.10.0 is after 1.9.0.
  function compareVersions(a, b) {
    var x = String(a).split('.');
    var y = String(b).split('.');
    var length = Math.max(x.length, y.length);
    for (var i = 0; i < length; i++) {
      var p = parseInt(x[i] || '0', 10);
      var q = parseInt(y[i] || '0', 10);
      if (p !== q) return p < q ? -1 : 1;
    }
    return 0;
  }

  /*
   * What to show now. `seen` is the version recorded the last time the app ran
   * (or null), `current` the version running, `hadData` whether the app already
   * had saved tasks when it started.
   *
   * Returns the releases to show, newest first, and the version to record. The
   * caller records it straight away, whether or not anything is shown, so a
   * window that was closed without being read still counts as seen: it appears
   * once.
   *
   *  - Same version as last time: nothing.
   *  - No record, and no saved tasks: a fresh install. Nothing has changed for
   *    this person, so nothing is shown.
   *  - No record, but there are saved tasks: someone updating from a version that
   *    did not keep a record. They get the notes for the version they are on, if
   *    the changelog has an entry for it.
   *  - A record: every release after it, up to the one running, so skipping a
   *    version does not skip its notes.
   *  - A record that is newer than the app (a downgrade): nothing.
   */
  function decide(options) {
    var entries = options.entries || [];
    var current = options.current;
    var seen = options.seen && VERSION.test(options.seen) ? options.seen : null;

    if (!current || !VERSION.test(current)) return { show: [], record: seen };
    if (seen && compareVersions(seen, current) >= 0) return { show: [], record: current };
    if (!seen && !options.hadData) return { show: [], record: current };

    var upToNow = entries.filter(function (entry) {
      return compareVersions(entry.version, current) <= 0;
    });
    var fresh = seen
      ? upToNow.filter(function (entry) {
          return compareVersions(entry.version, seen) > 0;
        })
      : // Only the release being run: an older one's notes would be passed off as new.
        upToNow.filter(function (entry) {
          return compareVersions(entry.version, current) === 0;
        });

    return { show: fresh, record: current };
  }

  return {
    parse: parse,
    compareVersions: compareVersions,
    decide: decide,
  };
});
