import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_OF_SERVICE } from "@/lib/legal/terms-of-service";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return <LegalDocument doc={TERMS_OF_SERVICE} />;
}
