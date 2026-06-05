import "./landing.css";
import { SmoothScroll } from "./components/landing/SmoothScroll";
import { LandingNav } from "./components/landing/LandingNav";
import { Hero } from "./components/landing/Hero";
import { ProofBar } from "./components/landing/ProofBar";
import { HowItWorks } from "./components/landing/HowItWorks";
import { Features } from "./components/landing/Features";
import { Surfaces } from "./components/landing/Surfaces";
import { BenchmarkTeaser } from "./components/landing/BenchmarkTeaser";
import { CTASection } from "./components/landing/CTASection";

/**
 * Landing front-door (route "/"). Aztec-style editorial design: warm parchment + ink,
 * acid accents, literary serif display, a chancellery narrative, and an illuminated
 * verdict plate. Server-rendered shell (SEO + JSON-LD) composing the section components.
 */
export default function Landing() {
  return (
    <div className="az">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(STRUCTURED_DATA) }} />
      <SmoothScroll />
      <LandingNav />
      <main>
        <Hero />
        <ProofBar />
        <HowItWorks />
        <Features />
        <BenchmarkTeaser />
        <Surfaces />
        <CTASection />
      </main>
    </div>
  );
}

const STRUCTURED_DATA = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "Interlock Control Plane",
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  description:
    "Mantle-native pre-flight policy checks, transaction simulation, on-chain decision evidence, benchmark scoring, and developer integrations for autonomous AI agents.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  featureList: [
    "Pre-flight transaction policy checks",
    "Mantle Sepolia decision attestations",
    "Agent benchmark and safety evidence",
    "SDK, REST, CLI, and MCP integrations",
  ],
};
