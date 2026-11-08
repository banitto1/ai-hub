import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./hub.css";
import "./reference.css";

export const viewport:Viewport={width:'device-width',initialScale:1,viewportFit:'cover',interactiveWidget:'resizes-content',themeColor:'#09090b'};
export const metadata: Metadata = {
  title: "Hub",
  description: "A private workspace for comparing and coordinating your AI providers.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}
