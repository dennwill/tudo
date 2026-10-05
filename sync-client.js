/*
 * sync-client.js - the live connection to the relay.
 *
 * Shared, byte for byte, by the desktop app (tudo) and the Android app
 * (tudo-mobile); the canonical copy is tudo-mobile/src/sync/sync-client.js. It
 * keeps one WebSocket open, sends changes the moment they are made, applies
 * changes that arrive, and puts the connection back when it drops. All the
 * deciding about *what* to send and how to merge is sync-core.js; this file is
 * only the plumbing, and takes everything platform-specific as an option:
 *
 *   WebSocketImpl   the WebSocket constructor (browser, React Native or `ws`)
 *   getBoard()      the current board, synchronously, including unsaved edits
 *   applyBoard(b)   put a merged board on screen and save it
 *   loadState()     -> Promise of the saved sync state (or null)
 *   saveState(s)    -> Promise; called whenever it changes
 *   onStatus(s)     told whenever the connection state changes
 *
 * The protocol is deliberately small:
 *
 *   client -> relay   hello    { room, client, records }  everything this device has
 *   relay  -> client  snapshot { records, devices }       everything the room has
 *   either way        push     { records }                what just changed
 *   client -> relay   ping     relay -> client  pong
 *
 * Because every connection starts by exchanging full state, nothing is lost by a
 * dropped connection, a missed message, a relay restart or a long time offline:
 * the next hello puts both sides right. That is why there are no acknowledgements
 * and no outbox.
 */
