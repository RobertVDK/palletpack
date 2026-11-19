// Pulls the full public Shopify catalogue from northerngecko.net (northerngecko.com redirects here).
// Paced + retrying because the storefront rate-limits bursts ("local_rate_limited").
// Output: data/raw/products-N.json (one file per page of 250). Start at a later page with `node … 3`.
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const BASE = "https://www.northerngecko.net";
const OUT = path.resolve("data/raw");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(page) {
  for (let attempt = 1; attempt <= 14; attempt++) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 150_000);
      const res = await fetch(`${BASE}/products.json?limit=250&page=${page}`, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        signal: ctrl.signal,
      });
      const text = await res.text();
      clearTimeout(t);
      if (res.status === 429 || text.startsWith("local_rate_limited")) {
        const wait = Math.min(180_000 * attempt, 600_000);
        console.log(`page ${page}: rate limited, waiting ${wait / 1000}s`);
        await sleep(wait);
        continue;
      }
      const json = JSON.parse(text);
      return json.products ?? [];
    } catch (e) {
      const wait = 10_000 * attempt;
      console.log(`page ${page}: ${e.name === "AbortError" ? "timeout" : e.message}; retry in ${wait / 1000}s`);
      await sleep(wait);
    }
  }
  throw new Error(`page ${page} failed after retries`);
}

await mkdir(OUT, { recursive: true });
// Pages already on disk are kept: a run that hits the rate limit never loses earlier pages.

let total = 0;
for (let page = Number(process.argv[2] ?? 1); page < 100; page++) {
  const products = await fetchPage(page);
  if (!products.length) break;
  await writeFile(path.join(OUT, `products-${page}.json`), JSON.stringify({ products }));
  total += products.length;
  console.log(`page ${page}: ${products.length} products (total ${total})`);
  await sleep(12_000);
}
console.log(`DONE ${total}`);
