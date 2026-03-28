import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "不動産投資シミュレーター",
  description: "物件価格と賃料から投資指標を即座に算出",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
