# PalletPack

3D carton and skid builder for Northern Gecko's warehouse. An order comes in, the engine decides **boxes (parcel) or a skid (LTL)** from the box sizes on the shelf, shows the build in 3D step by step, the packer **approves or re-measures/weighs** every package with big touch buttons, and the order gets **rated, booked and labelled**. Rates, tracking numbers and labels are demo data.

## Run it

```bash
pnpm install
pnpm db:setup     # prisma generate + create SQLite db + seed 1,894 products, box sizes, demo orders
pnpm dev          # http://localhost:3040
```

`pnpm db:reset` puts the demo back to a fresh queue (safe to run while the dev server is up). `pnpm test` runs the packing-engine tests.

## Five-minute demo

1. **Pack station** opens the oldest waiting order and builds it on the spot. Watch the timeline place each unit (with the product photo on it); the step line tells the packer where it goes ("back-left, layer 2, turned 90°, wrap in bubble first").
2. The **Ship as** card compares *Boxes · parcel* vs *Skid · LTL* in dollars and recommends one. Click the other to rebuild instantly.
3. Open **NG-… Pet store restock** (wholesale): 180+ units → 11 cartons → 1 skid. Toggle **X-ray** to see every unit inside every carton, **Explode** to pull the load apart, **Dimensions** for callouts. The yellow dot is the load's centre of gravity.
4. Open the **Crested gecko** order: live animals go in an insulated shipper with a heat pack, never mixed with dry goods and never on a skid.
5. **Confirm build and verify** → each package gets a big **Approve**, **Measure** (L/W/H/weight steppers) or **Weigh it** (simulated floor scale; flags readings more than 5% off plan).
6. **Get shipping rates** → demo carriers (Canada Post, Purolator, UPS, FedEx, Canpar, Loomis; Day & Ross, Manitoulin, TST-CF, Purolator Freight for LTL) with zone, dim weight, fuel, residential/liftgate, freight class, ETA and CO₂e. Live animals only see overnight services and the Mon–Wed ship rule.
7. **Book** → 4×6 thermal labels (Code 128), or a bill of lading + skid placards; cartons are drawn from stock.
8. **Simulate incoming order** (top right) drops a new order into the queue and builds it straight away.

## Sample data

`scripts/scrape-northerngecko.mjs` reads the public Shopify catalogue of **northerngecko.net** (northerngecko.com redirects there) and `scripts/build-catalog.ts` turns it into `data/catalog.json`:

- Every product with a photo (1,894). Photos load from Shopify's CDN.
- **Dimensions and weights that the listing doesn't give are made up** from the product's category and the size words/numbers in its title, and stored with `dimsSource: "estimated"` / `weightSource: "estimated"` plus a note saying how. The UI marks them **Estimated** everywhere; sizes read from a listing are **Listed**; saving a measurement in the Catalogue marks it **Measured**.
- Live animals, live feeders, glass enclosures (ship in maker's carton), fragile/upright items and pick-up-only listings are detected from titles.
- The storefront rate-limits `/products.json` hard; product sitemaps are used for the full list and the JSON feed (prices, grams) is merged in where it was reachable. Re-run `pnpm catalog:scrape && pnpm catalog:build && pnpm db:reset` to refresh (`pnpm catalog:scrape 2` resumes at page 2; pages already saved are kept).

Customer names, streets and businesses in demo orders are invented; cities and postal-code prefixes are real so distances are real.

## How the packer works (`src/lib/packing`)

- `extreme-point.ts`: 3D extreme-point placement with all 6 rotations (2 for keep-upright), gravity (min. supported base), load bearing (nothing crushes a fragile unit), contact-maximising scoring.
- `boxes.ts`: picks stock boxes by **lowest box cost + estimated postage**, so dimensional weight counts. Multi-start over item orderings, one-step lookahead on partial fills, memoised, budgeted. Live/frozen goods are packed apart in insulated shippers; enclosures ship in their own carton; anything no box fits ships as-is with edge protection.
- `pallet.ts`: stacks cartons on a 48×40 GMA skid: heavy and wide low, fragile last, 75% support, no overhang, height cap, centred load and centre-of-gravity check.
- `plan.ts`: builds both plans and recommends one (courier limits, small-order rule, cost); a near-empty extra skid is sent parcel when that's cheaper.
- `freight.ts`: dim weight (5000 cm³/kg), courier limits, additional handling, NMFC density class.

Box sizes, the skid and packing rules are editable on **Box sizes**.

## API

| Method | Path | What it does |
| --- | --- | --- |
| POST | `/api/webhooks/orders` | Order intake (storefront/ERP). Plans immediately and returns the packages. |
| POST | `/api/orders/simulate` | Creates a realistic demo order (`{ "scenario": "restock" }` optional). |
| POST | `/api/orders/:id/plan` | Builds the order (`{ "mode": "boxes" \| "skid" }` to force one). |
| PUT | `/api/orders/:id/checks` | Saves approved / measured / weighed packages. |
| POST | `/api/orders/:id/rates` | Demo rate shop for the verified packages. |
| POST | `/api/orders/:id/book` | Books a quote, returns labels, draws box stock. |

```bash
curl -X POST http://localhost:3040/api/webhooks/orders -H "content-type: application/json" -d '{
  "customer": "Test Buyer", "email": "buyer@example.com",
  "address1": "100 Demo St", "city": "Calgary", "province": "AB", "postal": "T2P 1J9",
  "lines": [{ "handle": "arcadia-prot5-uvb-kit-24", "qty": 1 }]
}'
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Prisma 7 (SQLite via better-sqlite3 for the demo; the schema maps to MariaDB) · three.js + React Three Fiber + drei · zustand · zod · Vitest · pnpm.
