import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { ServiceWorkerRegistrar } from "@/components/pwa";
import "./globals.css";

const manrope = Manrope({ variable: "--font-manrope", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Podium", template: "%s · Podium" },
  description: "Gestión deportiva y administrativa para escuelas deportivas.",
  applicationName: "Podium",
  appleWebApp: { capable: true, title: "Podium", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#2f6bff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`${manrope.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
