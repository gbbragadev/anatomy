import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { BUILDS, htmlFiles } from "./legacy-builds.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BASELINE = new URL("./baseline.json", import.meta.url);
const UPSTREAM = "240a9bf7c50cc6226148762a1017466fcbc08523";

test("legacy-builds-are-byte-identical", { timeout: 900_000 }, async (t) => {
  assert.ok(existsSync(BASELINE), `Missing pinned upstream baseline; generate it with tests/upstream/generate-baseline.mjs only from untouched ${UPSTREAM}`);
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  assert.equal(baseline.source.commit, UPSTREAM);
  assert.equal(baseline.encoding, "gzip-base64");
  assert.deepEqual(baseline.builds, BUILDS);
  assert.deepEqual(htmlFiles(ROOT), Object.keys(baseline.html).sort(), "The set of committed legacy HTML changed");
  for (const [path, fixture] of Object.entries(baseline.html)) {
    const committedBytes = readFileSync(join(ROOT, path));
    assert.equal(committedBytes.length, fixture.committedSize, `Committed legacy HTML size changed: ${path}`);
    assert.equal(createHash("sha256").update(committedBytes).digest("hex"), fixture.committedSha256, `Committed legacy HTML changed: ${path}`);
  }
  const temporary = mkdtempSync(join(tmpdir(), "anatomy-legacy-"));
  t.after(() => rmSync(temporary, { recursive: true, force: true }));
  const workspace = join(temporary, "source");
  for (const directory of ["kit", "scripts", "examples"]) cpSync(join(ROOT, directory), join(workspace, directory), { recursive: true });
  for (const path of htmlFiles(workspace)) rmSync(join(workspace, path));
  for (const args of BUILDS) {
    const result = spawnSync(process.execPath, args, { cwd: workspace, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null, `${args.join(" ")} terminated by ${result.signal}`);
  }
  const files = htmlFiles(workspace);
  assert.deepEqual(files, Object.keys(baseline.html).sort(), "The set of emitted legacy HTML changed");
  for (const path of files) {
    const fixture = baseline.html[path];
    const baselineBytes = gunzipSync(Buffer.from(fixture.bytes, "base64"));
    assert.equal(baselineBytes.length, fixture.size, `Baseline size changed: ${path}`);
    assert.equal(createHash("sha256").update(baselineBytes).digest("hex"), fixture.sha256, `Baseline checksum changed: ${path}`);
    const actualBytes = readFileSync(join(workspace, path));
    assert.deepEqual(actualBytes, baselineBytes, `Legacy output changed: ${path}`);
  }
  const modules = readdirSync(join(workspace, "kit")).filter((name) => name.endsWith(".mjs")).sort().map((name) => `kit/${name}`);
  assert.deepEqual(modules, Object.keys(baseline.exports).sort(), "The public kit module set changed");
  for (const path of modules) {
    const actual = Object.keys(await import(pathToFileURL(join(workspace, path)).href)).sort();
    assert.deepEqual(actual, baseline.exports[path], `Public exports changed: ${path}`);
  }
  const drift = Object.entries(baseline.html).filter(([, fixture]) => !fixture.committedMatchesGenerated).map(([path]) => path);
  t.diagnostic(`${files.length} emitted HTML files and ${modules.length} public kit modules matched ${UPSTREAM} rebuilt on ${baseline.source.platform}/${baseline.source.architecture} with ${baseline.source.node}; committed HTML unchanged; no faithful dependencies loaded`);
  if (drift.length) t.diagnostic(`Preexisting committed-versus-generated drift retained without normalization: ${drift.join(", ")}`);
});
