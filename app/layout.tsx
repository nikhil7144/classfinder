import type { Metadata } from "next";
import { Manrope, Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { BRAND } from "@/lib/brand";
import "./globals.css";

// Charcoal & Coral type pairing: Plus Jakarta Sans for display, Manrope for
// body, JetBrains Mono for eyebrows, labels and data.
const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["600", "700", "800"],
});

const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  // Name and slogan in the tab; the description below is what a search
  // result shows underneath it, and three verbs would tell a parent nothing.
  title: `${BRAND.name} — ${BRAND.slogan}`,
  description: BRAND.tagline,
  icons: {
    // PNGs, because the mark is raster artwork — wrapping a bitmap in an
    // SVG would buy nothing. app/favicon.ico is served by Next whether or not
    // it is named here, and carries 16/32/48 for anything that asks for one.
    icon: [
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    shortcut: "/favicon.ico",
    // The one icon in the set on a white ground. iOS ignores alpha here and
    // composites onto black, which would bury a navy "A" completely.
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        className={`${manrope.variable} ${jakarta.variable} ${jetbrains.variable} antialiased`}
      >
        <Navbar />
        {children}
        <Footer />
      </body>
    </html>
  );
}
