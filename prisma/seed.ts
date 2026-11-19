import "dotenv/config";
import { readFileSync } from "node:fs";
import { createPrisma } from "../src/lib/prisma-client";
import { defaultBoxes, defaultPallet } from "../src/lib/catalogue/boxes";
import { containerToRow, SETTINGS_KEY } from "../src/lib/domain";
import { DEFAULT_OPTIONS } from "../src/lib/packing/types";
import { generateOrder, mulberry32 } from "../src/lib/orders/generate";
import { bookOrder, createOrder, planOrder, productPool, quoteOrder, saveChecks, type PackageCheck } from "../src/lib/service";
import type { CatalogProduct } from "../scripts/build-catalog";

const db = createPrisma();

async function main() {
  const catalog = JSON.parse(readFileSync("data/catalog.json", "utf8")) as CatalogProduct[];
  console.log(`Seeding ${catalog.length} products…`);

  await db.shipment.deleteMany();
  await db.orderLine.deleteMany();
  await db.order.deleteMany();
  await db.product.deleteMany();
  await db.container.deleteMany();
  await db.setting.deleteMany();

  for (let i = 0; i < catalog.length; i += 250) {
    await db.product.createMany({
      data: catalog.slice(i, i + 250).map((p) => ({
        id: p.id,
        handle: p.handle,
        title: p.title,
        url: p.url,
        image: p.image,
        vendor: p.vendor,
        productType: p.productType,
        category: p.category,
        priceCents: p.priceCents,
        sku: p.sku,
        length: p.dims.l,
        width: p.dims.w,
        height: p.dims.h,
        dimsSource: p.dimsSource,
        dimsNote: p.dimsNote,
        weight: p.weight,
        weightSource: p.weightSource,
        weightNote: p.weightNote,
        handling: p.handling,
        fragile: p.fragile,
        keepUpright: p.keepUpright,
        shipsInOwnBox: p.shipsInOwnBox,
        maxLoad: p.maxLoad,
        requiresShipping: p.requiresShipping,
        pickupOnly: p.pickupOnly,
      })),
    });
  }

  const containers = [...defaultBoxes(), defaultPallet()];
  await db.container.createMany({ data: containers.map((c, i) => containerToRow(c, i)) });
  await db.setting.create({ data: { key: SETTINGS_KEY, value: JSON.stringify(DEFAULT_OPTIONS) } });

  const pool = await productPool(db);
  const now = Date.now();
  const rng = mulberry32(20261118);

  // Already shipped earlier today – fills the shipments history.
  const history = ["starter", "bioactive", "mixed", "lighting"];
  for (const [i, key] of history.entries()) {
    const order = await createOrder(db, generateOrder(pool, rng, key), new Date(now - (9 - i) * 3600_000));
    const { checks } = await planOrder(db, order.id);
    await saveChecks(
      db,
      order.id,
      checks.map((c: PackageCheck) => ({ ...c, status: "approved", at: new Date().toISOString() })),
    );
    const { quotes } = await quoteOrder(db, order.id);
    const pickQuote = quotes.find((q) => q.tags.includes("best value")) ?? quotes[0];
    await bookOrder(db, order.id, pickQuote.id, rng);
    await db.shipment.update({ where: { orderId: order.id }, data: { shippedAt: new Date(now - (8 - i) * 3600_000) } });
  }

  // Waiting in the queue.
  const queue = ["bioactive", "live", "restock", "starter", "lighting", "feeders", "two-tanks", "mixed"];
  for (const [i, key] of queue.entries()) {
    await createOrder(db, generateOrder(pool, rng, key), new Date(now - (queue.length - i) * 11 * 60_000));
  }

  const counts = await Promise.all([db.product.count(), db.container.count(), db.order.count(), db.shipment.count()]);
  console.log(`products ${counts[0]} · containers ${counts[1]} · orders ${counts[2]} · shipments ${counts[3]}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
