import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CloudOps Command Center",
  description: "AI platform engineering assistant for infrastructure risk detection and approved remediation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
