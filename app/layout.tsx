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
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    // A PNG rather than the SVG: iOS ignores an SVG apple-touch-icon, and
    // what it falls back to when someone adds the site to their home screen
    // is a screenshot of the page.
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
