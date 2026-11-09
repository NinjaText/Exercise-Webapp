/** A legal document generated from counsel's Word file (see scripts/build-legal-docs.mjs). */
export interface LegalHtmlDocument {
  title: string;
  /** As written in the document, e.g. "November 6, 2026". */
  lastUpdated: string | null;
  effectiveDate: string | null;
  /** Trusted, build-time HTML (h2/h3/p/ul/ol/table/a only). */
  html: string;
}
