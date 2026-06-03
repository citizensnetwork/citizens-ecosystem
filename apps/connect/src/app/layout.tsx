import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Playfair_Display, Geist_Mono } from "next/font/google";
import "./globals.css";
import "maplibre-gl/dist/maplibre-gl.css";
import AppShell from "@/components/ui/AppShell";
import CapacitorInit from "@/components/ui/CapacitorInit";
import ApplicationPendingBannerServer from "@/components/ui/ApplicationPendingBannerServer";
import ServiceWorkerRegister from "@/components/ui/ServiceWorkerRegister";
import BetaBanner from "@/components/ui/BetaBanner";
import TermsAcceptanceGate from "@/components/ui/TermsAcceptanceGate";
import { FEATURE_FLAGS } from "@/lib/featureFlags";
import SuggestionButton from "@/components/ui/SuggestionButtonClient";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
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
      className={`${jakarta.variable} ${playfair.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="map-bg min-h-full flex flex-col pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">
        <CapacitorInit />
        <ServiceWorkerRegister />
        {Object.values(FEATURE_FLAGS).some(Boolean) && <BetaBanner />}
        <AppShell />
        {/* Content column — offset right of the collapsible desktop sidebar via
            the --cc-sidebar-w var AppShell maintains (0 on mobile / collapsed). */}
        <div className="flex flex-1 flex-col transition-[padding] duration-300 md:pl-[var(--cc-sidebar-w,0px)]">
          <ApplicationPendingBannerServer />
          <main className="flex-1">{children}</main>
          {/* Parallel @panel slot — renders intercepted detail views
              (event, profile, messages) as a right-side drawer without
              leaving the underlying page. */}
          {panel}
        </div>
        <TermsAcceptanceGate />
        <SuggestionButton variant="floating" />
      </body>
    </html>
  );
}
