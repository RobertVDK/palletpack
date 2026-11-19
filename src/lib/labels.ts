// Demo tracking / PRO numbers in each carrier's familiar shape. None of these are real.

export interface LabelDoc {
  packageId: string;
  kind: "parcel" | "pallet";
  tracking: string;
  carrier: string;
  service: string;
  index: number;
  count: number;
  pro?: string;
  bol?: string;
}

function digits(rand: () => number, n: number) {
  let s = "";
  for (let i = 0; i < n; i++) s += Math.floor(rand() * 10);
  return s;
}

export function trackingNumber(code: string, rand: () => number): string {
  switch (code) {
    case "UPS":
      return `1Z${digits(rand, 3)}V8${digits(rand, 2)}${digits(rand, 8)}`;
    case "FDX":
      return digits(rand, 12);
    case "PUR":
      return `3${digits(rand, 11)}`;
    case "CPC":
      return `${digits(rand, 16)}`;
    case "CAN":
      return `D4${digits(rand, 7)}0${digits(rand, 8)}`;
    case "LOO":
      return `LXE${digits(rand, 9)}`;
    default:
      return digits(rand, 9);
  }
}

export function proNumber(code: string, rand: () => number): string {
  return `${code}${digits(rand, 9)}`;
}

export function bolNumber(orderNumber: string): string {
  return `BOL-${orderNumber.replace(/\D/g, "")}-${new Date().getFullYear() % 100}`;
}
