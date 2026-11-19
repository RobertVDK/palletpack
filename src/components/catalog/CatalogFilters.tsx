"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";

export function CatalogFilters({ categories, values }: { categories: { name: string; count: number }[]; values: Record<string, string | undefined> }) {
  const router = useRouter();
  const pathname = usePathname();
  const [q, setQ] = useState(values.q ?? "");

  const push = (patch: Record<string, string>) => {
    const next = new URLSearchParams(Object.entries({ ...values, ...patch, page: "1" }).filter(([, v]) => v) as [string, string][]);
    router.push(`${pathname}?${next}`);
  };

  // Search as you type, debounced.
  useEffect(() => {
    if ((values.q ?? "") === q) return;
    const t = setTimeout(() => push({ q }), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const select = "h-10 rounded-lg border border-steel-700 bg-steel-850 px-3 text-sm text-steel-100 outline-none focus:border-signal";
  return (
    <div className="mt-6 flex flex-wrap gap-2">
      <label className="relative min-w-[240px] flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-steel-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search 1,894 products"
          className="h-10 w-full rounded-lg border border-steel-700 bg-steel-850 pr-3 pl-9 text-sm text-steel-50 outline-none placeholder:text-steel-500 focus:border-signal"
          aria-label="Search products"
        />
      </label>
      <select className={select} value={values.cat ?? ""} onChange={(e) => push({ cat: e.target.value })} aria-label="Category">
        <option value="">All categories</option>
        {categories.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name} ({c.count})
          </option>
        ))}
      </select>
      <select className={select} value={values.src ?? ""} onChange={(e) => push({ src: e.target.value })} aria-label="Dimension source">
        <option value="">Any size source</option>
        <option value="estimated">Estimated sizes</option>
        <option value="listing">From the listing</option>
        <option value="measured">Measured on the floor</option>
      </select>
      <select className={select} value={values.handling ?? ""} onChange={(e) => push({ handling: e.target.value })} aria-label="Handling">
        <option value="">Any handling</option>
        <option value="standard">Standard</option>
        <option value="live">Live</option>
        <option value="frozen">Frozen</option>
      </select>
    </div>
  );
}
