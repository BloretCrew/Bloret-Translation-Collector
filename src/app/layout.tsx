import type { Metadata } from "next";
import Script from "next/script";
import { BloraInit } from "@/components/layout/BloraInit";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Bloret Translation",
    template: "%s · Bloret Translation",
  },
  description: "Bloret 翻译收集平台 — 组织 · 项目 · 文件 · 语言",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(() => {
  const root = document.documentElement;
  try {
    // Product lock: Studio theme + Dusk palette (blora palette key "studio")
    root.dataset.bloraThemeStyle = 'studio';
    root.dataset.bloraPalette = 'studio';
    try {
      localStorage.setItem('btc-style-theme', 'studio');
      localStorage.setItem('btc-palette', 'studio');
    } catch (_) {}
    const mode = localStorage.getItem('btc-theme');
    if (mode === 'dark' || (!mode && matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('blora-dark');
    }
  } catch (e) {}
})();`,
          }}
        />
        {/* eslint-disable-next-line @next/next/no-css-tags */}
        <link rel="stylesheet" href="/blora/blora.css" />
        {/* fonts loaded via stylesheet link intentionally for Blora */}
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Noto+Sans+SC:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="blora-page blora-scope">
        {children}
        <BloraInit />
        <Script src="/blora/blora.js" strategy="afterInteractive" />
      </body>
    </html>
  );
}
