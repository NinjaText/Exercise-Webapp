import { SiteNavbar } from "@/components/layout/site-navbar";
import { SiteFooter } from "@/components/layout/site-footer";
import type { LegalDocumentData } from "@/lib/legal/privacy-policy";

/**
 * Public legal page shell. Uses semantic tokens only (no raw palette).
 * Inside the native app (`isNative`) it drops the marketing navbar/footer,
 * whose Pricing and Sign In / Get Started links don't belong in the app.
 */
export function LegalDocument({ doc, isNative = false }: { doc: LegalDocumentData; isNative?: boolean }) {
  return (
    <div className="min-h-screen bg-background">
      {!isNative && <SiteNavbar alwaysSolid />}
      <main
        className={
          isNative
            ? "mx-auto max-w-3xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-[calc(2rem+env(safe-area-inset-top))] sm:px-6"
            : "mx-auto max-w-3xl px-4 pb-24 pt-32 sm:px-6"
        }
      >
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {doc.lastUpdated}</p>
        <p className="mt-8 text-base leading-relaxed text-foreground">{doc.intro}</p>

        <div className="mt-10 space-y-10">
          {doc.sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold text-foreground">{section.heading}</h2>
              {section.paragraphs.map((text, i) => (
                <p key={i} className="mt-3 leading-relaxed text-muted-foreground">
                  {text}
                </p>
              ))}
              {section.bullets && (
                <ul className="mt-3 list-disc space-y-2 pl-6 text-muted-foreground">
                  {section.bullets.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
      {!isNative && <SiteFooter />}
    </div>
  );
}
