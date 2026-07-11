import type { Metadata } from "next";
import "./globals.css";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

export const metadata: Metadata = {
  title: "Rukus Dashboard",
  description: "Configure tickets, forms, and more for your Discord server.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
