import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_POLICY } from "@/lib/legal/privacy-policy";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return <LegalDocument doc={PRIVACY_POLICY} />;
}
