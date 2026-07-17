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
    // Product lock: Mono palette (blora-design-2 key "mono")
    window.BloraConfig = {
      colorModeStorageKey: 'btc-theme',
      paletteStorageKey: 'btc-palette',
    };
    root.dataset.bloraPalette = 'mono';
    delete root.dataset.bloraThemeStyle;
    try {
      localStorage.setItem('btc-palette', 'mono');
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
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
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
