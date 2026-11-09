import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/legal-document";
import { TERMS_OF_USE } from "@/lib/legal/documents/terms-of-use";

export const metadata: Metadata = { title: "Terms of Use" };

export default function TermsPage() {
  return <LegalDocument doc={TERMS_OF_USE} />;
}
