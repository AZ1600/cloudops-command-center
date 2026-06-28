import type { Metadata } from "next";
import { AuthProvider } from "@/app/auth-provider";
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
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
