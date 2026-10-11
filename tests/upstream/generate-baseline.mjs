#!/usr/bin/env node
// Regenerates the pinned legacy baseline read by tests/upstream/legacy.test.mjs.
//
//   node tests/upstream/generate-baseline.mjs --commit <40-hex upstream commit> --out <baseline.json>
//
// Re-pinning is a deliberate act, never a way to turn a red test green:
// - it reads only `git archive` of the named commit, never the working tree, so local edits cannot leak in;
// - the commit must be a full 40-hex id that exists in this repository, so a branch name or abbreviation cannot move the pin;
// - there is no default output path.
// The legacy test then proves the committed HTML and a fresh rebuild still match this baseline.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { BUILDS, htmlFiles } from "./legacy-builds.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

function fail(message) {
  console.error(`generate-baseline: ${message}`);
  process.exit(1);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) fail(`${command} ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

const commit = option("--commit");
const out = option("--out");
if (!commit || !/^[0-9a-f]{40}$/.test(commit)) fail("--commit must be a full 40-hex commit id");
if (!out) fail("--out is required; pass tests/upstream/baseline.json explicitly to replace the pinned baseline");
if (run("git", ["rev-parse", "--verify", `${commit}^{commit}`], { cwd: ROOT }) !== commit) fail(`${commit} is not a commit in this repository; fetch the upstream first`);
const tree = run("git", ["rev-parse", `${commit}^{tree}`], { cwd: ROOT });

const temporary = mkdtempSync(join(tmpdir(), "anatomy-baseline-"));
try {
  const tarPath = join(temporary, "source.tar");
  run("git", ["archive", "--format=tar", "-o", tarPath, commit], { cwd: ROOT });
  const archiveSha256 = sha256(readFileSync(tarPath));
  const pristine = join(temporary, "pristine");
  mkdirSync(pristine);
  run("tar", ["-xf", tarPath, "-C", pristine]);

  // Same disposable workspace shape as the test: only kit, scripts and examples, with every legacy HTML removed before rebuilding.
  const workspace = join(temporary, "source");
  for (const directory of ["kit", "scripts", "examples"]) cpSync(join(pristine, directory), join(workspace, directory), { recursive: true });
  const committedPaths = htmlFiles(pristine);
  const committed = new Map(committedPaths.map((path) => [path, readFileSync(join(pristine, path))]));
  for (const path of htmlFiles(workspace)) rmSync(join(workspace, path));
  for (const args of BUILDS) {
    const result = spawnSync(process.execPath, args, { cwd: workspace, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0 || result.signal) fail(`${args.join(" ")} failed (status ${result.status}, signal ${result.signal})\n${result.error ?? ""}\n${result.stdout}${result.stderr}`);
  }
  const generatedPaths = htmlFiles(workspace);
  if (JSON.stringify(generatedPaths) !== JSON.stringify(committedPaths)) fail(`rebuild emitted a different HTML set than the commit contains:\n${generatedPaths.join("\n")}\n--- committed ---\n${committedPaths.join("\n")}`);

  const html = {};
  for (const path of generatedPaths) {
    const generated = readFileSync(join(workspace, path));
    const committedBytes = committed.get(path);
    html[path] = {
      size: generated.length,
      sha256: sha256(generated),
      committedSize: committedBytes.length,
      committedSha256: sha256(committedBytes),
      committedMatchesGenerated: generated.equals(committedBytes),
      bytes: gzipSync(generated).toString("base64"),
    };
  }

  const exports = {};
  for (const name of readdirSync(join(workspace, "kit")).filter((entry) => entry.endsWith(".mjs")).sort()) {
    exports[`kit/${name}`] = Object.keys(await import(pathToFileURL(join(workspace, "kit", name)).href)).sort();
  }

  const baseline = {
    source: {
      commit,
      tree,
      archiveSha256,
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      v8: process.versions.v8,
      committedHtmlMatchesGenerated: Object.values(html).every((entry) => entry.committedMatchesGenerated),
    },
    encoding: "gzip-base64",
    builds: BUILDS,
    html,
    exports,
  };
  mkdirSync(dirname(resolve(out)), { recursive: true });
  writeFileSync(out, `${JSON.stringify(baseline, null, 2)}\n`);
  const drift = Object.entries(html).filter(([, entry]) => !entry.committedMatchesGenerated).map(([path]) => path);
  console.log(`wrote ${out}: ${generatedPaths.length} HTML files, ${Object.keys(exports).length} kit modules, pinned ${commit} (tree ${tree}) on ${process.platform}/${process.arch} Node ${process.version}`);
  console.log(drift.length ? `committed-versus-generated drift recorded: ${drift.join(", ")}` : "committed HTML matches generated HTML for every file");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
