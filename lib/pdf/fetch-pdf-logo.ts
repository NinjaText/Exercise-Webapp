/**
 * Fetches an org logo for embedding in a react-pdf document. Callers pass only
 * own-bucket URLs (see `resolvePdfBranding`). Never throws: any failure, a
 * 5 s timeout, a non-`image/png` response or a body without the PNG signature
 * resolves to null so the PDF renders without a logo instead of failing.
 */
const LOGO_TIMEOUT_MS = 5000;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export async function fetchPdfLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LOGO_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;

    const contentType = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (contentType !== "image/png") return null;

    const buffer = Buffer.from(await res.arrayBuffer());
    if (!buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return null;
    return buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
