import Link from "next/link";
import { prisma } from "@/lib/db";
import { cdnImage } from "@/lib/domain";
import type { Prisma } from "@/generated/prisma/client";
import { CatalogFilters } from "@/components/catalog/CatalogFilters";
import { ProductGrid, type GridProduct } from "@/components/catalog/ProductGrid";

export const dynamic = "force-dynamic";

const PAGE = 48;

export default async function CatalogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1));
  const where: Prisma.ProductWhereInput = {
    ...(sp.q ? { title: { contains: sp.q } } : {}),
    ...(sp.cat ? { category: sp.cat } : {}),
    ...(sp.src ? { dimsSource: sp.src } : {}),
    ...(sp.handling ? { handling: sp.handling } : {}),
  };

  const [total, filtered, bySource, categories, rows] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where }),
    prisma.product.groupBy({ by: ["dimsSource"], _count: { _all: true } }),
    prisma.product.groupBy({ by: ["category"], _count: { _all: true }, orderBy: { category: "asc" } }),
    prisma.product.findMany({ where, orderBy: [{ handling: "asc" }, { category: "asc" }, { title: "asc" }], skip: (page - 1) * PAGE, take: PAGE }),
  ]);
  const count = (s: string) => bySource.find((b) => b.dimsSource === s)?._count._all ?? 0;
  const pages = Math.max(1, Math.ceil(filtered / PAGE));
  const products: GridProduct[] = rows.map((p) => ({
    id: p.id,
    title: p.title,
    url: p.url,
    image: cdnImage(p.image, 400),
    category: p.category,
    sku: p.sku,
    priceCents: p.priceCents,
    dims: { l: p.length, w: p.width, h: p.height },
    dimsSource: p.dimsSource,
    dimsNote: p.dimsNote,
    weight: p.weight,
    weightSource: p.weightSource,
    weightNote: p.weightNote,
    handling: p.handling,
    fragile: p.fragile,
    keepUpright: p.keepUpright,
    shipsInOwnBox: p.shipsInOwnBox,
    pickupOnly: p.pickupOnly,
    requiresShipping: p.requiresShipping,
  }));

  const href = (n: number) => {
    const q = new URLSearchParams(Object.entries({ ...sp, page: String(n) }).filter(([, v]) => v) as [string, string][]);
    return `/catalog?${q}`;
  };

  return (
    <main className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="wide text-2xl font-black text-steel-50">Catalogue</h1>
          <p className="mt-1 max-w-2xl text-sm text-steel-300">
            Every product with a photo on northerngecko.net. Shipping sizes the listing didn&apos;t give us were estimated from the product type and the size in its
            title. Each one is marked <span className="font-semibold text-warn">Estimated</span>, and measuring it on the floor replaces the estimate.
          </p>
        </div>
        <dl className="flex gap-6 text-sm">
          <div>
            <dt className="text-xs text-steel-400">Products</dt>
            <dd className="wide text-xl font-black text-steel-50">{total.toLocaleString()}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel-400">Size from listing</dt>
            <dd className="wide text-xl font-black text-ok">{count("listing")}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel-400">Measured</dt>
            <dd className="wide text-xl font-black text-signal">{count("measured")}</dd>
          </div>
          <div>
            <dt className="text-xs text-steel-400">Estimated</dt>
            <dd className="wide text-xl font-black text-warn">{count("estimated").toLocaleString()}</dd>
          </div>
        </dl>
      </div>

      <CatalogFilters categories={categories.map((c) => ({ name: c.category, count: c._count._all }))} values={sp} />

      <p className="mt-4 mb-3 text-xs text-steel-400">
        {filtered.toLocaleString()} match{filtered === 1 ? "" : "es"} · page {page} of {pages}
      </p>
      <ProductGrid products={products} />

      {pages > 1 && (
        <nav className="mt-8 flex items-center justify-center gap-2 text-sm" aria-label="Pages">
          {page > 1 && (
            <Link href={href(page - 1)} className="rounded-md border border-steel-700 px-3 py-1.5 text-steel-200 hover:border-steel-500">
              Previous
            </Link>
          )}
          <span className="px-2 text-steel-400">
            {page} / {pages}
          </span>
          {page < pages && (
            <Link href={href(page + 1)} className="rounded-md border border-steel-700 px-3 py-1.5 text-steel-200 hover:border-steel-500">
              Next
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
