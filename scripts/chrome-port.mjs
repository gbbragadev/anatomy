import { rmSync } from "node:fs";

export async function closeChrome(chrome, profile) {
  try {
    if (chrome?.pid && chrome.exitCode === null && chrome.signalCode === null) {
      await new Promise((done, fail) => {
        const finish = (error) => {
          clearTimeout(timer);
          chrome.off("exit", exited);
          if (error) fail(error);
          else done();
        };
        const exited = () => finish();
        const timer = setTimeout(() => finish(new Error("Chrome did not exit within 5000 ms")), 5000);
        chrome.once("exit", exited);
        try { chrome.kill("SIGKILL"); } catch (error) { finish(error); }
      });
    }
  } catch (error) {
    console.warn("Chrome process cleanup warning:", error);
  } finally {
    try { chrome?.stdout?.destroy(); } catch (error) { console.warn("Chrome stdout cleanup warning:", error); }
    try { chrome?.stderr?.destroy(); } catch (error) { console.warn("Chrome stderr cleanup warning:", error); }
  }
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (error) {
    console.warn("Chrome profile cleanup warning:", error);
  }
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
    await closeChrome(chrome, profile);
    throw error;
  }
}
