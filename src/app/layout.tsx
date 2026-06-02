import type { Metadata } from "next";
import { Outfit, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const fontSans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const fontMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "⚡ Mass10 Product Research Portal v4",
  description: "Collaborative, real-time AI-powered product research and catalog sync platform for Mass10 store management.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark">
      <body
        className={`${fontSans.variable} ${fontMono.variable} font-sans min-h-full bg-[#0b0d13] text-[#e8eaf0] antialiased select-none flex flex-col`}
      >
        {children}
      </body>
    </html>
  );
}
