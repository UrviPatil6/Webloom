const util = require("util");
const { execFile } = require("child_process");
const execFileAsync = util.promisify(execFile);

const { bulkPingBatch } = require("./bulk-ping-indexer");

const DEFAULT_CLI_PATH = "C:\\Program Files\\Windscribe\\windscribe-cli.exe";

// Targets compatible with windscribe-cli v2:
// - best
// - ISO country codes (US, CA, GB, ...)
// - CityName / Nickname (as shown by the app/CLI)
const DEFAULT_TARGETS = [
  "best",
  "US",
  "CA",
  "GB",
  "DE",
  "FR",
  "NL",
  "CH",
  "NO",
  "RO",
  "TR",
  "HK",
  "London",
  "Manchester",
  "Amsterdam",
  "Frankfurt",
  "Paris",
  "Zurich",
  "Oslo",
  "Bucharest",
  "Istanbul",
  "Hong Kong",
  "Vancouver",
  "Toronto",
  "Montreal",
  "New York",
  "Los Angeles",
  "Seattle",
  "Chicago",
  "Dallas",
  "Miami",
  "Atlanta",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function randMs(min, max) {
  const a = Math.floor(Number(min));
  const b = Math.floor(Number(max));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return Math.max(0, a || 0);
  return a + Math.floor(Math.random() * (b - a + 1));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function parseCsv(raw) {
  return String(raw || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTargets(rotationOptions = {}) {
  const env = parseCsv(process.env.WIND_TARGETS);
  if (env.length) return env;
  if (Array.isArray(rotationOptions.targets) && rotationOptions.targets.length) return rotationOptions.targets;
  return DEFAULT_TARGETS;
}

function outputLooksConnected(stdout) {
  const t = String(stdout || "");
  return /\bConnected\b/i.test(t) && !/\bDisconnected\b/i.test(t);
}

function statusLooksConnected(statusText) {
  const t = String(statusText || "");
  return /connected/i.test(t) && !/disconnected/i.test(t);
}

async function windscribe(cliPath, args, { timeoutMs = 90_000 } = {}) {
  const p = cliPath || process.env.WINDSCRIBE_CLI_PATH || DEFAULT_CLI_PATH;
  try {
    const { stdout, stderr } = await execFileAsync(p, args, {
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
    });
    return { stdout: String(stdout || ""), stderr: String(stderr || "") };
  } catch (err) {
    const code = err && typeof err.code !== "undefined" ? err.code : "unknown";
    const stdout = String((err && err.stdout) || "");
    const stderr = String((err && err.stderr) || "");
    const msg = err && err.message ? err.message : "Windscribe CLI command failed";
    const e = new Error(`${msg} (code: ${code})`);
    e.details = { code, stdout, stderr, args };
    throw e;
  }
}

async function getStatus(cliPath) {
  const { stdout } = await windscribe(cliPath, ["status"], { timeoutMs: 30_000 });
  return stdout;
}

async function disconnect(cliPath) {
  try {
    await windscribe(cliPath, ["disconnect"], { timeoutMs: 60_000 });
  } catch {
    // best-effort
  }
}

async function connectRandomTarget(cliPath, rotationOptions = {}) {
  const targets = getTargets(rotationOptions);
  const connectWaitMs = Number(rotationOptions.connectWaitMs ?? process.env.WIND_CONNECT_WAIT_MS ?? 10_000);
  const maxAttempts = Math.max(1, Number(rotationOptions.maxAttempts ?? 5));

  const tried = new Set();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = targets.filter((t) => !tried.has(t));
    const target = pickRandom(remaining.length ? remaining : targets);
    tried.add(target);

    // non-blocking connect; rely on output + small wait
    const { stdout } = await windscribe(cliPath, ["connect", target, "-n"], { timeoutMs: 90_000 });
    await sleep(connectWaitMs);

    if (outputLooksConnected(stdout)) return { ok: true, target };
    const status = await getStatus(cliPath);
    if (statusLooksConnected(status)) return { ok: true, target };

    await disconnect(cliPath);
    await sleep(1500);
  }

  return { ok: false, target: null };
}

/**
 * Run bulk pings in chunks, rotating Windscribe IP between chunks.
 *
 * rotationOptions:
 * - enabled: boolean
 * - chunkSize: number (default 200)
 * - pauseMinMs/pauseMaxMs: number (default 120000..180000)
 * - cliPath: string (optional)
 * - targets: string[] (optional)
 * - connectWaitMs: number (optional)
 */
async function bulkPingWithWindscribeRotation(urls, bulkOptions = {}, rotationOptions = {}) {
  const enabled = rotationOptions && rotationOptions.enabled === true;
  if (!enabled) {
    return await bulkPingBatch(urls, bulkOptions);
  }

  const cliPath = rotationOptions.cliPath || process.env.WINDSCRIBE_CLI_PATH || DEFAULT_CLI_PATH;
  const chunkSize = Math.max(1, Number(rotationOptions.chunkSize ?? process.env.BULK_PING_ROTATE_CHUNK_SIZE ?? 200));
  const pauseMinMs = Number(rotationOptions.pauseMinMs ?? process.env.BULK_PING_ROTATE_PAUSE_MIN_MS ?? 120_000);
  const pauseMaxMs = Number(rotationOptions.pauseMaxMs ?? process.env.BULK_PING_ROTATE_PAUSE_MAX_MS ?? 180_000);

  const conn = await connectRandomTarget(cliPath, rotationOptions);
  if (!conn.ok) throw new Error("Windscribe connect failed (no valid/available target)");

  try {
    for (let i = 0; i < urls.length; i += chunkSize) {
      const chunk = urls.slice(i, i + chunkSize);
      await bulkPingBatch(chunk, bulkOptions);

      const isLast = i + chunkSize >= urls.length;
      if (!isLast) {
        const pauseMs = randMs(pauseMinMs, pauseMaxMs);
        // Rotate during the pause
        const started = Date.now();
        await disconnect(cliPath);
        const conn2 = await connectRandomTarget(cliPath, rotationOptions);
        if (!conn2.ok) throw new Error("Windscribe rotation failed (could not reconnect)");
        const elapsed = Date.now() - started;
        const remaining = Math.max(0, pauseMs - elapsed);
        if (remaining > 0) await sleep(remaining);
      }
    }
  } finally {
    await disconnect(cliPath);
  }

  return [];
}

module.exports = { bulkPingWithWindscribeRotation };

