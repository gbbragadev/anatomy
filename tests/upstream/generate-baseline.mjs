#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const POLICY = fileURLToPath(new URL("./upstream-policy.json", import.meta.url));
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const PATH_PART = /^[A-Za-z0-9_][A-Za-z0-9._-]*$/;
const BUILD_FLAG = /^--[a-z][a-z-]*$/;

class GeneratorError extends Error {}

function fail(message) {
  throw new GeneratorError(message);
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

const git = (...args) => run("git", ["--no-replace-objects", ...args], { cwd: ROOT });
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const isCommit = (value) => typeof value === "string" && FULL_COMMIT.test(value);
const isRepositoryPath = (value) => typeof value === "string" && value.split("/").every((part) => PATH_PART.test(part));
const isExampleScript = (value) => isRepositoryPath(value) && /^examples\/[^/]+\/[^/]+\.mjs$/.test(value);
const isExamplePage = (value) => isRepositoryPath(value) && /^examples\/[^/]+\/.+\.html$/.test(value);
const isBuild = (args) => Array.isArray(args) && isExampleScript(args[0]) && args.slice(1).every((arg) => typeof arg === "string" && BUILD_FLAG.test(arg));

function readPolicy() {
  let policy;
  try {
    policy = JSON.parse(readFileSync(POLICY, "utf8"));
  } catch (error) {
    fail(`cannot read the upstream policy ${POLICY}: ${error.message}`);
  }
  const upstreams = policy?.upstreams;
  const coverage = policy?.coverage;
  if (!Array.isArray(upstreams) || upstreams.length === 0 || !upstreams.every(isCommit) || new Set(upstreams).size !== upstreams.length) fail(`${POLICY} must list distinct full 40-hex upstream commits`);
  if (!isCommit(coverage?.commit) || !isRepositoryPath(coverage?.path)) fail(`${POLICY} must name the full 40-hex commit and the repository path of the immutable coverage manifest`);
  return { upstreams, coverage };
}

function readCoverage(source) {
  if (git("rev-parse", "--verify", `${source.commit}^{commit}`) !== source.commit) fail(`${source.commit} is not a commit in this repository; fetch the commit that holds the trusted coverage manifest`);
  const text = git("cat-file", "blob", `${source.commit}:${source.path}`);
  let manifest;
  try {
    manifest = JSON.parse(text);
  } catch (error) {
    fail(`${source.path} at ${source.commit} is not valid JSON: ${error.message}`);
  }
  const builds = manifest?.builds;
  const html = manifest?.html;
  if (!Array.isArray(builds) || builds.length === 0 || !builds.every(isBuild)) fail(`${source.path} at ${source.commit} must list the example build commands`);
  if (typeof html !== "object" || html === null || Array.isArray(html)) fail(`${source.path} at ${source.commit} must map the legacy example HTML pages`);
  const pages = Object.keys(html).sort();
  if (pages.length === 0 || !pages.every(isExamplePage)) fail(`${source.path} at ${source.commit} must list only legacy example HTML pages`);
  return { builds, pages, examples: [...new Set(pages.map((page) => page.split("/")[1]))] };
}

function legacyHtml(root, examples) {
  const found = [];
  const walk = (directory) => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".html")) found.push(relative(root, path).split(sep).join("/"));
    }
  };
  for (const name of examples) walk(join(root, "examples", name));
  return found.sort();
}

