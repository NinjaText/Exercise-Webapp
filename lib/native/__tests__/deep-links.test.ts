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
