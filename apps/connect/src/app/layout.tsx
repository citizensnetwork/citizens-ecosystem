import type { Metadata, Viewport } from "next";
import { Montserrat, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/ui/Navbar";
import CapacitorInit from "@/components/ui/CapacitorInit";
import ApplicationPendingBannerServer from "@/components/ui/ApplicationPendingBannerServer";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});


export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Citizens Connect",
  description:
    "Citizens Connect helps YOU find YOUR place in the Kingdom. Discover faith-based events, places, and community near you.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Citizens Connect",
  },
};

export default function RootLayout({
  children,
  panel,
}: Readonly<{
  children: React.ReactNode;
  panel: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${montserrat.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="map-bg min-h-full flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <CapacitorInit />
        <Navbar />
        <ApplicationPendingBannerServer />
        <main className="flex-1">{children}</main>
        {/* Parallel @panel slot — renders intercepted detail views
            (event, profile, messages) as a right-side drawer without
            leaving the underlying page. */}
        {panel}
      </body>
    </html>
  );
}
