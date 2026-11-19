"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useApp, type QueueOrder } from "@/components/app-store";
import type { OrderDetail } from "@/lib/queries";
import type { PackPlan, PlanMode } from "@/lib/packing/types";
import { OrderQueue } from "./OrderQueue";
import { Workspace } from "./Workspace";
import { SidePanel } from "./SidePanel";
import { stepFromStatus, useStation } from "./store";
export { findPackage } from "./store";

export function Station({ initialOrders, initialId }: { initialOrders: QueueOrder[]; initialId?: string }) {
  const router = useRouter();
  const [orders, setOrders] = useState(initialOrders);
  const [fresh, setFresh] = useState<string[]>([]);
  const set = useStation((s) => s.set);
  const detail = useStation((s) => s.detail);
  const opening = useRef<string | null>(null);

  const refreshQueue = useCallback(async () => {
    const res = await fetch("/api/orders");
    if (res.ok) setOrders(await res.json());
  }, []);

  const applyDetail = useCallback(
    (d: OrderDetail, opts: { animate: boolean; alternate?: PackPlan | null }) => {
      const plan = d.shipment?.plan;
      const first = plan?.packages[0];
      set({
        detail: d,
        alternate: opts.alternate ?? null,
        step: stepFromStatus(d.order.status),
        selected: first ? first.id : "all",
        build: opts.animate || !first ? 0 : first.placements.length,
        playing: opts.animate && !!first,
        exploded: false,
        xray: false,
        hover: null,
        showDims: false,
      });
    },
    [set],
  );

  const open = useCallback(
    async (id: string) => {
      opening.current = id;
      set({ loading: true });
      router.replace(`/?order=${id}`, { scroll: false });
      try {
        const res = await fetch(`/api/orders/${id}`);
        if (!res.ok) throw new Error("Order not found");
        let d = (await res.json()) as OrderDetail;
        let alternate: PackPlan | null = null;
        const isNew = !d.shipment;
        if (isNew) {
          // A new order is planned the moment it is opened.
          const r = await fetch(`/api/orders/${id}/plan`, { method: "POST", body: "{}" });
          const body = await r.json();
          d = body.detail;
          alternate = body.alternate;
        }
        if (opening.current !== id) return;
        applyDetail(d, { animate: isNew || d.order.status === "planned", alternate });
        if (isNew) refreshQueue();
      } catch (e) {
        toast.error("Could not open the order", { description: String(e) });
      } finally {
        if (opening.current === id) set({ loading: false });
      }
    },
    [applyDetail, refreshQueue, router, set],
  );

  const replan = useCallback(
    async (mode: PlanMode) => {
      if (!detail) return;
      set({ loading: true });
      const r = await fetch(`/api/orders/${detail.order.id}/plan`, { method: "POST", body: JSON.stringify({ mode }) });
      const body = await r.json();
      applyDetail(body.detail, { animate: true, alternate: body.alternate });
      set({ loading: false });
      refreshQueue();
    },
    [applyDetail, detail, refreshQueue, set],
  );

  const reload = useCallback(
    async (d?: OrderDetail) => {
      if (!detail) return;
      const next = d ?? ((await (await fetch(`/api/orders/${detail.order.id}`)).json()) as OrderDetail);
      set({ detail: next });
      refreshQueue();
    },
    [detail, refreshQueue, set],
  );

  // Pick up orders created from the top bar and animate them in, then open them: the build starts on its own.
  const openRef = useRef(open);
  useEffect(() => {
    openRef.current = open;
  }, [open]);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const unsubscribe = useApp.subscribe((s, prev) => {
      const added = s.arrivals.filter((a) => !prev.arrivals.some((p) => p.id === a.id));
      if (!added.length) return;
      setOrders((list) => [...added.filter((a) => !list.some((o) => o.id === a.id)), ...list]);
      setFresh((f) => [...added.map((a) => a.id), ...f]);
      timers.push(setTimeout(() => openRef.current(added[0].id), 650));
      timers.push(setTimeout(() => setFresh([]), 2500));
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, []);

  // Open the requested order (or the oldest waiting one) on first load / when the URL asks.
  useEffect(() => {
    const target = initialId ?? [...orders].reverse().find((o) => o.status === "new")?.id ?? orders[0]?.id;
    if (target && detail?.order.id !== target && opening.current !== target) open(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialId]);

  return (
    <div className="grid grid-cols-1 lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[300px_minmax(0,1fr)_380px] lg:overflow-hidden xl:grid-cols-[300px_minmax(0,1fr)_400px]">
      <OrderQueue orders={orders} fresh={fresh} activeId={detail?.order.id} onOpen={open} />
      <Workspace orders={orders} onOpen={open} />
      <SidePanel onReplan={replan} onReload={reload} onOpen={open} orders={orders} />
    </div>
  );
}
