import { Station } from "@/components/station/Station";
import { queueOrders } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function PackStationPage({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  const [{ order }, orders] = await Promise.all([searchParams, queueOrders()]);
  return <Station initialOrders={orders} initialId={order} />;
}
