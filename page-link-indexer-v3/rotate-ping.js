/**
 * rotate-ping.js
 *
 * Fully-automatic batch runner:
 * - Shorten long URLs (uses src/shorteners.js bulkShorten)
 * - Ping the resulting short links (uses src/ping-short-links.js pingAllShortLinks)
 * - Rotate Windscribe location between batches
 *
 * Requirements:
 * - Windscribe CLI installed (default path below) OR set WINDSCRIBE_CLI_PATH
 * - You are already logged in to Windscribe in the CLI
 *
 * Usage:
 *   node rotate-ping.js --file urls.txt
 *   node rotate-ping.js https://example.com/a https://example.com/b
 *
 * Optional env:
 *   WINDSCRIBE_CLI_PATH="C:\Program Files\Windscribe\windscribe-cli.exe"
 *   PINGS_PER_LOCATION=200
 *   WIND_CONNECT_WAIT_MS=10000
 *   ROTATE_PAUSE_MIN_MS=120000
 *   ROTATE_PAUSE_MAX_MS=180000
 */

const fs = require("fs");
const util = require("util");
const { execFile } = require("child_process");
const execFileAsync = util.promisify(execFile);

const { bulkShorten } = require("./src/shorteners");
const { pingAllShortLinks } = require("./src/ping-short-links");

const CLI_PATH =
  process.env.WINDSCRIBE_CLI_PATH || "C:\\Program Files\\Windscribe\\windscribe-cli.exe";

// Windscribe v2 CLI expects targets like:
// - best
// - ISO country codes: US, CA, GB, ...
// - CityName / Nickname (as shown in CLI output): London, Toronto, etc.
//
// IMPORTANT: The older "Country - City" strings often do NOT work.
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
  // City names (if enabled in your plan/build)
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

