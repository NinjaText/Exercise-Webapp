import * as React from "react";

export interface EmailLayoutProps {
  /** Document <title>. Not the subject line — that comes from the registry. */
  title: string;
  organizationName?: string;
  /** Header bar and CTA button colour. Defaults to brand blue. */
  accent?: string;
  /** e.g. "Hi Sarah," */
  greeting: React.ReactNode;
  intro: React.ReactNode;
  details?: Array<{ label: string; value: string }>;
  /** Optional blockquote-style excerpt, for message and note emails. */
  quote?: string;
  cta?: { label: string; href: string };
  footnote?: React.ReactNode;
  /** Omit for transactional mail — the footer link is then not rendered. */
  unsubscribe?: { url: string; categoryLabel: string };
  /** Reason line in the footer, e.g. "message notifications are on". */
  reason?: string;
  children?: React.ReactNode;
}

/**
 * The single layout every notification email renders through: header bar,
 * white card, optional detail rows, one CTA, footer.
 *
 * Email clients ignore most modern CSS, so this is nested tables with inline
 * styles on purpose. Do not replace it with flexbox or a stylesheet.
 */
export function EmailLayout({
  title,
  organizationName = "INMOTUS RX",
  accent = "#2563eb",
  greeting,
  intro,
  details,
  quote,
  cta,
  footnote,
  unsubscribe,
  reason,
  children,
}: EmailLayoutProps) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
      </head>
      <body style={styles.body}>
        <table width="100%" cellPadding={0} cellSpacing={0} style={styles.outerTable}>
          <tbody>
            <tr>
              <td align="center" style={{ padding: "40px 16px" }}>
                <table width="100%" cellPadding={0} cellSpacing={0} style={styles.card}>
                  <tbody>
                    <tr>
                      <td style={{ ...styles.headerBar, backgroundColor: accent }}>
                        <p style={styles.brandName}>{organizationName}</p>
                      </td>
                    </tr>

                    <tr>
                      <td style={styles.bodyPad}>
                        <p style={styles.greeting}>{greeting}</p>
                        <p style={styles.intro}>{intro}</p>

                        {details && details.length > 0 && (
                          <table width="100%" cellPadding={0} cellSpacing={0} style={styles.detailsCard}>
                            <tbody>
                              <tr>
                                <td style={styles.detailsPad}>
                                  {details.map((d) => (
                                    <DetailRow key={d.label} label={d.label} value={d.value} />
                                  ))}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {quote && <p style={styles.quote}>{quote}</p>}

                        {children}

                        {cta && (
                          <table
                            width="100%"
                            cellPadding={0}
                            cellSpacing={0}
                            style={{ marginTop: "28px", textAlign: "center" }}
                          >
                            <tbody>
                              <tr>
                                <td align="center">
                                  <a href={cta.href} style={{ ...styles.ctaButton, backgroundColor: accent }}>
                                    {cta.label}
                                  </a>
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {footnote && <p style={styles.footnote}>{footnote}</p>}
                      </td>
                    </tr>

                    <tr>
                      <td style={styles.footer}>
                        <p style={styles.footerText}>
                          &copy; {new Date().getFullYear()} {organizationName}. All rights reserved.
                        </p>
                        {reason && <p style={styles.footerText}>{reason}</p>}
                        {unsubscribe && (
                          <p style={styles.footerText}>
                            <a href={unsubscribe.url} style={styles.footerLink}>
                              Unsubscribe from {unsubscribe.categoryLabel} emails
                            </a>
                          </p>
                        )}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>
      </body>
    </html>
  );
}

/** A body paragraph styled like `intro`, for templates that need a second one via `children`. */
export function Paragraph({ children }: { children: React.ReactNode }) {
  return <p style={styles.intro}>{children}</p>;
}

export function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <table width="100%" cellPadding={0} cellSpacing={0} style={{ marginBottom: "12px" }}>
      <tbody>
        <tr>
          <td style={styles.detailLabel}>{label}</td>
          <td style={styles.detailValue}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

const styles: Record<string, React.CSSProperties> = {
  body: {
    backgroundColor: "#f4f6f9",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    margin: 0,
    padding: 0,
  },
  outerTable: { backgroundColor: "#f4f6f9", maxWidth: "600px", margin: "0 auto" },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    maxWidth: "560px",
    width: "100%",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  },
  headerBar: { backgroundColor: "#2563eb", padding: "24px 32px" },
  brandName: {
    color: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    margin: 0,
    letterSpacing: "0.5px",
  },
  bodyPad: { padding: "32px" },
  greeting: { color: "#111827", fontSize: "20px", fontWeight: 600, margin: "0 0 12px 0" },
  intro: { color: "#4b5563", fontSize: "15px", lineHeight: "1.6", margin: "0 0 24px 0" },
  detailsCard: { backgroundColor: "#f8fafc", borderRadius: "8px", border: "1px solid #e5e7eb" },
  detailsPad: { padding: "20px 24px" },
  detailLabel: {
    color: "#6b7280",
    fontSize: "13px",
    fontWeight: 500,
    width: "80px",
    paddingBottom: "4px",
    verticalAlign: "top",
  },
  detailValue: {
    color: "#111827",
    fontSize: "14px",
    fontWeight: 600,
    paddingBottom: "4px",
    verticalAlign: "top",
  },
  quote: {
    borderLeft: "3px solid #e5e7eb",
    color: "#374151",
    fontSize: "15px",
    fontStyle: "italic",
    lineHeight: "1.6",
    margin: "24px 0 0 0",
    padding: "4px 0 4px 16px",
  },
  ctaButton: {
    backgroundColor: "#2563eb",
    borderRadius: "8px",
    color: "#ffffff",
    display: "inline-block",
    fontSize: "15px",
    fontWeight: 600,
    padding: "12px 28px",
    textDecoration: "none",
    letterSpacing: "0.2px",
  },
  footnote: { color: "#9ca3af", fontSize: "13px", lineHeight: "1.5", marginTop: "28px", marginBottom: 0 },
  footer: { backgroundColor: "#f9fafb", borderTop: "1px solid #e5e7eb", padding: "20px 32px" },
  footerText: { color: "#9ca3af", fontSize: "12px", lineHeight: "1.5", margin: "0 0 4px 0" },
  footerLink: { color: "#6b7280", fontSize: "12px", textDecoration: "underline" },
};
