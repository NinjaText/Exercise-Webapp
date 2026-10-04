import { vi } from "vitest";

// `getNativeInfo()` reads the request user agent through `headers()`, which
// throws outside a Next request. Most tests render pages and call routes
// without one, so default to a plain browser. Tests that exercise the native
// app mock `@/lib/native/server` themselves, and that mock takes precedence.
vi.mock("@/lib/native/server", () => ({
  getNativeInfo: vi.fn(async () => ({ isNative: false })),
}));
