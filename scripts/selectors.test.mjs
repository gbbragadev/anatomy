import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { inflateSync } from "node:zlib";

const execute = promisify(execFile);
const script = (name) => fileURLToPath(new URL(`${name}.mjs`, import.meta.url));
const nativePage = fileURLToPath(new URL("../examples/turning-dial/turning-dial-light.html", import.meta.url));
const fixture = `<!doctype html><style>body{margin:0}.iso-plate{width:180px;height:100px;background:#ddd}#target{width:100px;height:60px;background:#aab}svg{display:block}</style><div class="iso-plate" id="plate"><svg width="180" height="100"><path class="iso-line" d="M10 10H170V90H10Z" fill="none" stroke="black"/></svg></div><div id="target" tabindex="0"><svg width="100" height="60"><path class="iso-line" d="M10 10H90V50H10Z" fill="none" stroke="black"/></svg></div><button id="button" tabindex="0" onclick="window.activations++;">Activate</button><div style="height:1000px"></div><div id="bottom" style="width:80px;height:80px">Bottom</div><script>window.activations=0;window.moves=0;window.drags=0;const target=document.querySelector('#target');target.addEventListener('pointermove',()=>window.moves++);target.addEventListener('pointerup',()=>window.drags++);</script>`;

async function sandbox(t) {
  const root = await mkdtemp(join(tmpdir(), "anatomy-selectors-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const page = join(root, "figure.html");
  const output = join(root, "result.png");
  await writeFile(page, fixture + "<style>body{margin:12px}</style>");
  return { root, page, output };
}

async function run(name, page, args) {
  const started = Date.now();
  const env = { ...process.env, ANATOMY_CDP_CALL_TIMEOUT_MS: "30000" };
  delete env.ANATOMY_CDP_FETCH_TIMEOUT_MS;
  delete env.ANATOMY_CDP_OPEN_TIMEOUT_MS;
  const options = { timeout: 45000, maxBuffer: 2 * 1024 * 1024, env };
  try {
    return { code: 0, ...await execute(process.execPath, [script(name), page, ...args], options), elapsedMs: Date.now() - started };
  } catch (error) {
    return { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "", elapsedMs: Date.now() - started };
  }
}

const rejectionDetails = (result) => JSON.stringify({
  code: result.code,
  elapsedMs: result.elapsedMs,
  timedOut: `${result.stdout}\n${result.stderr}`.includes("timed out"),
  didNotOpen: `${result.stdout}\n${result.stderr}`.includes("did not open"),
  connectionClosed: `${result.stdout}\n${result.stderr}`.includes("connection closed"),
  stdout: result.stdout,
  stderr: result.stderr,
});
const guardRejected = (result) => {
  const diagnostic = rejectionDetails(result);
  assert.equal(result.code, 1, diagnostic);
  assert.match(`${result.stdout}\n${result.stderr}`, /did not match an element/, diagnostic);
};

const probe = (stdout) => JSON.parse(stdout.split(/\r?\n/).findLast((line) => line.startsWith("eval: ")).slice(6));
const dimensions = async (path) => {
  const png = await readFile(path);
  return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

const centerPixel = async (path) => {
  const png = await readFile(path);
  const width = png.readUInt32BE(16), height = png.readUInt32BE(20), type = png[25];
  assert.equal(png[24], 8);
  assert.ok(type === 2 || type === 6);
  const channels = type === 6 ? 4 : 3, stride = width * channels, data = [];
  for (let offset = 8; offset < png.length; offset += 12 + png.readUInt32BE(offset)) {
    const size = png.readUInt32BE(offset);
    if (png.toString("latin1", offset + 4, offset + 8) === "IDAT") data.push(png.subarray(offset + 8, offset + 8 + size));
  }
  const raw = inflateSync(Buffer.concat(data));
  let previous = Buffer.alloc(stride), row = Buffer.alloc(stride);
  for (let y = 0; y <= Math.floor(height / 2); y++) {
    const filter = raw[y * (stride + 1)];
    assert.ok(filter <= 4);
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? row[x - channels] : 0, up = previous[x], corner = x >= channels ? previous[x - channels] : 0;
      const prediction = left + up - corner;
      const a = Math.abs(prediction - left), b = Math.abs(prediction - up), c = Math.abs(prediction - corner);
      const paeth = a <= b && a <= c ? left : b <= c ? up : corner;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth;
      row[x] = (raw[y * (stride + 1) + 1 + x] + predictor) & 255;
    }
    [previous, row] = [row, previous];
  }
  return [...previous.subarray(Math.floor(width / 2) * channels, Math.floor(width / 2) * channels + 3)];
};

const actions = {
  shot: (out, sel) => ["shot", out, sel],
  click: (_, sel) => ["click", sel],
  move: (_, sel) => ["move", sel, 0.5, 0.5],
  drag: (_, sel) => ["drag", sel, 0.2, 0.2, 0.8, 0.8, 2],
  scroll: (_, sel) => ["scroll", sel],
  key: (_, sel) => ["key", "Enter", sel],
  lines: (out, sel) => ["lines", out, sel],
  sheet: (out, sel) => ["sheet", out, 1, 1, sel, 1],
  orbit: (out, sel) => ["orbit", out, 0, 10, 10, sel, 1],
};

for (const [name, action] of Object.entries(actions)) test(`drive rejects ${name} with an explicit missing target before writing or continuing`, async (t) => {
  const box = await sandbox(t);
  const result = await run("drive", box.page, [JSON.stringify([action(box.output, "#target-typo"), ["eval", "({afterInvalid:true})"]])]);
  guardRejected(result);
  assert.equal(existsSync(box.output), false);
  assert.ok(!result.stdout.includes('"afterInvalid":true'));
});

test("capture rejects an explicit missing target without initial or timed PNG files", async (t) => {
  const box = await sandbox(t);
  const result = await run("capture", box.page, ["--select", "#target-typo", "--out", box.output, "--wait", "0", "--times", "20"]);
  guardRejected(result);
  assert.equal(existsSync(box.output), false);
  assert.equal(existsSync(box.output.replace(/\.png$/, "-20.png")), false);
});

test("capture does not overwrite an existing output after a target typo", async (t) => {
  const box = await sandbox(t);
  const sentinel = Buffer.from("existing capture bytes");
  await writeFile(box.output, sentinel);
  const result = await run("capture", box.page, ["--select", "#target-typo", "--out", box.output, "--wait", "0"]);
  guardRejected(result);
  assert.deepEqual(await readFile(box.output), sentinel);
});

test("capture reports target lookup exceptions instead of a missing selector", async (t) => {
  const box = await sandbox(t);
  await writeFile(box.page, `${fixture}<script>const query=document.querySelector.bind(document);document.querySelector=(selector)=>{if(selector==="#target")throw new Error("capture target lookup failed");return query(selector)};</script>`);
  const result = await run("capture", box.page, ["--select", "#target", "--out", box.output, "--wait", "0"]);
  const diagnostic = rejectionDetails(result);
  assert.equal(result.code, 1, diagnostic);
  assert.match(result.stderr, /capture target lookup failed/, diagnostic);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /did not match an element/, diagnostic);
  assert.equal(existsSync(box.output), false);
});

test("capture preserves explicit target and default plate crops", async (t) => {
  const box = await sandbox(t);
  for (const [select, size] of [[undefined, [192, 112]], ["#target", [112, 72]]]) {
    const result = await run("capture", box.page, ["--out", box.output, "--wait", "0", "--scale", "1", ...(select === undefined ? [] : ["--select", select])]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(await dimensions(box.output), size);
    assert.deepEqual(await centerPixel(box.output), select === "#target" ? [170, 170, 187] : [221, 221, 221]);
  }
});

test("drive preserves explicit, omitted and null screenshot targets", async (t) => {
  const box = await sandbox(t);
  for (const [selector, size] of [[undefined, [188, 108]], [null, [188, 108]], ["#target", [108, 68]]]) {
    const shot = selector === undefined ? ["shot", box.output] : ["shot", box.output, selector];
    const result = await run("drive", box.page, [JSON.stringify([shot])]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(await dimensions(box.output), size);
    assert.deepEqual(await centerPixel(box.output), selector === "#target" ? [170, 170, 187] : [221, 221, 221]);
  }
});

test("drive pointer and keyboard actions still reach their real targets", async (t) => {
  const box = await sandbox(t);
  const result = await run("drive", box.page, [JSON.stringify([["move", "#target", 0.5, 0.5], ["drag", "#target", 0.2, 0.2, 0.8, 0.8, 2], ["click", "#button"], ["key", "Enter", "#button"], ["eval", "({activations:window.activations,moves:window.moves,drags:window.drags,focused:document.activeElement.id})"]])]);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  const observed = probe(result.stdout);
  assert.equal(observed.activations, 2);
  assert.equal(observed.focused, "button");
  assert.ok(observed.moves > 0);
  assert.equal(observed.drags, 1);
});

test("drive omitted and null keyboard targets preserve the documented tabindex focus", async (t) => {
  const box = await sandbox(t);
  for (const selector of [undefined, null]) {
    const key = selector === undefined ? ["key", "x"] : ["key", "x", selector];
    const result = await run("drive", box.page, [JSON.stringify([key, ["eval", "({focused:document.activeElement.id})"]])]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.equal(probe(result.stdout).focused, "target");
  }
});

test("drive scroll still brings an explicit target into the viewport", async (t) => {
  const box = await sandbox(t);
  const result = await run("drive", box.page, [JSON.stringify([["scroll", "#bottom"], ["eval", "(()=>{const r=document.querySelector('#bottom').getBoundingClientRect();return {visible:r.top>=0&&r.bottom<=innerHeight,scrolled:scrollY>0}})()"]])]);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(probe(result.stdout), { visible: true, scrolled: true });
});

test("drive lines and sheet preserve explicit and default plate selection", async (t) => {
  const box = await sandbox(t);
  for (const selector of [undefined, null, "#target"]) {
    const lines = selector === undefined ? ["lines"] : ["lines", null, selector];
    const sheet = selector === undefined ? ["sheet", box.output, 1, 1] : ["sheet", box.output, 1, 1, selector, 1];
    const result = await run("drive", box.page, [JSON.stringify([lines, sheet])]);
    assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
    assert.deepEqual(await dimensions(box.output), selector === undefined ? [94, 54] : selector === "#target" ? [108, 68] : [188, 108]);
    assert.deepEqual(await centerPixel(box.output), selector === "#target" ? [170, 170, 187] : [221, 221, 221]);
  }
});

test("drive orbit preserves an explicit two-frame crop on the real native fixture", async (t) => {
  const box = await sandbox(t);
  const result = await run("drive", nativePage, [JSON.stringify([["orbit", box.output, 0, 10, 10, ".iso-plate", 1, [0, 0, 100, 70], 2], ["eval", "({dial:window.__isoTurn.get().dial})"]]), "--no-webgl"]);
  assert.equal(result.code, 0, `${result.stdout}\n${result.stderr}`);
  assert.deepEqual(probe(result.stdout), { dial: 10 });
  assert.deepEqual(await dimensions(box.output), [200, 70]);
});
