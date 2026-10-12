import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";

const GENERATOR = fileURLToPath(new URL("./generate-baseline.mjs", import.meta.url));
const COVERAGE_PATH = "tests/upstream/baseline.json";
const FORK_PUBLISHED = "15cd4fcfde78298f6de17c619d466aad56dea0f9";
const ABSENT = "a".repeat(40);
const MARKER = "scripts/marker.txt";
const MARKER_TEXT = "$Format:%H$\n$Id$\nplain\n";
const ALTERING_ATTRIBUTES = [
  ["export-subst", `${MARKER} export-subst\n`],
  ["ident", `${MARKER} ident\n`],
  ["eol", `${MARKER} text eol=crlf\n`],
];
const TIMEOUT = 180_000;
const BUILDS = [
  ["examples/alpha/build.mjs"],
  ["examples/beta/build.mjs"],
  ["examples/beta/build.mjs", "--light"],
];
const PAGES = ["examples/alpha/alpha.html", "examples/beta/beta-light.html", "examples/beta/beta.html"];
const IDENTITY = {
  GIT_AUTHOR_NAME: "Fixture",
  GIT_AUTHOR_EMAIL: "fixture@example.invalid",
  GIT_COMMITTER_NAME: "Fixture",
  GIT_COMMITTER_EMAIL: "fixture@example.invalid",
  GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
};
const OVERRIDDEN = new Set(["HOME", "USERPROFILE", "XDG_CONFIG_HOME", "TMPDIR", "TEMP", "TMP"]);

const discard = (path) => rmSync(path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

const report = (result) => `status ${result.status}, signal ${result.signal}\n${result.error ?? ""}\n${result.stdout}\n${result.stderr}`;

const page = (stem, label) => `<title>${stem} ${label}</title>\n`;

const manifest = (changes = {}) => `${JSON.stringify({ builds: BUILDS, html: Object.fromEntries(PAGES.map((path) => [path, {}])), ...changes }, null, 2)}\n`;

const MALFORMED = {
  notJson: "not json\n",
  noBuilds: manifest({ builds: undefined }),
  emptyBuilds: manifest({ builds: [] }),
  escapingBuild: manifest({ builds: [["examples/../../escape.mjs"]] }),
  buildOutsideExamples: manifest({ builds: [["scripts/build.mjs"]] }),
  argumentThatIsNotAFlag: manifest({ builds: [["examples/alpha/build.mjs", "not-a-flag"]] }),
  noHtml: manifest({ html: {} }),
  htmlOutsideExamples: manifest({ html: { "kit/page.html": {} } }),
  htmlNotAnObject: manifest({ html: PAGES }),
};

const PRELOAD = 'import { appendFileSync } from "node:fs";\nappendFileSync(process.env.PRELOAD_LOG, `${process.argv[1]}\\n`);\n';

function toolEnvironment(base, extra = {}) {
  const home = join(base, "home");
  const scratch = join(base, "tmp");
  mkdirSync(home, { recursive: true });
  mkdirSync(scratch, { recursive: true });
  const inherited = Object.entries(process.env).filter(([key]) => !/^(GIT_|NODE_)/i.test(key) && !OVERRIDDEN.has(key.toUpperCase()));
  return {
    ...Object.fromEntries(inherited),
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: join(home, "xdg"),
    GIT_CONFIG_NOSYSTEM: "1",
    TMPDIR: scratch,
    TEMP: scratch,
    TMP: scratch,
    ...extra,
  };
}

function git(cwd, environment, ...args) {
  const result = spawnSync("git", args, { cwd, env: environment, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `git ${args.join(" ")}\n${result.stdout}${result.stderr}`);
  return result.stdout.trim();
}

function buildScript(name, label) {
  return [
    'import { appendFileSync, writeFileSync } from "node:fs";',
    `const stem = ${JSON.stringify(name)} + (process.argv.includes("--light") ? "-light" : "");`,
    'if (process.env.BUILD_LOG) appendFileSync(process.env.BUILD_LOG, stem + "\\n");',
    `writeFileSync(new URL("./" + stem + ".html", import.meta.url), "<title>" + stem + " " + ${JSON.stringify(label)} + "</title>\\n");`,
    "",
  ].join("\n");
}

function pinTree(label, changes = {}) {
  const tree = {
    "kit/tiny.mjs": `export const label = ${JSON.stringify(label)};\n`,
    "scripts/tiny.mjs": "export const scripts = true;\n",
    [MARKER]: MARKER_TEXT,
    "examples/alpha/build.mjs": buildScript("alpha", label),
    "examples/alpha/alpha.html": page("alpha", label),
    "examples/beta/build.mjs": buildScript("beta", label),
    "examples/beta/beta.html": "<title>stale</title>\n",
    "examples/beta/beta-light.html": page("beta-light", label),
  };
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) delete tree[path];
    else tree[path] = text;
  }
  return tree;
}

