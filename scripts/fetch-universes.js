#!/usr/bin/env node
/**
 * Fetches NIFTY universe lists (50, 100, 200, 250, 500) from GitHub.
 * Run: npm run fetch-universes
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const DATA_DIR = path.join(__dirname, "..", "data", "universes");
const BASE = "https://raw.githubusercontent.com/hazeyblu/NSE_Yahoo_tickers/master";

const SOURCES = {
  nifty50: "NIFTY50.csv",
  nifty100: "NIFTY100.csv",
  nifty200: "ind_nifty200list.csv",
  nifty500: "NIFTY500.csv",
};

function fetch(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = https.request(
      {
        hostname: urlObj.hostname,
        path: urlObj.pathname,
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
          else resolve(data);
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

function parseCSV(csv) {
  const lines = csv.trim().split("\n").slice(1);
  return lines
    .map((line) => {
      const parts = line.split(",");
      const sym = parts[1] || parts[parts.length - 2];
      return (sym || "").replace(/\.NS$/i, "").trim();
    })
    .filter(Boolean);
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });

  for (const [name, file] of Object.entries(SOURCES)) {
    try {
      const url = `${BASE}/${file}`;
      const csv = await fetch(url);
      const symbols = parseCSV(csv);
      const outPath = path.join(DATA_DIR, `${name}.json`);
      fs.writeFileSync(outPath, JSON.stringify(symbols, null, 2));
      console.log(`${name}: ${symbols.length} symbols -> ${outPath}`);
    } catch (e) {
      console.error(`${name}: FAILED -`, e.message);
    }
  }

  const nifty500Path = path.join(DATA_DIR, "nifty500.json");
  if (fs.existsSync(nifty500Path)) {
    const nifty500 = JSON.parse(fs.readFileSync(nifty500Path));
    const nifty250 = nifty500.slice(0, 250);
    const nifty250Path = path.join(DATA_DIR, "nifty250.json");
    fs.writeFileSync(nifty250Path, JSON.stringify(nifty250, null, 2));
    console.log(`nifty250: ${nifty250.length} symbols (from nifty500) -> ${nifty250Path}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
