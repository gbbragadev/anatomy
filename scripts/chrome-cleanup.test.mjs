import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { access, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

const execute = promisify(execFile);

for (const name of ["capture", "drive", "turn-check"]) test(`${name} removes its real Chrome profile after an early CDP failure`, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "anatomy-chrome-cleanup-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const page = join(root, "figure.html");
  await writeFile(page, "<!doctype html><div class=iso-plate>Figure</div>");
  const script = fileURLToPath(new URL(`${name}.mjs`, import.meta.url));
  const args = name === "capture" ? ["--out", join(root, "forbidden.png"), "--wait", "0"] : name === "drive" ? ["[]"] : ["--lines"];
  const env = { ...process.env, TEMP: root, TMP: root, TMPDIR: root, ANATOMY_CDP_FETCH_TIMEOUT_MS: "1" };
  if (process.platform === "win32" && !env.CHROME_PATH) env.CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  let result;
  try {
    result = { code: 0, ...await execute(process.execPath, [script, page, ...args], { env, timeout: 30000 }) };
  } catch (error) {
    result = { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
  const diagnostic = JSON.stringify(result);
  assert.equal(result.code, 1, diagnostic);
  assert.match(result.stderr, /CDP \/json\/new timed out after 1 ms/, diagnostic);
  assert.deepEqual((await readdir(root)).filter((entry) => /^(iso-capture-|iso-drive-|turn-check-)/.test(entry)), [], diagnostic);
  assert.ok(!(await readdir(root)).includes("forbidden.png"), diagnostic);
});

test("an exited browser with inherited stdio cannot hang profile cleanup", { timeout: 15000 }, async (t) => {
  const { closeChrome } = await import("./chrome-port.mjs");
  const root = await mkdtemp(join(tmpdir(), "anatomy-inherited-stdio-"));
  const parent = spawn(process.execPath, ["-e", 'const {spawn}=require("node:child_process");const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{detached:true,windowsHide:true,stdio:["ignore","inherit","inherit"]});console.log(child.pid);child.unref()']);
  let descendant;
  t.after(async () => {
    if (descendant) {
      try { process.kill(descendant, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    parent.stdout.destroy();
    parent.stderr.destroy();
    await rm(root, { recursive: true, force: true });
  });
  const exited = once(parent, "exit");
  const [chunk] = await once(parent.stdout, "data");
  descendant = Number(String(chunk).trim());
  assert.ok(Number.isInteger(descendant) && descendant > 0);
  await exited;
  process.kill(descendant, 0);
  await assert.rejects(closeChrome(parent, root), (error) => error.code === "CHROME_CLOSE_TIMEOUT");
  await assert.rejects(access(root), (error) => error.code === "ENOENT");
});