function commitTree(repository, environment, message, files, parents) {
  const scratch = mkdtempSync(join(dirname(repository), "tree-"));
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(scratch, path)), { recursive: true });
    writeFileSync(join(scratch, path), text);
  }
  const staged = { ...environment, GIT_DIR: join(repository, ".git"), GIT_WORK_TREE: scratch, GIT_INDEX_FILE: `${scratch}.index` };
  git(scratch, staged, "add", "--all");
  const tree = git(scratch, staged, "write-tree");
  const commit = git(scratch, staged, "commit-tree", ...parents.flatMap((parent) => ["-p", parent]), "-m", message, tree);
  discard(scratch);
  discard(`${scratch}.index`);
  return commit;
}

function createTemplate() {
  const base = mkdtempSync(join(tmpdir(), "anatomy-generator-template-"));
  const repository = join(base, "repository");
  const environment = toolEnvironment(base, IDENTITY);
  mkdirSync(repository, { recursive: true });
  git(repository, environment, "init", "-q");
  git(repository, environment, "config", "core.autocrlf", "false");
  const ids = {};
  const add = (name, files, ...parents) => {
    ids[name] = commitTree(repository, environment, name, files, parents);
    git(repository, environment, "update-ref", `refs/fixtures/${name}`, ids[name]);
    return ids[name];
  };
  add("zero", pinTree("zero"));
  add("one", pinTree("one"), ids.zero);
  add("two", pinTree("two", { "kit/tiny.mjs": 'export const label = "two";\nexport const second = 2;\n' }), ids.one);
  add("fork", pinTree("fork"), ids.two);
  add("broken", pinTree("broken", { "examples/beta/build.mjs": "process.exit(3);\n" }));
  add("extra", pinTree("extra", { "examples/alpha/extra.html": "<title>extra</title>\n" }));
  add("missing", pinTree("missing", { "examples/beta/beta-light.html": null }));
  add("attributed", pinTree("attributed", { ".gitattributes": `${MARKER} export-subst\n` }));
  add("published", { [COVERAGE_PATH]: manifest() });
  add("reduced", { [COVERAGE_PATH]: manifest({ builds: [BUILDS[0]], html: { [PAGES[0]]: {} } }) });
  const malformed = {};
  for (const [name, text] of Object.entries(MALFORMED)) malformed[name] = add(`malformed-${name}`, { [COVERAGE_PATH]: text });
  return { base, repository, ids, malformed };
}

let template;

before(() => {
  template = createTemplate();
});

after(() => {
  if (template) discard(template.base);
});

const approvedPolicy = (coverage = template.ids.published) => ({
  upstreams: [template.ids.one, template.ids.two, template.ids.broken, template.ids.extra, template.ids.missing, template.ids.attributed, ABSENT],
  coverage: { commit: coverage, path: COVERAGE_PATH },
});

