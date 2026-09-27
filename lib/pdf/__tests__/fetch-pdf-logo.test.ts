import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchPdfLogo } from "../fetch-pdf-logo";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN88P/BfwAJhAPjCkFJ8QAAAABJRU5ErkJggg==",
  "base64",
);
const URL_ = "https://cdn.example.com/branding/org_1/logo-on-light-abc.png";

function mockFetch(impl: (...args: unknown[]) => Promise<Response>) {
  const fn = vi.fn(impl);
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fetchPdfLogo", () => {
  it("returns null without fetching when there is no URL", async () => {
    const fn = mockFetch(async () => new Response(PNG));
    expect(await fetchPdfLogo(null)).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("returns the PNG bytes for an ok image/png response", async () => {
    const fn = mockFetch(
      async () => new Response(PNG, { status: 200, headers: { "content-type": "image/png" } }),
    );
    const buf = await fetchPdfLogo(URL_);
    expect(fn).toHaveBeenCalledWith(URL_, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(buf?.equals(PNG)).toBe(true);
  });

  it("accepts a content-type with parameters", async () => {
    mockFetch(
      async () =>
        new Response(PNG, { status: 200, headers: { "content-type": "Image/PNG; charset=binary" } }),
    );
    expect(await fetchPdfLogo(URL_)).not.toBeNull();
  });

  it("returns null for a non-PNG content-type", async () => {
    mockFetch(
      async () => new Response(PNG, { status: 200, headers: { "content-type": "image/jpeg" } }),
    );
    expect(await fetchPdfLogo(URL_)).toBeNull();
  });

  it("returns null when the body is not actually a PNG", async () => {
    mockFetch(
      async () =>
        new Response("<html></html>", { status: 200, headers: { "content-type": "image/png" } }),
    );
    expect(await fetchPdfLogo(URL_)).toBeNull();
  });

  it("returns null for a non-ok response", async () => {
    mockFetch(
      async () => new Response("nope", { status: 404, headers: { "content-type": "image/png" } }),
    );
    expect(await fetchPdfLogo(URL_)).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockFetch(async () => {
      throw new Error("network down");
    });
    expect(await fetchPdfLogo(URL_)).toBeNull();
  });

  it("aborts after 5 seconds and returns null", async () => {
    vi.useFakeTimers();
    mockFetch(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          (init as RequestInit).signal!.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const pending = fetchPdfLogo(URL_);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await pending).toBeNull();
  });
});
