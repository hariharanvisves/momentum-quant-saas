#!/usr/bin/env node
/**
 * Fetches NIFTY 500 stock list from NSE or GitHub fallback.
 * Run: node scripts/fetch-nifty500.js
 */

const fs = require("fs");
const path = require("path");
const https = require("https");

const NIFTY500_PATH = path.join(__dirname, "..", "nifty500.json");

const GITHUB_URL = "https://raw.githubusercontent.com/hazeyblu/NSE_Yahoo_tickers/master/NIFTY500.csv";
const NSE_URL = "https://www.nseindia.com/content/indices/ind_nifty500list.csv";

function fetch(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...headers,
      },
    };
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode}`));
        else resolve(data);
      });
    });
    req.on("error", reject);
    req.end();
  });
}

async function fetchFromNSE() {
  try {
    await fetch("https://www.nseindia.com", {
      Referer: "https://www.nseindia.com/",
    });
    const csv = await fetch(NSE_URL, {
      Referer: "https://www.nseindia.com/",
      Accept: "text/csv",
    });
    return parseCSV(csv);
  } catch (e) {
    throw new Error(`NSE fetch failed: ${e.message}`);
  }
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

async function fetchFromGitHub() {
  const csv = await fetch(GITHUB_URL);
  return parseCSV(csv);
}

async function main() {
  console.log("Fetching NIFTY 500 list...");
  let symbols;
  try {
    symbols = await fetchFromNSE();
    console.log("Source: NSE");
  } catch (e) {
    console.warn("NSE unavailable, using GitHub fallback:", e.message);
    symbols = await fetchFromGitHub();
    console.log("Source: GitHub");
  }
  fs.writeFileSync(NIFTY500_PATH, JSON.stringify(symbols, null, 2));
  console.log(`Wrote ${symbols.length} symbols to nifty500.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