function sandbox(t) {
  const base = mkdtempSync(join(tmpdir(), "anatomy-generator-"));
  t.after(() => discard(base));
  const environment = toolEnvironment(base);
  const root = join(base, "repository");
  cpSync(template.repository, root, { recursive: true });
  const upstream = join(root, "tests", "upstream");
  mkdirSync(upstream, { recursive: true });
  const script = join(upstream, "generate-baseline.mjs");
  copyFileSync(GENERATOR, script);
  const box = {
    base,
    root,
    upstream,
    policyFile: join(upstream, "upstream-policy.json"),
    out: join(base, "out", "baseline.json"),
    buildLog: join(base, "builds.log"),
    run(args, extra = {}) {
      return spawnSync(process.execPath, [script, ...args], { cwd: root, env: { ...environment, BUILD_LOG: box.buildLog, ...extra }, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
    },
    generate(commit, extra) {
      return box.run(["--commit", commit, "--out", box.out], extra);
    },
    setPolicy(policy) {
      writeFileSync(box.policyFile, typeof policy === "string" ? policy : `${JSON.stringify(policy, null, 2)}\n`);
    },
    attributes(text) {
      mkdirSync(join(root, ".git", "info"), { recursive: true });
      writeFileSync(join(root, ".git", "info", "attributes"), text);
    },
    git(...args) {
      return git(root, { ...environment, ...IDENTITY }, ...args);
    },
    written() {
      return existsSync(dirname(box.out)) ? readdirSync(dirname(box.out)) : [];
    },
    leftovers() {
      return readdirSync(environment.TMP).filter((name) => name.startsWith("anatomy-baseline-"));
    },
  };
  box.setPolicy(approvedPolicy());
  return box;
}

function assertRejected(box, result) {
  assert.equal(result.status, 1, report(result));
  assert.equal(existsSync(box.out), false, "a rejected run wrote a reference");
  assert.deepEqual(box.written(), []);
  assert.equal(existsSync(box.buildLog), false, "a rejected run started a build");
  assert.deepEqual(box.leftovers(), []);
}

function acceptControl(box) {
  const result = box.generate(template.ids.one);
  assert.equal(result.status, 0, report(result));
  discard(dirname(box.out));
  discard(box.buildLog);
}

function readReference(box) {
  const text = readFileSync(box.out, "utf8");
  return { text, reference: JSON.parse(text) };
}

function assertCoverage(reference, label) {
  assert.deepEqual(reference.builds, BUILDS);
  assert.deepEqual(Object.keys(reference.html), PAGES);
  for (const path of PAGES) {
    const entry = reference.html[path];
    const bytes = gunzipSync(Buffer.from(entry.bytes, "base64"));
    assert.equal(bytes.toString("utf8"), page(basename(path, ".html"), label));
    assert.equal(entry.size, bytes.length);
  }
}

const treeOf = (box, commit) => box.git("--no-replace-objects", "rev-parse", `${commit}^{tree}`);

function assertArchiveAltersBytesKeepsNames(box, commit) {
  const tarPath = join(box.base, "probe.tar");
  box.git("-c", "tar.umask=0002", "archive", "--format=tar", "-o", tarPath, commit);
  const listing = spawnSync("tar", ["-tf", tarPath], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  assert.equal(listing.status, 0, report(listing));
  const archivedNames = listing.stdout.split(/\r?\n/).filter((line) => line && !line.endsWith("/")).sort();
  assert.deepEqual(archivedNames, box.git("ls-tree", "-r", "--name-only", commit).split(/\r?\n/).sort());
  const archived = spawnSync("tar", ["-xOf", tarPath, MARKER], { maxBuffer: 16 * 1024 * 1024 });
  assert.equal(archived.status, 0, report(archived));
  assert.notEqual(archived.stdout.toString("utf8"), MARKER_TEXT, "the archive kept the committed bytes, so this case proves nothing");
}

test("real-policy-does-not-approve-the-fork-published-commit", { timeout: TIMEOUT }, (t) => {
  const base = mkdtempSync(join(tmpdir(), "anatomy-generator-real-"));
  t.after(() => discard(base));
  const environment = toolEnvironment(base);
  const out = join(base, "out", "baseline.json");
  const result = spawnSync(process.execPath, [GENERATOR, "--commit", FORK_PUBLISHED, "--out", out], { cwd: base, env: environment, encoding: "utf8", timeout: 60_000, maxBuffer: 16 * 1024 * 1024 });
  assert.equal(result.status, 1, report(result));
  assert.equal(existsSync(out), false);
  assert.deepEqual(readdirSync(environment.TMP).filter((name) => name.startsWith("anatomy-baseline-")), []);
});

for (const [name, exported] of [["one", ["label"]], ["two", ["label", "second"]]]) {
  test(`approved-upstream-${name}-generates-a-reference-in-the-baseline-format`, { timeout: TIMEOUT }, (t) => {
    const box = sandbox(t);
    mkdirSync(dirname(box.out), { recursive: true });
    writeFileSync(box.out, "previous reference\n");
    const commit = template.ids[name];
    const result = box.generate(commit);
    assert.equal(result.status, 0, report(result));
    const { text, reference } = readReference(box);
    assert.equal(text, `${JSON.stringify(reference, null, 2)}\n`);
    assert.deepEqual(Object.keys(reference), ["source", "encoding", "builds", "html", "exports"]);
    assert.deepEqual(Object.keys(reference.source), ["commit", "tree", "archiveSha256", "node", "platform", "architecture", "v8", "committedHtmlMatchesGenerated"]);
    assert.equal(reference.source.commit, commit);
    assert.equal(reference.source.tree, treeOf(box, commit));
    assert.equal(reference.source.committedHtmlMatchesGenerated, false);
    assert.equal(reference.encoding, "gzip-base64");
    assertCoverage(reference, name);
    for (const path of PAGES) {
      assert.deepEqual(Object.keys(reference.html[path]), ["size", "sha256", "committedSize", "committedSha256", "committedMatchesGenerated", "bytes"]);
      assert.equal(reference.html[path].committedMatchesGenerated, path !== "examples/beta/beta.html");
    }
    assert.deepEqual(reference.exports, { "kit/tiny.mjs": exported });
    assert.deepEqual(box.written(), ["baseline.json"]);
    assert.deepEqual(box.leftovers(), []);
  });
}

test("fork-commit-cannot-generate-a-reference-whatever-local-refs-say", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  box.git("update-ref", "refs/remotes/upstream/main", template.ids.fork);
  box.git("update-ref", "refs/heads/main", template.ids.fork);
  acceptControl(box);
  for (const commit of [template.ids.fork, template.ids.zero, template.ids.published]) assertRejected(box, box.generate(commit));
});

test("only-a-full-lowercase-commit-id-with-an-explicit-output-is-accepted", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  const one = template.ids.one;
  box.git("update-ref", "refs/remotes/upstream/main", one);
  acceptControl(box);
  for (const commit of ["upstream/main", "refs/remotes/upstream/main", "HEAD", one.slice(0, 12), one.toUpperCase(), ` ${one}`, `${one}\n`, ""]) assertRejected(box, box.generate(commit));
  assertRejected(box, box.run(["--out", box.out]));
  assertRejected(box, box.run(["--commit", one]));
  assertRejected(box, box.run(["--commit", one, "--out"]));
  assertRejected(box, box.run(["--commit"]));
});

test("approved-commit-missing-from-the-repository-fails-before-any-work", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  acceptControl(box);
  assertRejected(box, box.generate(ABSENT));
});

