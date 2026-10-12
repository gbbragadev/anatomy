import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execute = promisify(execFile);
const lines = fileURLToPath(new URL("lines.mjs", import.meta.url));

async function check(path, { markup, select = "#figure" } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "anatomy-lines-"));
  try {
    const page = join(directory, "figure.html");
    await writeFile(page, markup ?? `<!doctype html><svg id="figure" width="200" height="100" viewBox="0 0 200 100"><path class="iso-line" fill="none" stroke="black" d="${path}"/></svg>`);
    try {
      return { code: 0, ...await execute(process.execPath, [lines, page, "--select", select, "--wait", "0"], { timeout: 30000 }) };
    } catch (error) {
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("a selected SVG checks its own floating lines", async () => {
  const result = await check("M20 20L180 20");
  assert.equal(result.code, 1);
  assert.match(result.stdout, /line ends: 2 of 2 ends on 1 lines float/);
});

test("a selected SVG preserves closed-path exemption", async () => {
  const result = await check("M20 20L180 20L180 80L20 80Z");
  assert.equal(result.code, 0);
  assert.match(result.stdout, /line ends: 0/);
});

test("a selected SVG accepts a line ending underneath a later opaque fill", async () => {
  const markup = `<!doctype html><div class="iso-plate"><svg id="figure" width="200" height="100" viewBox="0 0 200 100"><path class="iso-edge" d="M20 10V90" fill="none" stroke="black"/><line class="iso-line" x1="20" y1="50" x2="150" y2="50" stroke="black"/><rect x="120" y="20" width="60" height="60" fill="gray"/></svg></div>`;
  for (const select of [".iso-plate", "#figure"]) {
    const result = await check(null, { markup, select });
    assert.equal(result.code, 0, `${select}: ${result.stdout}\n${result.stderr}`);
  }
});

test("a missing selector fails instead of auditing an unrelated clean figure", async () => {
  const markup = `<!doctype html><div class="iso-plate"><svg width="200" height="100"><path class="iso-line" fill="none" stroke="black" d="M20 20L180 20L180 80L20 80Z"/></svg></div><svg id="other" width="200" height="100"><path class="iso-line" fill="none" stroke="black" d="M20 20L180 20"/></svg>`;
  const result = await check(null, { markup, select: "#othr" });
  assert.equal(result.code, 1, `${result.stdout}\n${result.stderr}`);
  assert.ok(!result.stdout.includes("line ends: 0"), "unrelated clean content must not be reported as audited");
});

test("a matching selector with no SVG cannot approve unexamined lines", async () => {
  const markup = `<!doctype html><svg width="200" height="100"><g id="part"><path class="iso-line" fill="none" stroke="black" d="M20 20L180 20"/></g></svg><div id="panel">Text</div>`;
  for (const select of ["#part", "#panel"]) {
    const result = await check(null, { markup, select });
    assert.equal(result.code, 1, `${select}: ${result.stdout}\n${result.stderr}`);
    assert.ok(!result.stdout.includes("line ends: 0"));
  }
});
