import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FONSAT · Gestão de equipas",
  icons: { icon: "/icon.svg" },
  description:
    "Assiduidade e faturação para empresas de alocação de mão de obra.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-PT">
      <body>{children}</body>
    </html>
  );
}
