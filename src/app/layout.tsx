import type { Metadata, Viewport } from "next";
import { Archivo } from "next/font/google";
import { Toaster } from "sonner";
import { TopBar } from "@/components/shell/TopBar";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "PalletPack · Northern Gecko fulfilment",
  description: "3D carton and skid builder: orders in, packed plan, verified weights, booked rates.",
};

export const viewport: Viewport = {
  themeColor: "#181d24",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={archivo.variable}>
      <body className="min-h-dvh antialiased">
        <TopBar />
        {children}
        <Toaster
          theme="dark"
          position="bottom-right"
          toastOptions={{
            style: { background: "#222932", border: "1px solid #313a46", color: "#e3e8ee", fontFamily: "var(--font-archivo)" },
          }}
        />
      </body>
    </html>
  );
}
