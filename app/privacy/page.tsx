import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { PRIVACY_POLICY } from "@/lib/legal/privacy-policy";
import { getNativeInfo } from "@/lib/native/server";

export const metadata: Metadata = { title: "Privacy Policy" };

// Reads the user agent, so this renders per request: inside the native app the
// page drops the marketing navbar/footer (Pricing, Sign In / Get Started).
export default async function PrivacyPage() {
  const { isNative } = await getNativeInfo();
  return <LegalDocument doc={PRIVACY_POLICY} isNative={isNative} />;
}