function parseTargetsEnv() {
  const raw = String(process.env.WIND_TARGETS || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getTargets() {
  return parseTargetsEnv() || DEFAULT_TARGETS;
}

function parseCsvEnv(name) {
  const raw = String(process.env[name] || "").trim();
  if (!raw) return null;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

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

function isIpCheckEnabled() {
  const v = String(process.env.CHECK_IP || "").toLowerCase().trim();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

async function getPublicIp({ timeoutMs = 8000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(new Error("IP check timeout")), timeoutMs);
  try {
    // ipify is simple/reliable
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    if (!res.ok) throw new Error(`IP check failed: ${res.status}`);
    const data = await res.json();
    const ip = data && data.ip ? String(data.ip).trim() : "";
    if (!ip) throw new Error("IP check missing ip field");
    return ip;
  } finally {
    clearTimeout(t);
  }
}

async function windscribe(args, { timeoutMs = 60_000 } = {}) {
  // execFile avoids quoting issues on Windows.
  try {
    const { stdout, stderr } = await execFileAsync(CLI_PATH, args, {
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

async function getStatus() {
  const { stdout } = await windscribe(["status"], { timeoutMs: 30_000 });
  return stdout;
}

function statusLooksConnected(statusText) {
  const t = String(statusText || "");
  return /connected/i.test(t) && !/disconnected/i.test(t);
}

function outputLooksConnected(stdout) {
  const t = String(stdout || "");
  // Examples:
  // "*Connected: London - 1984"
  // "Connected: London - 1984"
  return /\bConnected\b/i.test(t) && !/\bDisconnected\b/i.test(t);
}

async function switchLocation({ connectWaitMs = 10_000, maxAttempts = 5 } = {}) {
  const targets = getTargets();
  const tried = new Set();
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = targets.filter((l) => !tried.has(l));
    const target = pickRandom(remaining.length ? remaining : targets);
    tried.add(target);

    console.log(`Switching to ${target}...`);
    try {
      const { stdout } = await windscribe(["connect", target, "-n"], { timeoutMs: 90_000 });
      await sleep(connectWaitMs);
      // Prefer parsing connect output; status output is not always reliable on Windows builds.
      if (outputLooksConnected(stdout)) {
        if (isIpCheckEnabled()) {
          try {
            const ip = await getPublicIp();
            console.log(`Connected (via connect output): ${target} | IP: ${ip}`);
          } catch (e) {
            console.log(`Connected (via connect output): ${target} | IP: (unavailable: ${e.message})`);
          }
        } else {
          console.log(`Connected (via connect output): ${target}`);
        }
        return { ok: true, location: target };
      }

      // Fallback to status check.
      const status = await getStatus();
      if (statusLooksConnected(status)) {
        if (isIpCheckEnabled()) {
          try {
            const ip = await getPublicIp();
            console.log(`Connected (via status): ${target} | IP: ${ip}`);
          } catch (e) {
            console.log(`Connected (via status): ${target} | IP: (unavailable: ${e.message})`);
          }
        } else {
          console.log(`Connected (via status): ${target}`);
        }
        return { ok: true, location: target };
      }

      throw new Error("Not connected (connect output + status check failed)");
    } catch (err) {
      const stderr = err && err.details && err.details.stderr ? String(err.details.stderr).trim() : "";
      const extra = stderr ? ` | stderr: ${stderr.split(/\r?\n/g)[0]}` : "";
      console.error(`Failed to connect to ${target}: ${err.message}${extra}`);
      // Best-effort disconnect before trying next location.
      try {
        await disconnect();
      } catch {
        // ignore
      }
      await sleep(1500);
    }
  }

  return { ok: false, location: null };
}

async function disconnect() {
  try {
    await windscribe(["disconnect"], { timeoutMs: 60_000 });
    if (isIpCheckEnabled()) {
      try {
        const ip = await getPublicIp();
        console.log(`Disconnected | IP: ${ip}`);
      } catch (e) {
        console.log(`Disconnected | IP: (unavailable: ${e.message})`);
      }
    } else {
      console.log("Disconnected");
    }
  } catch (err) {
    const stderr = err && err.details && err.details.stderr ? String(err.details.stderr).trim() : "";
    const extra = stderr ? ` | stderr: ${stderr.split(/\r?\n/g)[0]}` : "";
    console.error(`Disconnect failed: ${err.message}${extra}`);
  }
}

async function rotateIpDuringPause(pauseMs) {
  const started = Date.now();
  console.log(`Pausing ${Math.round(pauseMs / 1000)}s and rotating IP...`);

  // Rotate by switching to a new target (more reliable than ip rotate for many accounts/builds).
  // Do the rotation at the beginning of the pause so it happens "during the pause".
  await disconnect();
  const conn = await switchLocation({ connectWaitMs: Number(process.env.WIND_CONNECT_WAIT_MS || 10_000) });
  if (!conn.ok) console.warn("IP rotation: could not connect to any target.");

  const elapsed = Date.now() - started;
  const remaining = Math.max(0, pauseMs - elapsed);
  if (remaining > 0) await sleep(remaining);
}

function readUrlsFromFile(p) {
  const raw = fs.readFileSync(p, "utf8");
  return raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => !s.startsWith("#"));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const fileIdx = args.indexOf("--file");
  const file = fileIdx !== -1 ? args[fileIdx + 1] : null;
  const urlsFromArgs = args.filter((a) => !a.startsWith("--")).filter((a) => /^https?:\/\//i.test(a));
  return { file, urlsFromArgs };
}

async function runWithRotation(myUrls, pingsPerLocation = 250) {
  const pingsPerLoc = Math.max(1, Number(pingsPerLocation || 250));
  const connectWaitMs = Number(process.env.WIND_CONNECT_WAIT_MS || 10_000);
  const pauseMinMs = Number(process.env.ROTATE_PAUSE_MIN_MS || 120_000);
  const pauseMaxMs = Number(process.env.ROTATE_PAUSE_MAX_MS || 180_000);

  // 1) Shorten all first (one short link per input URL)
  console.log(`Shortening ${myUrls.length} URL(s)…`);
  const shortened = await bulkShorten(myUrls, {
    delayMinMs: Number(process.env.SHORTEN_DELAY_MIN_MS || 1500),
    delayMaxMs: Number(process.env.SHORTEN_DELAY_MAX_MS || 4500),
    maxRetries: Number(process.env.SHORTEN_MAX_RETRIES || 2),
    timeoutMs: Number(process.env.SHORTEN_TIMEOUT_MS || 15000),
    cuttlyApiKey: process.env.CUTTLY_API_KEY || undefined,
    verbose: String(process.env.SHORTEN_VERBOSE || "").trim() !== "",
  });

  const shortOnly = shortened.filter((x) => x && x.short);
  if (!shortOnly.length) throw new Error("No short links were generated (all shorteners failed?)");

  console.log(`Short links ready: ${shortOnly.length}/${shortened.length}`);

  let done = 0;
  let skippedBatches = 0;

  // 2) Rotate per batch
  for (let i = 0; i < shortOnly.length; i += pingsPerLoc) {
    const batch = shortOnly.slice(i, i + pingsPerLoc);

    const conn = await switchLocation({ connectWaitMs });
    if (!conn.ok) {
      console.warn("Could not connect to any location; skipping this batch.");
      skippedBatches++;
      continue;
    }

    try {
      await pingAllShortLinks(batch, {
        // Keep using your existing respectful pacing limits in bulk-ping-indexer.js
        endpoints: parseCsvEnv("PING_ENDPOINTS") || undefined,
        maxPingsPerMinute: Number(process.env.PING_MAX_PER_MINUTE || 3),
        dailyMaxTotal: Number(process.env.PING_DAILY_MAX_TOTAL || 250),
        dailyMaxPerEndpoint: Number(process.env.PING_DAILY_MAX_PER_ENDPOINT || 90),
        delayMinMs: Number(process.env.PING_DELAY_MIN_MS || 3000),
        delayMaxMs: Number(process.env.PING_DELAY_MAX_MS || 15000),
        retryMax: Number(process.env.PING_RETRY_MAX || 2),
        backoffMinMs: Number(process.env.PING_BACKOFF_MIN_MS || 5 * 60 * 1000),
        backoffMaxMs: Number(process.env.PING_BACKOFF_MAX_MS || 30 * 60 * 1000),
        timeoutMs: Number(process.env.PING_TIMEOUT_MS || 12000),
      });

      done += batch.length;
      console.log(`Pings done: ${done}/${shortOnly.length}`);
    } catch (err) {
      console.error(`Batch error: ${err.message}`);
    } finally {
      // If more work remains, rotate during a 2–3 minute pause.
      const isLastBatch = i + pingsPerLoc >= shortOnly.length;
      if (!isLastBatch) {
        const pauseMs = randMs(pauseMinMs, pauseMaxMs);
        await rotateIpDuringPause(pauseMs);
      } else {
        await disconnect();
      }
    }
  }

  console.log(`All done: sent ${done}/${shortOnly.length} pings${skippedBatches ? ` (skipped batches: ${skippedBatches})` : ""}.`);
}

async function main() {
  const { file, urlsFromArgs } = parseArgs(process.argv);
  const urls = file ? readUrlsFromFile(file) : urlsFromArgs;

  if (!fs.existsSync(CLI_PATH)) {
    console.error(`Windscribe CLI not found at: ${CLI_PATH}`);
    console.error(`Set WINDSCRIBE_CLI_PATH to your windscribe-cli.exe path and retry.`);
    process.exit(1);
  }

  if (!urls.length) {
    console.log("Usage: node rotate-ping.js --file urls.txt");
    console.log("   or: node rotate-ping.js <url1> <url2> ...");
    process.exit(1);
  }

  const pingsPerLocation = Number(process.env.PINGS_PER_LOCATION || 200);
  await runWithRotation(urls, pingsPerLocation);
}

main().catch(async (e) => {
  console.error(`Fatal: ${e.message}`);
  try {
    await disconnect();
  } catch {
    // ignore
  }
  process.exit(1);
});

