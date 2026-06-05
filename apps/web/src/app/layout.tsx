import type { Metadata } from "next";
import { Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { ToastProvider } from "./components/Toast";
import "./styles.css";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

// Literary serif display for the landing (Aztec-style editorial headlines), with italics.
const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-fraunces",
});

// Humanist sans for landing body copy.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  applicationName: "Interlock Control Plane",
  title: {
    default: "Interlock Control Plane",
    template: "%s | Interlock",
  },
  description:
    "Mantle-native control plane for AI agents: pre-flight policy checks, transaction simulation, decision attestations, benchmark evidence, and developer integrations.",
  keywords: [
    "Interlock",
    "Mantle",
    "AI agents",
    "agentic wallets",
    "pre-flight security",
    "transaction simulation",
    "on-chain attestations",
    "developer tools",
  ],
  authors: [{ name: "Interlock" }],
  creator: "Interlock",
  category: "Developer Tools",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Interlock Control Plane",
    description:
      "Pre-flight policy, simulation, evidence, and benchmark layer for autonomous AI agents on Mantle.",
    url: "/",
    siteName: "Interlock",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Interlock Control Plane",
    description:
      "Pre-flight policy, simulation, evidence, and benchmark layer for autonomous AI agents on Mantle.",
  },
  icons: {
    icon: [
      { url: "/icon.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.svg", type: "image/svg+xml" },
    ],
    apple: "/icon.png",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${jetbrainsMono.variable} ${fraunces.variable} ${inter.variable}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}

function siteUrl() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return new URL(configured);
  const vercelUrl = process.env.VERCEL_URL;
  if (vercelUrl) return new URL(`https://${vercelUrl}`);
  return new URL("http://localhost:3000");
}
