import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { Container, DisplayHeading, Eyebrow } from "@/components/marketing/primitives";
import type { LegalHtmlDocument } from "@/lib/legal/types";

/**
 * Styles for the generated legal HTML (h2/h3/p/ul/ol/table/a). Child selectors
 * keep the document text verbatim while matching the marketing site.
 */
const PROSE = [
  "text-[15px] leading-relaxed text-ink-soft",
  "[&_p]:mt-4 [&_strong]:font-semibold [&_strong]:text-ink",
  "[&_h2]:mt-12 [&_h2]:scroll-mt-28 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-[0.02em] [&_h2]:text-ink",
  "[&_h3]:mt-8 [&_h3]:scroll-mt-28 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-ink",
  "[&_ul]:mt-3 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-6 [&_ol]:mt-3 [&_ol]:list-decimal [&_ol]:space-y-2 [&_ol]:pl-6",
  "[&_li_p]:mt-0",
  "[&_a]:font-medium [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-clay",
  "[&_.legal-table]:mt-5 [&_.legal-table]:overflow-x-auto [&_.legal-table]:rounded-2xl [&_.legal-table]:border [&_.legal-table]:border-sand-line",
  "[&_table]:w-full [&_table]:min-w-[32rem] [&_table]:border-collapse [&_table]:text-sm",
  "[&_th]:bg-cream-deep [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:align-top",
  "[&_td]:border-t [&_td]:border-sand-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-top",
  "[&_td_p]:mt-0 [&_th_p]:mt-0",
].join(" ");

function DocumentBody({ doc }: { doc: LegalHtmlDocument }) {
  // Trusted: generated at build time from counsel's Word files, never user input.
  return <div className={PROSE} dangerouslySetInnerHTML={{ __html: doc.html }} />;
}

function Dates({ doc }: { doc: LegalHtmlDocument }) {
  return (
    <p className="mt-4 text-sm text-ink-soft">
      {doc.lastUpdated && <>Last updated {doc.lastUpdated}</>}
      {doc.lastUpdated && doc.effectiveDate && " · "}
      {doc.effectiveDate && <>Effective {doc.effectiveDate}</>}
    </p>
  );
}

/**
 * Public legal page. `appendix` renders a second document below the first
 * (the Consumer Health Data notice sits under the Privacy Policy, as written).
 */
export function LegalDocument({ doc, appendix }: { doc: LegalHtmlDocument; appendix?: LegalHtmlDocument & { id: string } }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-cream text-ink">
      <MarketingNav />
      <main className="pt-28 pb-20 sm:pt-32 sm:pb-24">
        <Container className="max-w-3xl">
          <Eyebrow>Legal</Eyebrow>
          <DisplayHeading as="h1" className="mt-4">
            {doc.title}
          </DisplayHeading>
          <Dates doc={doc} />
          <div className="mt-10 break-words">
            <DocumentBody doc={doc} />
          </div>

          {appendix && (
            <section id={appendix.id} className="mt-20 scroll-mt-28 border-t border-sand-line pt-14 break-words">
              <h2 className="text-2xl font-normal tracking-[-0.02em] text-ink sm:text-3xl">{appendix.title}</h2>
              <Dates doc={appendix} />
              <div className="mt-6">
                <DocumentBody doc={appendix} />
              </div>
            </section>
          )}
        </Container>
      </main>
      <MarketingFooter />
    </div>
  );
}
