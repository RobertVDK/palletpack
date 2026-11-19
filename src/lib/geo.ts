// Canadian destinations used by the demo order generator and the rate engine's zone math.

export interface City {
  city: string;
  province: string;
  fsa: string[];
  lat: number;
  lng: number;
}

export const ORIGIN = { name: "Northern Gecko Inc.", city: "Toronto", province: "ON", postal: "M3J 2C7", lat: 43.765, lng: -79.49 };

export const CITIES: City[] = [
  { city: "Calgary", province: "AB", fsa: ["T2P", "T3H", "T2E"], lat: 51.045, lng: -114.058 },
  { city: "Edmonton", province: "AB", fsa: ["T5J", "T6E", "T5K"], lat: 53.546, lng: -113.494 },
  { city: "Red Deer", province: "AB", fsa: ["T4N", "T4P"], lat: 52.268, lng: -113.811 },
  { city: "Lethbridge", province: "AB", fsa: ["T1J", "T1K"], lat: 49.694, lng: -112.833 },
  { city: "Vancouver", province: "BC", fsa: ["V6B", "V5K", "V6H"], lat: 49.283, lng: -123.121 },
  { city: "Victoria", province: "BC", fsa: ["V8W", "V9A"], lat: 48.428, lng: -123.365 },
  { city: "Kelowna", province: "BC", fsa: ["V1Y", "V1W"], lat: 49.888, lng: -119.496 },
  { city: "Nanaimo", province: "BC", fsa: ["V9R", "V9T"], lat: 49.166, lng: -123.94 },
  { city: "Winnipeg", province: "MB", fsa: ["R3C", "R2M", "R3T"], lat: 49.895, lng: -97.138 },
  { city: "Saskatoon", province: "SK", fsa: ["S7K", "S7N"], lat: 52.133, lng: -106.67 },
  { city: "Regina", province: "SK", fsa: ["S4P", "S4S"], lat: 50.445, lng: -104.619 },
  { city: "Ottawa", province: "ON", fsa: ["K1P", "K2P", "K1S"], lat: 45.421, lng: -75.697 },
  { city: "Hamilton", province: "ON", fsa: ["L8P", "L9C"], lat: 43.255, lng: -79.871 },
  { city: "London", province: "ON", fsa: ["N6A", "N6G"], lat: 42.984, lng: -81.246 },
  { city: "Kitchener", province: "ON", fsa: ["N2G", "N2M"], lat: 43.452, lng: -80.493 },
  { city: "Kingston", province: "ON", fsa: ["K7L", "K7M"], lat: 44.231, lng: -76.486 },
  { city: "Barrie", province: "ON", fsa: ["L4M", "L4N"], lat: 44.389, lng: -79.69 },
  { city: "Sudbury", province: "ON", fsa: ["P3E", "P3A"], lat: 46.492, lng: -80.993 },
  { city: "Thunder Bay", province: "ON", fsa: ["P7B", "P7E"], lat: 48.38, lng: -89.247 },
  { city: "Windsor", province: "ON", fsa: ["N9A", "N8X"], lat: 42.317, lng: -83.036 },
  { city: "Mississauga", province: "ON", fsa: ["L5B", "L5M"], lat: 43.589, lng: -79.644 },
  { city: "Montréal", province: "QC", fsa: ["H2X", "H3A", "H2J"], lat: 45.502, lng: -73.567 },
  { city: "Québec", province: "QC", fsa: ["G1R", "G1K"], lat: 46.813, lng: -71.208 },
  { city: "Sherbrooke", province: "QC", fsa: ["J1H", "J1J"], lat: 45.404, lng: -71.893 },
  { city: "Halifax", province: "NS", fsa: ["B3H", "B3J"], lat: 44.649, lng: -63.575 },
  { city: "Moncton", province: "NB", fsa: ["E1C", "E1A"], lat: 46.087, lng: -64.778 },
  { city: "Fredericton", province: "NB", fsa: ["E3B", "E3A"], lat: 45.964, lng: -66.643 },
  { city: "Charlottetown", province: "PE", fsa: ["C1A", "C1E"], lat: 46.238, lng: -63.131 },
  { city: "St. John's", province: "NL", fsa: ["A1C", "A1B"], lat: 47.561, lng: -52.712 },
  { city: "Whitehorse", province: "YT", fsa: ["Y1A"], lat: 60.721, lng: -135.057 },
  { city: "Yellowknife", province: "NT", fsa: ["X1A"], lat: 62.454, lng: -114.372 },
];

export function cityFor(city: string, province: string): City | undefined {
  return CITIES.find((c) => c.city === city && c.province === province);
}

/** Great-circle distance in km. */
export function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Rough mean November overnight low (°C) – drives the heat-pack rule for live shipments. */
export function novemberLow(c: City): number {
  const base: Record<string, number> = { BC: 3, AB: -9, SK: -12, MB: -11, ON: -1, QC: -4, NB: -3, NS: 0, PE: -1, NL: -1, YT: -16, NT: -20 };
  return (base[c.province] ?? -5) + (c.city === "Victoria" || c.city === "Vancouver" || c.city === "Nanaimo" ? 3 : 0);
}