(function (root, factory) {
  if (typeof module === 'object' && module && module.exports) module.exports = factory(require('./sync-core'));
  else root.TudoSyncClient = factory(root.TudoSyncCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (core) {
  'use strict';

  var OPEN = 1;
  var PROTOCOL = 1;

  var FLUSH_DELAY_MS = 120;
  var BACKOFF_START_MS = 1000;
  var BACKOFF_MAX_MS = 30000;
  var PING_EVERY_MS = 25000;
  var PONG_WITHIN_MS = 12000;
  var NUDGE_PONG_WITHIN_MS = 5000;
  // The relay accepts 2 MiB; stay well inside it.
  var MAX_MESSAGE_CHARS = 1800000;

  // Close codes the relay uses. A fatal one is our mistake - retrying the same
  // thing can't help - so it stops the retrying and says so.
  // How long refresh() waits for the relay before giving up.
  var REFRESH_TIMEOUT_MS = 8000;

  var CLOSE_BAD_REQUEST = 4400;
  var CLOSE_TOO_LARGE = 4413;
  var CLOSE_RATE_LIMITED = 4429;
  var CLOSE_AT_CAPACITY = 4503;

  function SyncClient(options) {
    this.o = options;
    this.now = options.now || Date.now;
    var timers = options.timers || {};
    this.setTimeout = timers.setTimeout || function (fn, ms) { return setTimeout(fn, ms); };
    this.clearTimeout = timers.clearTimeout || function (id) { clearTimeout(id); };
    this.random = options.random || Math.random;

    this.cfg = { enabled: false, url: null, key: null, room: null };
    this.sync = null;
    this.ws = null;
    this.connId = 0;
    this.configId = 0;
    this.joined = false;
    this.helloSent = false;
    this.unsent = [];
    this.fatal = false;
    this.lastError = '';
    this.backoff = BACKOFF_START_MS;
    this.minRetryMs = 0;

    this.flushTimer = null;
    this.reconnectTimer = null;
    this.pingTimer = null;
    this.pongTimer = null;
    this.saveChain = Promise.resolve();
    // Callers of refresh() waiting to hear how it went.
    this.waiters = [];

    this.status = { state: 'off', devices: 0, lastSyncAt: null, message: '' };
  }

  var proto = SyncClient.prototype;

  proto.getStatus = function () {
    return { state: this.status.state, devices: this.status.devices, lastSyncAt: this.status.lastSyncAt, message: this.status.message };
  };

  proto._setStatus = function (state, message, devices) {
    var next = {
      state: state,
      devices: devices === undefined ? (state === 'connected' ? this.status.devices : 0) : devices,
      lastSyncAt: this.status.lastSyncAt,
      message: message || '',
    };
    this.status = next;
    if (this.o.onStatus) this.o.onStatus(this.getStatus());
  };

  /* ------------------------------------------------------------ configure */

  // Start, stop or re-aim sync. Safe to call again with the same settings.
  proto.configure = function (cfg) {
    var self = this;
    var token = ++this.configId;

    var key = core.normalizeKey(cfg && cfg.key);
    var url = core.normalizeServerUrl(cfg && cfg.url);
    var enabled = !!(cfg && cfg.enabled) && !!key && !!url;

    return this._ensureState().then(function () {
      if (token !== self.configId) return; // a newer configure() has taken over

      self._teardown();
      self.fatal = false;
      self.lastError = '';
      self.backoff = BACKOFF_START_MS;
      self.minRetryMs = 0;
      self.cfg = { enabled: enabled, url: url, key: key, room: key ? core.roomIdForKey(key) : null };

      if (!enabled) {
        self._setStatus('off', '');
        return;
      }
      // Anything changed while sync was off becomes records now.
      self._flush();
      self._connect();
    });
  };

  proto._ensureState = function () {
    var self = this;
    if (this.sync) return Promise.resolve();
    return Promise.resolve(this.o.loadState())
      .catch(function () { return null; })
      .then(function (raw) {
        if (!self.sync) self.sync = core.normalizeState(raw, self.o.newClientId());
      });
  };

  proto._save = function () {
    var self = this;
    var snapshot = this.sync;
    this.saveChain = this.saveChain
      .then(function () { return self.o.saveState(snapshot); })
      .catch(function () { /* the next change saves again */ });
  };

  /* --------------------------------------------------------- local changes */

  // Call after every change to the board, from any source. Cheap to over-call.
  //
  // Changes are noted with the time they were made even while sync is switched
  // off (as long as there is a key), and simply not sent. Otherwise an edit made
  // during a pause would be stamped when sync came back on, and would then beat
  // newer edits that other devices made in the meantime.
  proto.localChanged = function () {
    if (!this.cfg.key || this.flushTimer) return;
    var self = this;
    this.flushTimer = this.setTimeout(function () {
      self.flushTimer = null;
      self._flush();
    }, FLUSH_DELAY_MS);
  };

  proto._flush = function () {
    if (!this.sync || !this.cfg.key) return;
    var res = core.reconcileLocal(this.sync, this.o.getBoard(), this.now());
    this.sync = res.state;
    if (!res.changes.length) return;
    this._save();

    if (!this._isOpen() || !this.helloSent) return; // the next hello carries it
    if (this.joined) this._send({ type: 'push', records: res.changes });
    else this.unsent = this.unsent.concat(res.changes); // sent once the snapshot lands
  };

  /* ------------------------------------------------------------ connection */

  proto._isOpen = function () {
    return !!this.ws && this.ws.readyState === OPEN;
  };

  proto._send = function (message) {
    if (!this._isOpen()) return false;
    var text = JSON.stringify(message);
    if (text.length > MAX_MESSAGE_CHARS) {
      this._fail('This board is too large to sync.');
      return false;
    }
    try {
      this.ws.send(text);
      return true;
    } catch (err) {
      return false;
    }
  };

  proto._connect = function () {
    var self = this;
    var id = ++this.connId;
    this._setStatus('connecting', '');

    var ws;
    try {
      ws = new this.o.WebSocketImpl(this.cfg.url);
    } catch (err) {
      this._scheduleReconnect("Can't open " + this.cfg.url);
      return;
    }
    this.ws = ws;
    this.joined = false;
    this.helloSent = false;
    this.unsent = [];

    ws.onopen = function () {
      if (id !== self.connId) return;
      self._flush();
      var ok = self._send({
        type: 'hello',
        v: PROTOCOL,
        room: self.cfg.room,
        client: self.sync.clientId,
        records: core.snapshotRecords(self.sync, self.o.getBoard()),
      });
      if (!ok) return;
      self.helloSent = true;
      self._armPing(PING_EVERY_MS, PONG_WITHIN_MS);
    };
    ws.onmessage = function (event) {
      if (id !== self.connId) return;
      self._onMessage(typeof event.data === 'string' ? event.data : String(event.data));
    };
    ws.onerror = function () { /* onclose follows, and says what to do */ };
    ws.onclose = function (event) {
      if (id !== self.connId) return;
      self._onClosed(event && event.code);
    };
  };

  // Tear down the socket without scheduling anything.
  proto._teardown = function () {
    this.connId += 1; // events from the old socket are now ignored
    this._clearTimers();
    var ws = this.ws;
    this.ws = null;
    this.joined = false;
    this.helloSent = false;
    this.unsent = [];
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
      try { ws.close(); } catch (err) { /* already gone */ }
    }
  };

  proto._clearTimers = function () {
    if (this.flushTimer) this.clearTimeout(this.flushTimer);
    if (this.reconnectTimer) this.clearTimeout(this.reconnectTimer);
    if (this.pingTimer) this.clearTimeout(this.pingTimer);
    if (this.pongTimer) this.clearTimeout(this.pongTimer);
    this.flushTimer = this.reconnectTimer = this.pingTimer = this.pongTimer = null;
  };

  // Stop for good until configure() or nudge() - for a mistake retrying can't fix.
  proto._fail = function (message) {
    this.fatal = true;
    this.lastError = message;
    this._teardown();
    this._setStatus('error', message);
    this._settle('error');
  };

  proto._onClosed = function (code) {
    this._clearTimers();
    this.ws = null;
    this.joined = false;
    this.helloSent = false;
    if (!this.cfg.enabled || this.fatal) return;

    if (code === CLOSE_BAD_REQUEST) return this._fail(this.lastError || 'The server refused this sync request.');
    if (code === CLOSE_TOO_LARGE) return this._fail(this.lastError || 'This board is too large to sync.');
    if (code === CLOSE_RATE_LIMITED) this.minRetryMs = 30000;
    if (code === CLOSE_AT_CAPACITY) this.minRetryMs = 60000;

    this._scheduleReconnect(this.lastError || (code === CLOSE_AT_CAPACITY ? 'The server is full' : 'Not connected'));
  };

  proto._scheduleReconnect = function (message) {
    var self = this;
    this._setStatus('offline', message);
    this._settle('offline');
    var base = Math.max(this.backoff, this.minRetryMs);
    var delay = Math.round(base * (0.8 + this.random() * 0.4));
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    if (this.reconnectTimer) this.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = this.setTimeout(function () {
      self.reconnectTimer = null;
      if (self.cfg.enabled && !self.fatal) self._connect();
    }, delay);
  };

  // The app came back to the foreground, or the network did. If we are not
  // connected, try now rather than at the end of a long backoff; if we think we
  // are, check, because a phone's connection can die without saying so.
  proto.nudge = function () {
    if (!this.cfg.enabled) return;
    if (this.fatal) {
      this.fatal = false;
      this.lastError = '';
    }
    if (this._isOpen()) {
      if (this.joined) this._armPing(0, NUDGE_PONG_WITHIN_MS);
      return;
    }
    if (this.ws) return; // already connecting
    if (this.reconnectTimer) this.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.backoff = BACKOFF_START_MS;
    this.minRetryMs = 0;
    this._connect();
  };

  // Resolves once everything handed to saveState so far has been written. For
  // code that runs the client briefly and must not exit with a save in flight.
  proto.saved = function () {
    return this.saveChain;
  };

  // Hands every waiting refresh() its answer.
  proto._settle = function (result) {
    var waiting = this.waiters;
    this.waiters = [];
    for (var i = 0; i < waiting.length; i++) waiting[i](result);
  };

  /*
   * "Refresh": put this device in step with the relay *now*. Drops the
   * connection and makes a new one, which opens with the full exchange, so it
   * works whatever state the old one was in - including a half-dead one that
   * still claims to be open. Resolves with how it went:
   *
   *   'synced'   the relay's state is in
   *   'offline'  couldn't reach it in time (retries carry on in the background)
   *   'error'    the relay refused, and retrying can't help
   *   'off'      sync is not switched on
   */
  proto.refresh = function () {
    var self = this;
    if (!this.cfg.enabled) return Promise.resolve('off');

    this.fatal = false;
    this.lastError = '';
    this.backoff = BACKOFF_START_MS;
    this.minRetryMs = 0;
    // Anything not sent yet is noted before the old connection goes.
    this._flush();
    this._teardown();

    var answer = new Promise(function (resolve) {
      var timer = self.setTimeout(function () {
        var index = self.waiters.indexOf(finish);
        if (index >= 0) self.waiters.splice(index, 1);
        resolve('offline');
      }, REFRESH_TIMEOUT_MS);
      function finish(result) {
        self.clearTimeout(timer);
        resolve(result);
      }
      self.waiters.push(finish);
    });

    this._connect();
    return answer;
  };

  proto.dispose = function () {
    this.configId += 1;
    this._teardown();
    this._settle('off');
    this.cfg = { enabled: false, url: null, key: null, room: null };
  };

  // Send a ping after `wait` ms, and give the connection `within` ms to answer.
  proto._armPing = function (wait, within) {
    var self = this;
    if (this.pingTimer) this.clearTimeout(this.pingTimer);
    if (this.pongTimer) this.clearTimeout(this.pongTimer);
    this.pongTimer = null;
    this.pingTimer = this.setTimeout(function () {
      self.pingTimer = null;
      if (!self._isOpen()) return;
      self._send({ type: 'ping' });
      self.pongTimer = self.setTimeout(function () {
        self.pongTimer = null;
        // Nothing came back: the connection is dead even though it says it is open.
        var ws = self.ws;
        self._onClosed(undefined);
        self.connId += 1;
        if (ws) {
          ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null;
          try { ws.close(); } catch (err) { /* already gone */ }
        }
      }, within);
    }, wait);
  };

  /* -------------------------------------------------------------- incoming */

  proto._onMessage = function (raw) {
    var msg;
    try {
      msg = JSON.parse(raw);
    } catch (err) {
      return;
    }
    if (!msg || typeof msg !== 'object') return;

    switch (msg.type) {
      case 'snapshot':
        this._receive(msg.records);
        this.joined = true;
        this.backoff = BACKOFF_START_MS;
        this.minRetryMs = 0;
        this.lastError = '';
        this.status.lastSyncAt = this.now();
        this._setStatus('connected', '', typeof msg.devices === 'number' ? msg.devices : 1);
        this._settle('synced');
        if (this.unsent.length) {
          this._send({ type: 'push', records: this.unsent });
          this.unsent = [];
        }
        this._armPing(PING_EVERY_MS, PONG_WITHIN_MS);
        break;
      case 'push':
        this._receive(msg.records);
        this.status.lastSyncAt = this.now();
        break;
      case 'presence':
        if (typeof msg.devices === 'number' && this.status.state === 'connected') {
          this._setStatus('connected', '', msg.devices);
        }
        break;
      case 'pong':
        if (this.pongTimer) {
          this.clearTimeout(this.pongTimer);
          this.pongTimer = null;
          this._armPing(PING_EVERY_MS, PONG_WITHIN_MS);
        }
        break;
      case 'error':
        this.lastError = typeof msg.message === 'string' ? msg.message.slice(0, 200) : 'The server reported an error.';
        break;
      default:
        break;
    }
  };

  proto._receive = function (list) {
    if (!Array.isArray(list)) return;
    var now = this.now();
    var records = [];
    var limit = core.LIMITS.maxRecords * 2;
    for (var i = 0; i < list.length && i < limit; i++) {
      var clean = core.sanitizeRecord(list[i], now);
      if (clean) records.push(clean);
    }
    if (!records.length) return;

    // Local edits get records of their own first, so they are weighed fairly
    // against what arrived instead of being overwritten by it.
    this._flush();
    var res = core.applyRemote(this.sync, this.o.getBoard(), records);
    this.sync = res.state;
    this._save();
    if (res.changed) this.o.applyBoard(res.board);
  };

  return { SyncClient: SyncClient };
});
