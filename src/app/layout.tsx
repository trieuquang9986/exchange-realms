import type { Metadata } from "next";
import "./globals.css";

// Phase 0 uses system fonts so builds never depend on the network. Typography is decided in Phase 6.
export const metadata: Metadata = {
  title: "The Exchange Realms",
  description:
    "Thế giới giả tưởng được dựng từ dữ liệu thị trường chứng khoán HOSE. Không phải khuyến nghị đầu tư.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
