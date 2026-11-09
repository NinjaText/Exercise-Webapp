import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_POLICY } from "@/lib/legal/documents/privacy-policy";
import { CONSUMER_HEALTH_DATA_POLICY } from "@/lib/legal/documents/consumer-health-data";

export const metadata: Metadata = { title: "Privacy Policy" };

/** The Consumer Health Data notice is "included after this general policy" (and also at /consumer-health-data). */
export default function PrivacyPage() {
  return (
    <LegalDocument doc={PRIVACY_POLICY} appendix={{ ...CONSUMER_HEALTH_DATA_POLICY, id: "consumer-health-data" }} />
  );
}
