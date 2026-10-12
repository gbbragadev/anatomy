import { rmSync } from "node:fs";

export async function closeChrome(chrome, profile) {
  const running = chrome?.pid && chrome.exitCode === null && chrome.signalCode === null;
  const pipesOpen = (chrome?.stdout && !chrome.stdout.closed) || (chrome?.stderr && !chrome.stderr.closed);
  let closeError;
  try {
    if (chrome?.pid && (running || pipesOpen)) {
      await new Promise((done, fail) => {
        const finish = (error) => {
          clearTimeout(timer);
          chrome.off("close", closed);
          if (error) fail(error);
          else done();
        };
        const closed = () => finish();
        const timer = setTimeout(() => finish(Object.assign(new Error("Chrome did not close within 5000 ms"), {
          code: "CHROME_CLOSE_TIMEOUT", stage: "chrome-close", timeoutMs: 5000,
        })), 5000);
        chrome.once("close", closed);
        if (running) {
          try { chrome.kill("SIGKILL"); } catch (error) { finish(error); }
        }
      });
    }
  } catch (error) {
    closeError = error;
  }
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch (error) {
    if (closeError) closeError.cleanupError = error;
    else throw error;
  }
  if (closeError) throw closeError;
}

export async function chromePort(chrome, profile) {
  try {
    return await new Promise((done, fail) => {
      let text = "";
      const clean = () => {
        clearTimeout(timer);
        chrome.stderr.off("data", data);
        chrome.off("error", error);
        chrome.off("exit", exited);
      };
      const error = (cause) => {
        clean();
        fail(cause);
      };
      const exited = (code, signal) => error(new Error(`Chrome exited before startup: ${code ?? signal}`));
      const data = (chunk) => {
        text += chunk;
        const match = text.match(/DevTools listening on ws:\/\/[^:]+:(\d+)\//);
        if (match) {
          clean();
          done(Number(match[1]));
        }
      };
      const timer = setTimeout(() => error(new Error("Chrome did not start")), 20000);
      chrome.stderr.on("data", data);
      chrome.on("error", error);
      chrome.on("exit", exited);
    });
  } catch (error) {
    try { await closeChrome(chrome, profile); } catch (cleanupError) { error.cleanupError = cleanupError; }
    throw error;
  }
}