test("tampered-helper-is-not-executed-and-cannot-shrink-the-coverage", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  const marker = join(box.base, "helper-executed");
  writeFileSync(join(box.upstream, "legacy-builds.mjs"), [
    'import { writeFileSync } from "node:fs";',
    `writeFileSync(${JSON.stringify(marker)}, "executed");`,
    'export const EXAMPLES = ["alpha"];',
    'export const BUILDS = [["examples/alpha/build.mjs"]];',
    "export const htmlFiles = () => [];",
    "",
  ].join("\n"));
  const result = box.generate(template.ids.one);
  assert.equal(result.status, 0, report(result));
  assert.equal(existsSync(marker), false, "the tampered helper was executed");
  assertCoverage(readReference(box).reference, "one");
});

test("local-edits-cannot-change-the-reference", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  writeFileSync(join(box.upstream, "baseline.json"), manifest({ builds: [BUILDS[0]], html: { [PAGES[0]]: {} } }));
  mkdirSync(join(box.root, "kit"), { recursive: true });
  writeFileSync(join(box.root, "kit", "tiny.mjs"), "export const tampered = true;\n");
  mkdirSync(join(box.root, "examples", "alpha"), { recursive: true });
  writeFileSync(join(box.root, "examples", "alpha", "build.mjs"), "process.exit(9);\n");
  const result = box.generate(template.ids.one);
  assert.equal(result.status, 0, report(result));
  const { reference } = readReference(box);
  assertCoverage(reference, "one");
  assert.deepEqual(reference.exports, { "kit/tiny.mjs": ["label"] });
});

