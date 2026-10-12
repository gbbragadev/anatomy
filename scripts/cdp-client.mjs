function cdpError(message, fields, cause) {
  return Object.assign(new Error(message, { cause }), fields);
}

function deadline(value, name, stage) {
  if (!Number.isInteger(value) || value < 1 || value > 2_147_483_647) {
    throw cdpError(`CDP ${name} must be an integer between 1 and 2147483647 ms`, { code: "CDP_INVALID_TIMEOUT", stage });
  }
  return value;
}

export async function connectCDP(port, {
  onEvent,
  fetchTimeoutMs = Number(process.env.ANATOMY_CDP_FETCH_TIMEOUT_MS ?? 20_000),
  openTimeoutMs = Number(process.env.ANATOMY_CDP_OPEN_TIMEOUT_MS ?? 20_000),
  callTimeoutMs = Number(process.env.ANATOMY_CDP_CALL_TIMEOUT_MS ?? 300_000),
} = {}) {
  const fetchLimit = deadline(fetchTimeoutMs, "fetchTimeoutMs", "fetch");
  const openLimit = deadline(openTimeoutMs, "openTimeoutMs", "open");
  const callLimit = deadline(callTimeoutMs, "callTimeoutMs", "call");
  const signal = AbortSignal.timeout(fetchLimit);
  let page;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT", signal });
    page = await response.json();
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
  } catch (cause) {
    if (signal.aborted) {
      throw cdpError(`CDP /json/new timed out after ${fetchLimit} ms`, { code: "CDP_TARGET_TIMEOUT", stage: "fetch", timeoutMs: fetchLimit }, cause);
    }
    throw cdpError(`CDP /json/new failed during fetch (limit ${fetchLimit} ms): ${cause.message}`, { code: "CDP_TARGET_ERROR", stage: "fetch", timeoutMs: fetchLimit }, cause);
  }

  let socket;
  try {
    socket = new WebSocket(page.webSocketDebuggerUrl);
  } catch (cause) {
    throw cdpError(`CDP socket could not open (limit ${openLimit} ms): ${cause.message}`, { code: "CDP_OPEN_ERROR", stage: "open", timeoutMs: openLimit }, cause);
  }

  return new Promise((resolve, reject) => {
    const pending = new Map();
    let state = "opening";
    let nextId = 0;
    let openTimer;
    let terminalCause;

    const closedError = (method, timeoutMs) => cdpError(`CDP connection closed during ${method} at call stage (limit ${timeoutMs} ms)`, {
      code: "CDP_CONNECTION_CLOSED", stage: "call", method, timeoutMs,
    }, terminalCause);

    function complete(id, error, reply) {
      const call = pending.get(id);
      if (!call) return;
      pending.delete(id);
      clearTimeout(call.timer);
      if (error) call.reject(error);
      else call.resolve(reply);
    }

    function clearOpening() {
      clearTimeout(openTimer);
      openTimer = undefined;
      socket.removeEventListener("open", opened);
    }

    function shutdown(cause) {
      if (state === "closed") return;
      const opening = state === "opening";
      state = "closed";
      terminalCause = cause;
      clearOpening();
      socket.removeEventListener("message", message);
      socket.removeEventListener("error", failed);
      socket.removeEventListener("close", disconnected);
      for (const [id, call] of pending) complete(id, closedError(call.method, call.timeoutMs));
      if (opening) {
        reject(cause ?? cdpError(`CDP socket closed before opening (limit ${openLimit} ms)`, { code: "CDP_CONNECTION_CLOSED", stage: "open", timeoutMs: openLimit }));
      }
      if (socket.readyState < WebSocket.CLOSING) socket.close();
    }

    function opened() {
      if (state !== "opening") return;
      state = "open";
      clearOpening();
      resolve({ send, close });
    }

    function disconnected(event) {
      const stage = state === "opening" ? "open" : "call";
      const timeoutMs = stage === "open" ? openLimit : callLimit;
      shutdown(cdpError(`CDP socket closed during ${stage} (limit ${timeoutMs} ms): ${event.code}${event.reason ? `: ${event.reason}` : ""}`, {
        code: "CDP_CONNECTION_CLOSED", stage, timeoutMs,
      }));
    }

    function failed(event) {
      const stage = state === "opening" ? "open" : "call";
      const timeoutMs = stage === "open" ? openLimit : callLimit;
      shutdown(cdpError(`CDP socket error during ${stage} (limit ${timeoutMs} ms): ${event.message || "connection failed"}`, {
        code: "CDP_CONNECTION_CLOSED", stage, timeoutMs,
      }, event.error));
    }

    function eventFailed(cause) {
      shutdown(cdpError(`CDP event handler failed during call (limit ${callLimit} ms): ${String(cause?.message ?? cause)}`, { code: "CDP_EVENT_ERROR", stage: "call", timeoutMs: callLimit }, cause));
    }

    function message(event) {
      let data;
      try {
        data = JSON.parse(event.data);
        if (Object.hasOwn(data, "id")) {
          if (pending.has(data.id)) complete(data.id, undefined, data);
          else if (!Number.isSafeInteger(data.id) || data.id < 1 || data.id > nextId) throw new Error(`Unexpected CDP reply ID: ${data.id}`);
          return;
        }
      } catch (cause) {
        shutdown(cdpError(`CDP socket message failed during call (limit ${callLimit} ms): ${cause.message}`, { code: "CDP_PROTOCOL_ERROR", stage: "call", timeoutMs: callLimit }, cause));
        return;
      }
      if (onEvent) {
        try {
          const result = onEvent(data);
          if (result && typeof result.then === "function") Promise.resolve(result).catch(eventFailed);
        } catch (cause) {
          eventFailed(cause);
        }
      }
    }

    async function send(method, params = {}, { timeoutMs = callLimit } = {}) {
      const limit = deadline(timeoutMs, "timeoutMs", "call");
      if (state !== "open" || socket.readyState !== WebSocket.OPEN) {
        shutdown();
        throw closedError(method, limit);
      }
      return new Promise((resolveCall, rejectCall) => {
        const id = ++nextId;
        const timer = setTimeout(() => {
          complete(id, cdpError(`CDP call ${method} timed out after ${limit} ms`, {
            code: "CDP_CALL_TIMEOUT", stage: "call", method, timeoutMs: limit,
          }));
        }, limit);
        pending.set(id, { resolve: resolveCall, reject: rejectCall, timer, method, timeoutMs: limit });
        try {
          socket.send(JSON.stringify({ id, method, params }));
        } catch (cause) {
          shutdown(cdpError(`CDP socket failed to send ${method} during call (limit ${limit} ms): ${cause.message}`, { code: "CDP_SEND_ERROR", stage: "call", method, timeoutMs: limit }, cause));
        }
      });
    }

    function close() {
      shutdown();
    }

    socket.addEventListener("open", opened);
    socket.addEventListener("message", message);
    socket.addEventListener("error", failed);
    socket.addEventListener("close", disconnected);
    openTimer = setTimeout(() => {
      shutdown(cdpError(`CDP socket did not open within ${openLimit} ms`, {
        code: "CDP_OPEN_TIMEOUT", stage: "open", timeoutMs: openLimit,
      }));
    }, openLimit);
  });
}
