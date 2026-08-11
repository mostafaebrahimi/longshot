/**
 * Just enough Chrome DevTools Protocol to drive a headless browser with the
 * extension loaded.
 *
 * Branded Google Chrome refuses --load-extension, so these helpers expect a
 * Chrome for Testing binary in CHROME_BIN:
 *
 *   npx @puppeteer/browsers install chrome@stable --path /tmp/browsers
 *
 * The transport is --remote-debugging-pipe (NUL-delimited JSON on fds 3 and 4)
 * because that is the mode extension loading is allowed in.
 */
import { spawn } from "node:child_process";
import { mkdtemp, readFile, cp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Pipe {
  constructor(child) {
    this.child = child;
    this.out = child.stdio[3];
    this.id = 0;
    this.pending = new Map();
    let buffer = "";
    child.stdio[4].on("data", (chunk) => {
      buffer += chunk.toString();
      let at;
      while ((at = buffer.indexOf("\0")) !== -1) {
        const raw = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        if (!raw) continue;
        const msg = JSON.parse(raw);
        const p = this.pending.get(msg.id);
        if (!p) continue;
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
      }
    });
  }

  send(method, params = {}, sessionId) {
    const id = ++this.id;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.out.write(JSON.stringify(payload) + "\0");
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  async attach(targetId) {
    const { sessionId } = await this.send("Target.attachToTarget", { targetId, flatten: true });
    return new Session(this, sessionId);
  }

  async targets() {
    try {
      const { targetInfos } = await this.send("Target.getTargets");
      return targetInfos;
    } catch {
      return [];
    }
  }

  async waitForTarget(predicate, { timeoutMs = 20000, label = "target" } = {}) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const found = (await this.targets()).find(predicate);
      if (found) return found;
      await sleep(250);
    }
    throw new Error(`Timed out waiting for ${label}`);
  }
}

export class Session {
  constructor(pipe, sessionId) {
    this.pipe = pipe;
    this.sessionId = sessionId;
  }
  send(method, params) {
    return this.pipe.send(method, params, this.sessionId);
  }
  async eval(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description || "evaluation failed");
    }
    return r.result.value;
  }
}

/**
 * Copy the extension somewhere temporary, widen its host permissions (nothing
 * here can produce the click that grants activeTab), and start Chrome on it.
 */
export async function launchWithExtension(root, { width = 1280, height = 800, quiet = true } = {}) {
  const workdir = await mkdtemp(join(tmpdir(), "longshot-"));
  const extDir = join(workdir, "ext");
  const profile = join(workdir, "profile");

  // Match on the path relative to the root: an absolute filter would exclude
  // everything whenever the checkout itself sits under a "dist" or ".git" path.
  const SKIP = /^(node_modules|\.git|dist|store[/\\]screenshots)/;
  await cp(root, extDir, {
    recursive: true,
    filter: (src) => src === root || !SKIP.test(relative(root, src)),
  });
  const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8"));
  manifest.host_permissions = ["<all_urls>"];
  await writeFile(join(extDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  const child = spawn(
    process.env.CHROME_BIN || "google-chrome",
    [
      "--headless=new",
      "--remote-debugging-pipe",
      "--enable-unsafe-extension-debugging",
      `--user-data-dir=${profile}`,
      `--load-extension=${extDir}`,
      `--disable-extensions-except=${extDir}`,
      `--window-size=${width},${height}`,
      "--force-device-scale-factor=1",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-features=Translate,DialMediaRouteProvider",
      // CI images that forbid unprivileged user namespaces need --no-sandbox
      // here, or Chrome dies before the debugging pipe is up.
      ...(process.env.CHROME_EXTRA_FLAGS || "").split(/\s+/).filter(Boolean),
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"] }
  );
  child.stderr.on("data", (d) => {
    const s = String(d);
    if (quiet) return;
    if (/ERROR:|Uncaught|not allowed/.test(s) && !/DevTools|Fontconfig|GPU|dbus|Vulkan|gcm/i.test(s)) {
      process.stderr.write(`  chrome: ${s}`);
    }
  });

  const pipe = new Pipe(child);
  const cleanup = async () => {
    child.kill();
    await sleep(500);
    await rm(workdir, { recursive: true, force: true }).catch(() => {});
  };
  return { pipe, child, extDir, cleanup };
}

/** Wait for the extension's service worker and return a session on it. */
export async function attachToWorker(pipe) {
  const target = await pipe.waitForTarget(
    (t) => t.type === "service_worker" && t.url.includes("service-worker.js"),
    { timeoutMs: 25000, label: "the extension service worker" }
  );
  return { session: await pipe.attach(target.targetId), extensionId: new URL(target.url).host };
}

/**
 * Point the tab Chrome started with at `url` and make it active. Tabs created
 * after startup are never laid out in headless mode, so they measure 0x0.
 */
export async function openInStartupTab(worker, url) {
  return await worker.eval(`(async () => {
    for (const t of await chrome.tabs.query({})) {
      if ((t.url || t.pendingUrl || "").includes("options.html")) await chrome.tabs.remove(t.id);
    }
    const blank = (await chrome.tabs.query({}))[0];
    await chrome.tabs.update(blank.id, {url: ${JSON.stringify(url)}, active: true});
    return blank.id;
  })()`);
}
