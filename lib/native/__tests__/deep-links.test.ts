import { describe, it, expect } from "vitest";
import { buildAppleAppSiteAssociation, buildAssetLinks, DEEP_LINK_PATH_PREFIXES, pathFromAppUrl } from "../deep-links";

describe("pathFromAppUrl", () => {
  it("maps a universal link to an in-app path, keeping query and hash", () => {
    expect(pathFromAppUrl("https://app.goinmotus.com/messages/abc?x=1#m2")).toBe("/messages/abc?x=1#m2");
  });
  it("maps the custom scheme", () => {
    expect(pathFromAppUrl("inmotus://clients/42")).toBe("/clients/42");
    expect(pathFromAppUrl("inmotus:///dashboard")).toBe("/dashboard");
  });
  it("ignores other hosts and schemes", () => {
    expect(pathFromAppUrl("https://evil.example/dashboard")).toBeNull();
    expect(pathFromAppUrl("https://app.goinmotus.com.evil.io/x")).toBeNull();
    expect(pathFromAppUrl("mailto:a@b.c")).toBeNull();
    expect(pathFromAppUrl("not a url")).toBeNull();
  });
  it("never returns a protocol-relative path that could leave the origin", () => {
    expect(pathFromAppUrl("inmotus:////evil.com")).toBeNull();
    expect(pathFromAppUrl("https://app.goinmotus.com//evil.com")).toBeNull();
  });
});

describe("pathFromAppUrl: backslash and encoding tricks", () => {
  const ORIGIN = "https://app.goinmotus.com";
  const staysHome = (result: string | null) => expect(new URL(result ?? "/", ORIGIN).origin).toBe(ORIGIN);

  it.each([
    "inmotus:/\\evil.com",
    "inmotus:///\\evil.com",
    "inmotus://\\evil.com",
    "https://app.goinmotus.com/\\evil.com",
  ])("rejects %s", (url) => {
    const result = pathFromAppUrl(url);
    expect(result).toBeNull();
    staysHome(result);
  });

  it("does not let percent-encoded backslashes escape the origin", () => {
    const result = pathFromAppUrl("inmotus://%5C%5Cevil.com");
    staysHome(result);
    if (result !== null) expect(result.startsWith("//")).toBe(false);
  });

  it("still maps a normal scheme link with query and hash", () => {
    const result = pathFromAppUrl("inmotus://clients/42?x=1#h");
    expect(result).toBe("/clients/42?x=1#h");
    staysHome(result);
  });
});

describe("association files", () => {
  it("builds the AASA with the team-qualified app ID and every prefix", () => {
    const aasa = buildAppleAppSiteAssociation("ABCDE12345") as { applinks: { details: { appIDs: string[]; components: { "/": string }[] }[] } };
    expect(aasa.applinks.details[0].appIDs).toEqual(["ABCDE12345.com.goinmotus.app"]);
    expect(aasa.applinks.details[0].components.map((c) => c["/"])).toEqual(DEEP_LINK_PATH_PREFIXES.flatMap((p) => [p, `${p}/*`]));
  });
  it("builds assetlinks with the package and fingerprints", () => {
    const links = buildAssetLinks(["AA:BB"]) as { target: { package_name: string; sha256_cert_fingerprints: string[] } }[];
    expect(links[0].target.package_name).toBe("com.goinmotus.app");
    expect(links[0].target.sha256_cert_fingerprints).toEqual(["AA:BB"]);
  });
});
