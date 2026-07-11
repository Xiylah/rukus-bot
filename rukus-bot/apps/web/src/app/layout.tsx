import type { Metadata } from "next";
import "./globals.css";

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
