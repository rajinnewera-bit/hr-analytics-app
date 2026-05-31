import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bath & Sanitary | HR Analytics Platform",
  description: "Stylt Group HR analytics platform for attendance processing, employee master, and payroll-ready operations.",
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}
