/**
 * Single WebSocket connection owner.
 *
 * States: idle → connecting → authenticating → ready
 *         any live path → reconnecting (visible) | paused (background, no storm)
 *
 * Guarantees:
 * - At most one socket; open() is idempotent while connecting/authenticating/ready.
 * - Background: cancel reconnect timers only; never tear down a healthy socket.
 * - Foreground: if ready+open → notify visible; else open() once.
 * - App-level ping every PING_MS; if no RX for STALE_MS while ready → force close → reconnect.
 */
(function (global) {
  const PING_MS = 20000;
  const STALE_MS = 45000;

  function createConn(opts) {
    const {
      isPages,
      getBase,
      getToken,
      onStatus,
      onTitle,
      onAuth,
      onMessage,
      onDisconnected,
      onRejected,
      onNeedBoot,
      isHidden,
    } = opts;

    let state = 'idle'; // idle|connecting|authenticating|ready|reconnecting|paused
    let socket = null;
    let sockId = 0;       // identifies current socket handlers
    let epoch = 0;        // bumps on pause/resume to cancel pending reconnect sleeps
    let failures = 0;
    let connectTimer = null;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let lastRx = 0;
    let bootStarted = false; // ignore Android spurious visibility before first connect

    function connectTimeoutMs() {
      return isPages() ? 12000 : 8000;
    }
    function reconnectDelayMs() {
      if (isPages()) return Math.min(8000, 800 * Math.max(failures, 1));
      return Math.min(2500, 300 * Math.max(failures, 1));
    }
    function maxFailures() {
      return isPages() ? 3 : 12;
    }

    function isOpen() {
      return Boolean(socket && socket.readyState === 1);
    }
    function isAuthed() {
      return state === 'ready' && isOpen();
    }
    function inFlight() {
      return (state === 'connecting' || state === 'authenticating') &&
        socket && (socket.readyState === 0 || socket.readyState === 1);
    }

    function clearConnectTimer() {
      if (connectTimer) { clearTimeout(connectTimer); connectTimer = null; }
    }
    function clearReconnectTimer() {
      if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
    }
    function clearHeartbeat() {
      if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    }

    function detachSocket(s) {
      if (!s) return;
      try {
        s.onopen = s.onclose = s.onerror = s.onmessage = null;
      } catch {}
    }

    function killSocket(reason) {
      const s = socket;
      socket = null;
      if (!s) return;
      detachSocket(s);
      try {
        if (s.readyState === 0 || s.readyState === 1) s.close(1000, reason || 'replaced');
      } catch {}
    }

    function setDotOk(ok) {
      const dot = document.getElementById('dot');
      if (dot) dot.className = ok ? 'ok' : '';
    }

    function startHeartbeat() {
      clearHeartbeat();
      lastRx = Date.now();
      heartbeatTimer = setInterval(() => {
        if (state !== 'ready' || !isOpen()) return;
        if (Date.now() - lastRx > STALE_MS) {
          try { socket.close(4000, 'stale'); } catch {}
          return;
        }
        try { socket.send(JSON.stringify({ t: 'ping' })); } catch {}
      }, PING_MS);
    }

    function scheduleReconnect(rejected) {
      clearReconnectTimer();
      clearHeartbeat();
      setDotOk(false);

      if (isHidden()) {
        state = 'paused';
        onStatus('未连接', false);
        onTitle('未连接');
        return;
      }
      if (rejected) {
        state = 'idle';
        onRejected();
        return;
      }

      failures += 1;
      state = 'reconnecting';
      onStatus('断开，重连中…', false);
      onTitle('断开，重连中…');

      const mySock = sockId;
      const myEpoch = epoch;
      const delay = reconnectDelayMs();
      reconnectTimer = setTimeout(() => {
        if (mySock !== sockId || myEpoch !== epoch) return;
        if (isHidden()) {
          state = 'paused';
          return;
        }
        if (failures >= maxFailures()) {
          failures = 0;
          if (isPages()) {
            onNeedBoot();
            return;
          }
        }
        open();
      }, delay);
    }

    function open() {
      bootStarted = true;
      const base = getBase();
      const token = getToken();
      if (!base || !token) return;

      // Idempotent: never open a second socket while one is live or handshaking.
      if (isAuthed()) return;
      if (inFlight()) return;

      clearReconnectTimer();
      clearConnectTimer();
      clearHeartbeat();
      killSocket('replaced');

      const id = ++sockId;
      let rejected = false;
      state = 'connecting';
      onStatus('连接中…', true);
      onTitle('连接中…');
      setDotOk(false);

      let s;
      try {
        s = new WebSocket(base.replace(/^http/, 'ws') + '/ws');
      } catch {
        state = 'idle';
        scheduleReconnect(false);
        return;
      }
      socket = s;

      connectTimer = setTimeout(() => {
        if (id !== sockId || state === 'ready') return;
        onStatus('连接超时，重试中…', false);
        onTitle('连接超时');
        try { s.close(4002, 'connect timeout'); } catch {}
      }, connectTimeoutMs());

      s.onopen = () => {
        if (id !== sockId) return;
        state = 'authenticating';
        try { s.send(JSON.stringify({ t: 'auth', token })); } catch {}
      };

      s.onerror = () => {
        if (id === sockId && state !== 'ready') {
          onStatus('连接失败，重试中…', false);
        }
      };

      s.onclose = () => {
        if (id !== sockId) return;
        clearConnectTimer();
        clearHeartbeat();
        if (socket === s) socket = null;
        detachSocket(s);
        onDisconnected();
        // Intentionally paused: do not reconnect until resume().
        if (state === 'paused') return;
        state = 'idle';
        scheduleReconnect(rejected);
      };

      s.onmessage = (ev) => {
        if (id !== sockId) return;
        lastRx = Date.now();
        let m;
        try { m = JSON.parse(ev.data); } catch { return; }

        if (m.t === 'pong') return;

        if (m.t === 'auth') {
          clearConnectTimer();
          if (!m.ok) {
            rejected = true;
            return;
          }
          failures = 0;
          state = 'ready';
          setDotOk(true);
          onStatus('已连接', true);
          onTitle('已连接');
          startHeartbeat();
          onAuth();
          return;
        }

        if (state !== 'ready') return;
        onMessage(m);
      };
    }

    /** Background: cancel reconnect storms; keep healthy socket. */
    function pause() {
      if (!bootStarted) return;
      epoch += 1;
      clearReconnectTimer();
      if (isAuthed()) {
        try { socket.send(JSON.stringify({ t: 'visible', v: false })); } catch {}
      }
      // If we were mid-reconnect, stay paused until resume.
      if (state === 'reconnecting' || state === 'idle') state = 'paused';
    }

    /** Foreground: nudge visible or open once. */
    function resume() {
      if (!bootStarted) return;
      failures = 0;
      epoch += 1;
      clearReconnectTimer();

      if (isAuthed()) {
        state = 'ready';
        try { socket.send(JSON.stringify({ t: 'visible', v: true })); } catch {}
        onStatus('已连接', true);
        return;
      }
      if (inFlight()) return;
      open();
    }

    function send(obj) {
      if (!isAuthed()) return false;
      try {
        socket.send(JSON.stringify(obj));
        return true;
      } catch {
        return false;
      }
    }

    /** User tapped reconnect / logout: drop socket; reconnect path runs unless reset. */
    function drop(reason) {
      epoch += 1;
      clearReconnectTimer();
      clearConnectTimer();
      clearHeartbeat();
      const wasReady = state === 'ready' || state === 'authenticating' || state === 'connecting';
      killSocket(reason || 'drop');
      state = 'idle';
      onDisconnected();
      // onclose may not fire if already closed; ensure reconnect if we had a session intent
      if (wasReady && getToken() && getBase() && !isHidden()) {
        scheduleReconnect(false);
      }
    }

    /** Logout / unpaired: stop everything. */
    function reset() {
      bootStarted = false;
      epoch += 1;
      sockId += 1;
      failures = 0;
      clearReconnectTimer();
      clearConnectTimer();
      clearHeartbeat();
      killSocket('reset');
      state = 'idle';
      setDotOk(false);
      onDisconnected();
    }

    function forceOpen() {
      failures = 0;
      epoch += 1;
      clearReconnectTimer();
      // Break idempotent guard so title-tap / menu reconnect always gets a fresh socket.
      if (socket) {
        sockId += 1;
        killSocket('force');
      }
      state = 'idle';
      open();
    }

    return {
      open,
      pause,
      resume,
      send,
      drop,
      reset,
      forceOpen,
      get isAuthed() { return isAuthed(); },
      get bootStarted() { return bootStarted; },
      get state() { return state; },
    };
  }

  global.createConn = createConn;
})(typeof window !== 'undefined' ? window : globalThis);
