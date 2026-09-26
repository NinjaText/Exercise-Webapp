import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_OF_SERVICE } from "@/lib/legal/terms-of-service";
import { getNativeInfo } from "@/lib/native/server";

export const metadata: Metadata = { title: "Terms of Service" };

// Reads the user agent, so this renders per request: inside the native app the
// page drops the marketing navbar/footer (Pricing, Sign In / Get Started).
export default async function TermsPage() {
  const { isNative } = await getNativeInfo();
  return <LegalDocument doc={TERMS_OF_SERVICE} isNative={isNative} />;
}