function treeFiles(commit) {
  return git("ls-tree", "-r", "-z", commit).split("\0").filter(Boolean).map((record) => {
    const separator = record.indexOf("\t");
    return { id: record.slice(0, separator).split(" ")[2], path: record.slice(separator + 1) };
  }).sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function extractedIds(root, paths) {
  const input = `${paths.map((path) => join(root, path)).join("\n")}\n`;
  return run("git", ["--no-replace-objects", "hash-object", "--no-filters", "--stdin-paths"], { cwd: ROOT, input }).split(/\r?\n/);
}

let temporary;
let partial;
try {
  const commit = option("--commit");
  const out = option("--out");
  if (!isCommit(commit)) fail("--commit must be a full 40-hex commit id");
  if (!out) fail("--out is required; pass tests/upstream/baseline.json explicitly to replace the pinned baseline");
  const policy = readPolicy();
  if (!policy.upstreams.includes(commit)) fail(`${commit} is not an approved upstream commit (approved: ${policy.upstreams.join(", ")}); a fork commit or a local ref cannot authenticate the origin`);
  if (git("rev-parse", "--verify", `${commit}^{commit}`) !== commit) fail(`${commit} is not a commit in this repository; fetch the upstream first`);
  const tree = git("rev-parse", `${commit}^{tree}`);
  const coverage = readCoverage(policy.coverage);

  temporary = mkdtempSync(join(tmpdir(), "anatomy-baseline-"));
  const tarPath = join(temporary, "source.tar");
  git("-c", "tar.umask=0002", "archive", "--format=tar", "-o", tarPath, commit);
  const archiveSha256 = sha256(readFileSync(tarPath));
  const pristine = join(temporary, "pristine");
  mkdirSync(pristine);
  run("tar", ["-xf", tarPath, "-C", pristine]);
  const listed = treeFiles(commit);
  const extracted = readdirSync(pristine, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => join(entry.parentPath, entry.name).slice(pristine.length + 1).split(sep).join("/")).sort();
  if (JSON.stringify(listed.map((file) => file.path)) !== JSON.stringify(extracted)) fail(`git archive of ${commit} does not hold exactly the files of the commit (${extracted.length} extracted, ${listed.length} listed)`);
  const extractedHashes = extractedIds(pristine, extracted);
  const altered = listed.filter((file, index) => extractedHashes[index] !== file.id).map((file) => file.path);
  if (extractedHashes.length !== listed.length || altered.length) fail(`git archive of ${commit} changed the bytes of ${altered.length} of its ${listed.length} files (an export-subst, ident, eol or filter attribute); first: ${altered.slice(0, 5).join(", ")}`);

  const workspace = join(temporary, "source");
  for (const directory of ["kit", "scripts", "examples"]) cpSync(join(pristine, directory), join(workspace, directory), { recursive: true });
  const committedPaths = legacyHtml(pristine, coverage.examples);
  if (JSON.stringify(committedPaths) !== JSON.stringify(coverage.pages)) fail(`the legacy HTML set of ${commit} differs from the trusted coverage:\n${committedPaths.join("\n")}\n--- trusted ---\n${coverage.pages.join("\n")}`);
  const committed = new Map(committedPaths.map((path) => [path, readFileSync(join(pristine, path))]));
  for (const path of legacyHtml(workspace, coverage.examples)) rmSync(join(workspace, path));
  const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith("NODE_")));
  for (const args of coverage.builds) {
    const result = spawnSync(process.execPath, args, { cwd: workspace, env: environment, encoding: "utf8", timeout: 300_000, maxBuffer: 8 * 1024 * 1024 });
    if (result.error || result.status !== 0 || result.signal) fail(`${args.join(" ")} failed (status ${result.status}, signal ${result.signal})\n${result.error ?? ""}\n${result.stdout}${result.stderr}`);
  }
  const generatedPaths = legacyHtml(workspace, coverage.examples);
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
    builds: coverage.builds,
    html,
    exports,
  };
  const target = resolve(out);
  mkdirSync(dirname(target), { recursive: true });
  partial = `${target}.${process.pid}.tmp`;
  writeFileSync(partial, `${JSON.stringify(baseline, null, 2)}\n`);
  renameSync(partial, target);
  partial = undefined;
  const drift = Object.entries(html).filter(([, entry]) => !entry.committedMatchesGenerated).map(([path]) => path);
  console.log(`wrote ${out}: ${generatedPaths.length} HTML files, ${Object.keys(exports).length} kit modules, pinned ${commit} (tree ${tree}) on ${process.platform}/${process.arch} Node ${process.version}`);
  console.log(drift.length ? `committed-versus-generated drift recorded: ${drift.join(", ")}` : "committed HTML matches generated HTML for every file");
} catch (error) {
  if (!(error instanceof GeneratorError)) throw error;
  console.error(`generate-baseline: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (partial) rmSync(partial, { force: true });
  if (temporary) rmSync(temporary, { recursive: true, force: true });
}
