import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "여행 준비",
  description: "지도 위에 동선을 그리며 여행을 준비하는 앱",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