test("replace-refs-cannot-move-an-approved-commit-or-the-trusted-coverage", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  const tree = treeOf(box, template.ids.one);
  box.git("replace", template.ids.one, template.ids.fork);
  box.git("replace", template.ids.published, template.ids.reduced);
  const result = box.generate(template.ids.one);
  assert.equal(result.status, 0, report(result));
  const { reference } = readReference(box);
  assert.equal(reference.source.commit, template.ids.one);
  assert.equal(reference.source.tree, tree);
  assertCoverage(reference, "one");
});

test("absent-or-malformed-trusted-coverage-fails-closed", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  acceptControl(box);
  for (const coverage of [...Object.values(template.malformed), ABSENT]) {
    box.setPolicy(approvedPolicy(coverage));
    assertRejected(box, box.generate(template.ids.one));
  }
  box.setPolicy({ ...approvedPolicy(), coverage: { commit: template.ids.published, path: "tests/upstream/missing.json" } });
  assertRejected(box, box.generate(template.ids.one));
});

test("commit-html-set-that-differs-from-the-trusted-coverage-fails-before-any-build", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  acceptControl(box);
  for (const name of ["extra", "missing"]) assertRejected(box, box.generate(template.ids[name]));
});

test("unreadable-or-empty-policy-approves-nothing", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  acceptControl(box);
  const one = template.ids.one;
  const coverage = approvedPolicy().coverage;
  const policies = ["{", "null", { upstreams: [], coverage }, { upstreams: [one, one], coverage }, { upstreams: [one.slice(0, 12)], coverage }, { upstreams: [one], coverage: { commit: template.ids.published } }];
  for (const policy of policies) {
    box.setPolicy(policy);
    assertRejected(box, box.generate(one));
  }
  rmSync(box.policyFile);
  assertRejected(box, box.generate(one));
});

test("failed-build-keeps-an-existing-reference-and-leaves-nothing-behind", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  mkdirSync(dirname(box.out), { recursive: true });
  writeFileSync(box.out, "previous reference\n");
  const result = box.generate(template.ids.broken);
  assert.equal(result.status, 1, report(result));
  assert.equal(readFileSync(box.buildLog, "utf8"), "alpha\n");
  assert.equal(readFileSync(box.out, "utf8"), "previous reference\n");
  assert.deepEqual(box.written(), ["baseline.json"]);
  assert.deepEqual(box.leftovers(), []);
});

test("failed-final-rename-leaves-nothing-behind", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  const target = join(box.base, "out", "occupied");
  mkdirSync(target, { recursive: true });
  const result = box.run(["--commit", template.ids.one, "--out", target]);
  assert.notEqual(result.status, 0, report(result));
  assert.equal(readFileSync(box.buildLog, "utf8"), "alpha\nbeta\nbeta-light\n");
  assert.equal(statSync(target).isDirectory(), true);
  assert.deepEqual(readdirSync(dirname(target)), ["occupied"]);
  assert.deepEqual(box.leftovers(), []);
});

for (const [name, attributes] of ALTERING_ATTRIBUTES) {
  test(`${name}-rewriting-an-archived-file-keeps-its-name-and-fails-closed`, { timeout: TIMEOUT }, (t) => {
    const box = sandbox(t);
    acceptControl(box);
    box.attributes(attributes);
    assertArchiveAltersBytesKeepsNames(box, template.ids.one);
    assertRejected(box, box.generate(template.ids.one));
  });
}

test("tree-attribute-rewriting-an-archived-file-keeps-its-name-and-fails-closed", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  assertArchiveAltersBytesKeepsNames(box, template.ids.attributed);
  assertRejected(box, box.generate(template.ids.attributed));
});

test("export-ignore-attribute-cannot-make-the-archive-drop-files", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  acceptControl(box);
  box.attributes("kit/tiny.mjs export-ignore\n");
  assertRejected(box, box.generate(template.ids.one));
});

test("builds-do-not-inherit-node-variables", { timeout: TIMEOUT }, (t) => {
  const box = sandbox(t);
  const preload = join(box.base, "preload.mjs");
  const log = join(box.base, "preload.log");
  writeFileSync(preload, PRELOAD);
  const result = box.generate(template.ids.one, { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}`, PRELOAD_LOG: log });
  assert.equal(result.status, 0, report(result));
  const processes = readFileSync(log, "utf8").trim().split("\n");
  assert.equal(processes.length, 1, `NODE_OPTIONS reached a build: ${processes.join(", ")}`);
  assert.equal(basename(processes[0]), "generate-baseline.mjs");
});
