import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import test from "node:test";

const LIMIT_MS = 1000;
const WATCHDOG_MS = 4000;
const TEST_OPTIONS = { timeout: 15000, concurrency: false };
const LIMITS = { fetchTimeoutMs: LIMIT_MS, openTimeoutMs: LIMIT_MS, callTimeoutMs: LIMIT_MS };

async function watchdog(promise, label, timeoutMs = WATCHDOG_MS) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`Test watchdog expired: ${label}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function settled(promise) {
  return Promise.resolve(promise).then(
    (value) => ({ status: "fulfilled", value }),
    (error) => ({ status: "rejected", error }),
  );
}

async function rejection(promise, expected, timeoutMs = WATCHDOG_MS) {
  const outcome = await watchdog(promise, `waiting for ${expected}`, timeoutMs);
  assert.equal(outcome.status, "rejected", `Expected ${expected}; received ${JSON.stringify(outcome.value)}`);
  assert.ok(outcome.error instanceof Error);
  assert.ok(outcome.error.message.includes(expected), `Expected ${expected}; received ${outcome.error.message}`);
  return outcome.error;
}

async function result(promise) {
  const outcome = await watchdog(promise, "waiting for CDP reply");
  assert.equal(outcome.status, "fulfilled", outcome.error?.stack);
  return outcome.value;
}

function mailbox() {
  const values = [];
  const waiters = [];
  return {
    push(value) {
      if (waiters.length) waiters.shift()(value);
      else values.push(value);
    },
    next(label) {
      const promise = values.length ? Promise.resolve(values.shift()) : new Promise((resolve) => waiters.push(resolve));
      return watchdog(promise, label);
    },
  };
}

function frame(opcode, payload) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
  const header = Buffer.alloc(body.length < 126 ? 2 : body.length <= 65535 ? 4 : 10);
  header[0] = 0x80 | opcode;
  if (body.length < 126) header[1] = body.length;
  else if (body.length <= 65535) {
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  return Buffer.concat([header, body]);
}

function websocketPeer(socket, head, messages) {
  let buffered = Buffer.alloc(0);
  let fragments = [];
  let fragmented = false;
  const closed = new Promise((resolve) => socket.once("close", resolve));
  function consume(chunk) {
    buffered = Buffer.concat([buffered, chunk]);
    while (buffered.length >= 2) {
      const final = (buffered[0] & 0x80) !== 0;
      const opcode = buffered[0] & 0x0f;
      assert.equal(buffered[0] & 0x70, 0, "Client must not use unnegotiated WebSocket extensions");
      assert.equal(buffered[1] & 0x80, 0x80, "Client frames must be masked");
      let length = buffered[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffered.length < 4) return;
        length = buffered.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffered.length < 10) return;
        const wideLength = buffered.readBigUInt64BE(2);
        assert.ok(wideLength <= 1_048_576n, "Unexpectedly large fixture payload");
        length = Number(wideLength);
        offset = 10;
      }
      if (buffered.length < offset + 4 + length) return;
      const mask = buffered.subarray(offset, offset + 4);
      const payload = Buffer.from(buffered.subarray(offset + 4, offset + 4 + length));
      buffered = buffered.subarray(offset + 4 + length);
      for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      if (opcode === 8) {
        socket.end(frame(8, payload));
        return;
      }
      if (opcode === 9) {
        socket.write(frame(10, payload));
        continue;
      }
      if (opcode === 10) continue;
      assert.ok(opcode === 1 || (opcode === 0 && fragmented), "Expected a CDP text frame");
      if (opcode === 1) {
        assert.equal(fragmented, false, "A fragmented CDP message is already in progress");
        fragments = [];
      }
      fragments.push(payload);
      fragmented = !final;
      if (final) {
        messages.push(JSON.parse(Buffer.concat(fragments).toString("utf8")));
        fragments = [];
      }
    }
  }
  socket.on("data", consume);
  if (head.length) consume(head);
  return {
    closed,
    send(message) {
      socket.write(frame(1, JSON.stringify(message)));
    },
    close() {
      const payload = Buffer.alloc(2);
      payload.writeUInt16BE(1000);
      socket.write(frame(8, payload));
    },
    terminate() {
      socket.destroy();
    },
  };
}

async function fixture(t, { target = "ready", upgrade = "ready" } = {}) {
  const sockets = new Set();
  const clients = new Set();
  const requests = mailbox();
  const upgrades = mailbox();
  const messages = mailbox();
  let stopping = false;
  const server = createServer((request, response) => {
    if (!request.url.startsWith("/json/new")) {
      response.writeHead(404).end();
      return;
    }
    const closed = new Promise((resolve) => response.once("close", resolve));
    requests.push({ method: request.method, url: request.url, closed });
    if (target === "hang") return;
    response.writeHead(200, { "Content-Type": "application/json" });
    if (target === "body-hang") {
      response.write('{"webSocketDebuggerUrl":');
      return;
    }
    response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${server.address().port}/devtools/page/contract` }));
  });
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("error", () => {});
    socket.once("close", () => sockets.delete(socket));
    if (stopping) socket.destroy();
  });
  server.on("upgrade", (request, socket, head) => {
    const closed = new Promise((resolve) => socket.once("close", resolve));
    if (upgrade === "hang") {
      const disconnected = new Promise((resolve) => {
        socket.once("end", () => {
          resolve();
          socket.end();
        });
        socket.once("close", resolve);
      });
      socket.resume();
      upgrades.push({ disconnected, closed });
      return;
    }
    if (upgrade === "close") {
      upgrades.push({ closed });
      socket.destroy();
      return;
    }
    if (upgrade === "reject") {
      upgrades.push({ closed });
      socket.end("HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
      return;
    }
    assert.equal(request.headers.upgrade?.toLowerCase(), "websocket");
    assert.equal(request.headers["sec-websocket-version"], "13");
    const accept = createHash("sha1").update(`${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest("base64");
    const peer = websocketPeer(socket, head, messages);
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    upgrades.push(peer);
  });
  t.after(async () => {
    stopping = true;
    for (const client of clients) client.close();
    const serverClosed = new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    const socketClosures = Array.from(sockets, (socket) => new Promise((resolve) => {
      socket.once("close", resolve);
      socket.destroy();
    }));
    await watchdog(Promise.all([serverClosed, ...socketClosures]), "closing fixture sockets and HTTP server");
    assert.equal(sockets.size, 0);
  });
  await watchdog(new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  }), "listening on an ephemeral port");
  return {
    port: server.address().port,
    requests,
    upgrades,
    messages,
    async connect(connectCDP, options = {}) {
      return watchdog(connectCDP(server.address().port, { ...LIMITS, ...options }).then((client) => {
        clients.add(client);
        if (stopping) client.close();
        return client;
      }), "opening CDP connection");
    },
  };
}

for (const target of ["hang", "body-hang"]) {
  test(`target ${target === "hang" ? "headers" : "JSON body"} cannot hang past the fetch deadline`, TEST_OPTIONS, async (t) => {
    const { connectCDP } = await import("./cdp-client.mjs");
    const server = await fixture(t, { target });
    const started = performance.now();
    const opening = settled(connectCDP(server.port, LIMITS));
    const request = await server.requests.next("receiving /json/new");
    assert.equal(request.method, "PUT");
    await rejection(opening, `CDP /json/new timed out after ${LIMIT_MS} ms`);
    assert.ok(performance.now() - started >= LIMIT_MS * 0.8, "Fetch timeout must not fire immediately");
    await watchdog(request.closed, "aborting the target HTTP request");
  });
}

test("a stalled WebSocket upgrade times out and closes its TCP socket", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t, { upgrade: "hang" });
  const started = performance.now();
  const opening = settled(connectCDP(server.port, LIMITS));
  const peer = await server.upgrades.next("receiving WebSocket upgrade");
  await rejection(opening, `CDP socket did not open within ${LIMIT_MS} ms`);
  assert.ok(performance.now() - started >= LIMIT_MS * 0.8, "Open timeout must not fire immediately");
  await watchdog(Promise.all([peer.disconnected, peer.closed]), "observing client disconnection and closing the stalled upgrade socket");
});

for (const upgrade of ["close", "reject"]) {
  test(`WebSocket upgrade ${upgrade} rejects before the open timeout`, TEST_OPTIONS, async (t) => {
    const { connectCDP } = await import("./cdp-client.mjs");
    const server = await fixture(t, { upgrade });
    const opening = settled(connectCDP(server.port, { ...LIMITS, openTimeoutMs: 5000 }));
    const peer = await server.upgrades.next("receiving failing WebSocket upgrade");
    const outcome = await watchdog(opening, "rejecting the failed upgrade promptly", LIMIT_MS);
    assert.equal(outcome.status, "rejected");
    assert.match(outcome.error.message, /CDP.*(?:socket|open)/i);
    assert.doesNotMatch(outcome.error.message, /timed out|did not open within/i);
    await watchdog(peer.closed, "closing the failed upgrade socket");
  });
}

test("a received command without a reply rejects with its method and call deadline", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t);
  const { send } = await server.connect(connectCDP);
  const started = performance.now();
  const pending = settled(send("Runtime.evaluate", { expression: "neverReplies()" }));
  const command = await server.messages.next("receiving unanswered Runtime.evaluate");
  assert.equal(command.method, "Runtime.evaluate");
  assert.deepEqual(command.params, { expression: "neverReplies()" });
  await rejection(pending, `CDP call Runtime.evaluate timed out after ${LIMIT_MS} ms`);
  assert.ok(performance.now() - started >= LIMIT_MS * 0.8, "Call timeout must not fire immediately");
});

test("replies preserve IDs, results and CDP errors without requiring this", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t);
  const { send, close } = await server.connect(connectCDP);
  const peer = await server.upgrades.next("receiving successful WebSocket upgrade");
  const success = settled(send("Runtime.evaluate", { expression: "'açúcar'" }));
  const command = await server.messages.next("receiving evaluation command");
  assert.equal(command.method, "Runtime.evaluate");
  assert.deepEqual(command.params, { expression: "'açúcar'" });
  assert.ok(Number.isSafeInteger(command.id));
  const reply = { id: command.id, result: { result: { type: "string", value: "açúcar" } } };
  peer.send(reply);
  assert.deepEqual(await result(success), reply);
  const failure = settled(send("Page.enable"));
  const second = await server.messages.next("receiving command with default params");
  assert.equal(second.method, "Page.enable");
  assert.deepEqual(second.params, {});
  assert.ok(Number.isSafeInteger(second.id));
  assert.notEqual(second.id, command.id);
  const errorReply = { id: second.id, error: { code: -32601, message: "Method not found", data: "contract" } };
  peer.send(errorReply);
  assert.deepEqual(await result(failure), errorReply);
  close();
  close();
  await watchdog(peer.closed, "closing a successful connection");
});

test("simultaneous commands resolve by ID rather than response order", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t);
  const { send } = await server.connect(connectCDP, { callTimeoutMs: 5000 });
  const peer = await server.upgrades.next("receiving WebSocket upgrade");
  const first = settled(send("Runtime.evaluate", { expression: "1" }));
  const second = settled(send("Runtime.evaluate", { expression: "2" }));
  const a = await server.messages.next("receiving first simultaneous command");
  const b = await server.messages.next("receiving second simultaneous command");
  assert.notEqual(a.id, b.id);
  assert.deepEqual(a.params, { expression: "1" });
  assert.deepEqual(b.params, { expression: "2" });
  const secondReply = { id: b.id, result: { result: { type: "number", value: 2 } } };
  const firstReply = { id: a.id, result: { result: { type: "number", value: 1 } } };
  peer.send(secondReply);
  assert.deepEqual(await result(second), secondReply);
  peer.send(firstReply);
  assert.deepEqual(await result(first), firstReply);
});

test("notifications cannot consume a pending command", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const events = mailbox();
  const received = [];
  const server = await fixture(t);
  const { send } = await server.connect(connectCDP, {
    callTimeoutMs: 5000,
    onEvent(event) {
      received.push(event);
      events.push(event);
    },
  });
  const peer = await server.upgrades.next("receiving WebSocket upgrade");
  const pending = settled(send("Runtime.evaluate", { expression: "console.log('event')" }));
  const command = await server.messages.next("receiving command before notification");
  const event = { method: "Runtime.consoleAPICalled", params: { type: "log", args: [{ type: "string", value: "event" }] } };
  peer.send(event);
  assert.deepEqual(await events.next("delivering the CDP notification"), event);
  const barrier = settled(send("Page.enable"));
  const barrierCommand = await server.messages.next("receiving notification barrier command");
  const barrierReply = { id: barrierCommand.id, result: {} };
  peer.send(barrierReply);
  assert.deepEqual(await result(barrier), barrierReply);
  const reply = { id: command.id, result: { result: { type: "undefined" } } };
  peer.send(reply);
  assert.deepEqual(await result(pending), reply);
  assert.deepEqual(received, [event]);
});

for (const disconnect of ["close", "terminate"]) {
  test(`remote ${disconnect} rejects every pending command before its deadline`, TEST_OPTIONS, async (t) => {
    const { connectCDP } = await import("./cdp-client.mjs");
    const server = await fixture(t);
    const { send } = await server.connect(connectCDP, { callTimeoutMs: 5000 });
    const peer = await server.upgrades.next("receiving WebSocket upgrade");
    const first = settled(send("Runtime.evaluate", { expression: "first()" }));
    const second = settled(send("Page.captureScreenshot"));
    const a = await server.messages.next("receiving first pending command");
    const b = await server.messages.next("receiving second pending command");
    assert.equal(a.method, "Runtime.evaluate");
    assert.equal(b.method, "Page.captureScreenshot");
    assert.notEqual(a.id, b.id);
    peer[disconnect]();
    await Promise.all([
      rejection(first, "CDP connection closed during Runtime.evaluate", LIMIT_MS),
      rejection(second, "CDP connection closed during Page.captureScreenshot", LIMIT_MS),
    ]);
    await rejection(settled(send("DOM.getDocument")), "CDP connection closed during DOM.getDocument", LIMIT_MS);
    await watchdog(peer.closed, "closing the disconnected socket");
  });
}

test("explicit close is idempotent, cancels every pending call and rejects later sends promptly", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t);
  const { send, close } = await server.connect(connectCDP, { callTimeoutMs: 5000 });
  const peer = await server.upgrades.next("receiving WebSocket upgrade");
  const first = settled(send("Runtime.evaluate"));
  const second = settled(send("Page.enable"));
  await server.messages.next("receiving first call before explicit close");
  await server.messages.next("receiving second call before explicit close");
  close();
  close();
  await Promise.all([
    rejection(first, "CDP connection closed during Runtime.evaluate", LIMIT_MS),
    rejection(second, "CDP connection closed during Page.enable", LIMIT_MS),
  ]);
  await rejection(settled(send("DOM.getDocument")), "CDP connection closed during DOM.getDocument", LIMIT_MS);
  await watchdog(peer.closed, "closing the socket after explicit close");
  close();
});

test("a longer per-call override survives another call's default timeout", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t);
  const { send } = await server.connect(connectCDP);
  const peer = await server.upgrades.next("receiving WebSocket upgrade");
  const started = performance.now();
  const longer = settled(send("Runtime.evaluate", { expression: "slowButValid()" }, { timeoutMs: 5000 }));
  const ordinary = settled(send("Page.enable"));
  const slow = await server.messages.next("receiving overridden command");
  const ordinaryCommand = await server.messages.next("receiving default-deadline command");
  assert.equal(slow.method, "Runtime.evaluate");
  assert.equal(ordinaryCommand.method, "Page.enable");
  await rejection(ordinary, `CDP call Page.enable timed out after ${LIMIT_MS} ms`);
  assert.ok(performance.now() - started >= LIMIT_MS * 0.8, "The overridden call must survive the default deadline");
  const reply = { id: slow.id, result: { result: { type: "boolean", value: true } } };
  peer.send(reply);
  assert.deepEqual(await result(longer), reply);
});

test("a shorter per-call override wins over the connection's longer deadline", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const server = await fixture(t);
  const { send } = await server.connect(connectCDP, { callTimeoutMs: 5000 });
  const started = performance.now();
  const pending = settled(send("Runtime.evaluate", { expression: "neverReplies()" }, { timeoutMs: LIMIT_MS }));
  await server.messages.next("receiving command with shorter override");
  await rejection(pending, `CDP call Runtime.evaluate timed out after ${LIMIT_MS} ms`);
  assert.ok(performance.now() - started >= LIMIT_MS * 0.8, "Override timeout must not fire immediately");
});

test("a late timed-out reply cannot settle a later call or become a notification", TEST_OPTIONS, async (t) => {
  const { connectCDP } = await import("./cdp-client.mjs");
  const events = [];
  const server = await fixture(t);
  const { send } = await server.connect(connectCDP, { onEvent: (event) => events.push(event) });
  const peer = await server.upgrades.next("receiving WebSocket upgrade");
  const expired = settled(send("Runtime.evaluate", { expression: "expired()" }));
  const oldCommand = await server.messages.next("receiving command that will expire");
  await rejection(expired, `CDP call Runtime.evaluate timed out after ${LIMIT_MS} ms`);
  const pending = settled(send("Runtime.evaluate", { expression: "fresh()" }));
  const newCommand = await server.messages.next("receiving command after timeout");
  assert.notEqual(newCommand.id, oldCommand.id);
  peer.send({ id: oldCommand.id, result: { result: { type: "string", value: "stale" } } });
  const reply = { id: newCommand.id, result: { result: { type: "string", value: "fresh" } } };
  peer.send(reply);
  assert.deepEqual(await result(pending), reply);
  assert.deepEqual(events, []);
});
