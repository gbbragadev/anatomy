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
  await closeChrome(parent, root);
  assert.equal(parent.stdout.destroyed, true);
  assert.equal(parent.stderr.destroyed, true);
  await assert.rejects(access(root), (error) => error.code === "ENOENT");
});

test("a locked profile warns without failing completed work", { skip: process.platform !== "win32", timeout: 30000 }, async (t) => {
  const root = await mkdtemp(join(tmpdir(), "anatomy-locked-profile-"));
  let holder;
  t.after(async () => {
    if (holder) {
      try { process.kill(holder, "SIGKILL"); } catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });
  const source = `const {spawn}=await import("node:child_process");const {once}=await import("node:events");const child=spawn(process.execPath,["-e","process.send('ready');setInterval(()=>{},1000)"],{cwd:process.argv[1],detached:true,windowsHide:true,stdio:["ignore","ignore","ignore","ipc"]});await once(child,"message");child.disconnect();child.unref();console.log("holder:"+child.pid);const {closeChrome}=await import(process.argv[2]);const result=1+1;await closeChrome(undefined,process.argv[1]);console.log("result:"+result);`;
  let result;
  try {
    result = { code: 0, ...await execute(process.execPath, ["--input-type=module", "-e", source, root, new URL("chrome-port.mjs", import.meta.url).href], { timeout: 20000 }) };
  } catch (error) {
    result = { code: error.code, stdout: error.stdout ?? "", stderr: error.stderr ?? "" };
  }
  holder = Number(/holder:(\d+)/.exec(result.stdout)?.[1]);
  assert.ok(Number.isInteger(holder) && holder > 0, JSON.stringify(result));
  assert.equal(result.code, 0, JSON.stringify(result));
  assert.match(result.stdout, /result:2/);
  assert.match(result.stderr, /EPERM|EBUSY/);
  await access(root);
});
