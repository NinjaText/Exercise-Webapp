import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { CONSUMER_HEALTH_DATA_POLICY } from "@/lib/legal/documents/consumer-health-data";

export const metadata: Metadata = { title: "Consumer Health Data Privacy Policy" };

/** Stand-alone notice for Washington, Nevada, and Connecticut residents. */
export default function ConsumerHealthDataPage() {
  return <LegalDocument doc={CONSUMER_HEALTH_DATA_POLICY} />;
}
