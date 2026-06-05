import type { Metadata } from "next";
import AgentSafetyCardClient from "./AgentSafetyCardClient";

type PageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const safeId = /^\d+$/.test(id) ? id : "unknown";

  return {
    title: `Agent #${safeId} Safety Card`,
    description:
      "Public Interlock safety card with Mantle Sepolia pre-flight decision evidence, counters, and ActionChecked history.",
    alternates: {
      canonical: `/agent/${safeId}`,
    },
    openGraph: {
      title: `Interlock Agent #${safeId} Safety Card`,
      description:
        "Mantle Sepolia pre-flight decision evidence, Dev Alpha counters, and recorder timeline for this AI agent.",
      url: `/agent/${safeId}`,
      type: "profile",
    },
    twitter: {
      card: "summary",
      title: `Interlock Agent #${safeId} Safety Card`,
      description: "Public Mantle Sepolia pre-flight decision evidence for an AI agent.",
    },
  };
}

export default async function PublicAgentPage({ params }: PageProps) {
  const { id } = await params;
  return <AgentSafetyCardClient agentId={id} />;
}
