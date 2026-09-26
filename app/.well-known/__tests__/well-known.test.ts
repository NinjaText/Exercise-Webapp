import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getAasa } from "../apple-app-site-association/route";
import { GET as getAssetLinks } from "../assetlinks.json/route";

const KEYS = ["APPLE_TEAM_ID", "ANDROID_SHA256_CERT_FINGERPRINTS"] as const;
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("/.well-known/apple-app-site-association", () => {
  it("is a 404 when APPLE_TEAM_ID is unset", () => {
    expect(getAasa().status).toBe(404);
  });

  it("is a 404 when APPLE_TEAM_ID is blank", () => {
    process.env.APPLE_TEAM_ID = "   ";
    expect(getAasa().status).toBe(404);
  });

  it("serves the AASA as JSON when configured", async () => {
    process.env.APPLE_TEAM_ID = " ABCDE12345 ";
    const res = getAasa();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { applinks: { details: { appIDs: string[]; components: unknown[] }[] } };
    expect(body.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.goinmotus.app"]);
    expect(body.applinks.details[0].components.length).toBeGreaterThan(0);
  });
});

describe("/.well-known/assetlinks.json", () => {
  it("is a 404 when ANDROID_SHA256_CERT_FINGERPRINTS is unset", () => {
    expect(getAssetLinks().status).toBe(404);
  });

  it("serves assetlinks as JSON with every fingerprint when configured", async () => {
    process.env.ANDROID_SHA256_CERT_FINGERPRINTS = "AA:BB, CC:DD ,";
    const res = getAssetLinks();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("application/json");
    const body = (await res.json()) as { relation: string[]; target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(body[0].relation).toEqual(["delegate_permission/common.handle_all_urls"]);
    expect(body[0].target.package_name).toBe("com.goinmotus.app");
    expect(body[0].target.sha256_cert_fingerprints).toEqual(["AA:BB", "CC:DD"]);
  });
});
