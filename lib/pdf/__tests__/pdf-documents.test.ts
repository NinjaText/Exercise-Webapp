import React from "react";
import { crc32, deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { Image, Text, renderToBuffer } from "@react-pdf/renderer";
import { PdfHeader } from "../components/pdf-header";
import { HEPDocument } from "../hep-document";
import { ProgramDocument } from "../program-document";

/** A valid 2x2 RGB PNG built in-process (CRCs + zlib data are real). */
function makePng(): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0); // width
  ihdr.writeUInt32BE(2, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  const row = Buffer.from([0, 32, 78, 195, 32, 78, 195]); // filter byte + 2 px
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat([row, row]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const PNG = makePng();

type AnyElement = React.ReactElement<Record<string, unknown>>;

/** Walks a rendered element tree (host + function components expanded). */
function collect(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (Array.isArray(node)) {
    node.forEach((n) => collect(n, out));
    return out;
  }
  if (!React.isValidElement(node)) return out;
  const el = node as AnyElement;
  out.push(el);
  if (typeof el.type === "function" && el.type !== Text && el.type !== Image) {
    collect((el.type as (p: unknown) => unknown)(el.props), out);
  }
  collect(el.props.children, out);
  return out;
}

function flatStyle(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatStyle));
  return (style as Record<string, unknown>) ?? {};
}

function textEl(tree: AnyElement[], content: string): AnyElement | undefined {
  return tree.find((el) => el.type === Text && el.props.children === content);
}

const images = (tree: AnyElement[]) => tree.filter((el) => el.type === Image);

const baseProgram = {
  programName: "Knee Rehab",
  clientName: "Jane Doe",
  organizationName: "Acme Physio",
  sections: [],
};

const baseHep = {
  planTitle: "Home Program",
  createdDate: "Sep 25, 2026",
  organizationName: "Acme Physio",
  organizationTagline: "Move better",
  exercisesByDay: new Map(),
  imageMap: new Map(),
  placeholderBuffer: PNG,
};

describe("PdfHeader", () => {
  it("colours the organization name with the accent when given", () => {
    const tree = collect(PdfHeader({ organizationName: "Acme", accentHex: "#123456", pageNumber: 1 }));
    expect(flatStyle(textEl(tree, "Acme")?.props.style).color).toBe("#123456");
  });

  it("keeps the product colour when no accent is given", () => {
    const tree = collect(PdfHeader({ organizationName: "Acme", pageNumber: 1 }));
    expect(flatStyle(textEl(tree, "Acme")?.props.style).color).toBe("#111827");
  });

  it("renders the logo only when a buffer is given", () => {
    expect(images(collect(PdfHeader({ organizationName: "Acme", logoBuffer: PNG, pageNumber: 1 })))).toHaveLength(1);
    expect(images(collect(PdfHeader({ organizationName: "Acme", logoBuffer: null, pageNumber: 1 })))).toHaveLength(0);
  });
});

describe("HEPDocument", () => {
  it("plumbs name, tagline, logo and accent into the header", () => {
    const tree = collect(
      HEPDocument({ ...baseHep, organizationLogoBuffer: PNG, accentHex: "#123456" }),
    );
    expect(flatStyle(textEl(tree, "Acme Physio")?.props.style).color).toBe("#123456");
    expect(textEl(tree, "Move better")).toBeDefined();
    expect(images(tree)).toHaveLength(1);
  });

  it("renders to a PDF with a logo buffer", async () => {
    const buf = await renderToBuffer(
      React.createElement(HEPDocument, { ...baseHep, organizationLogoBuffer: PNG, accentHex: "#123456" }) as never,
    );
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });

  it("renders to a PDF without a logo buffer", async () => {
    const buf = await renderToBuffer(
      React.createElement(HEPDocument, { ...baseHep, organizationLogoBuffer: null }) as never,
    );
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
  });
});

describe("ProgramDocument", () => {
  it("colours the title with the accent and shows the org name", () => {
    const tree = collect(ProgramDocument({ ...baseProgram, accentHex: "#123456" }));
    expect(flatStyle(textEl(tree, "Knee Rehab")?.props.style).color).toBe("#123456");
    expect(textEl(tree, "Acme Physio")).toBeDefined();
  });

  it("keeps the product title colour when no accent is given", () => {
    const tree = collect(ProgramDocument(baseProgram));
    expect(flatStyle(textEl(tree, "Knee Rehab")?.props.style).color).toBe("#1d4ed8");
  });

  it("renders the logo (max 48pt tall) above the title only when a buffer is given", () => {
    const withLogo = collect(ProgramDocument({ ...baseProgram, logoBuffer: PNG }));
    const logos = images(withLogo);
    expect(logos).toHaveLength(1);
    expect(flatStyle(logos[0].props.style).maxHeight ?? flatStyle(logos[0].props.style).height).toBeLessThanOrEqual(48);
    expect(withLogo.indexOf(logos[0])).toBeLessThan(withLogo.indexOf(textEl(withLogo, "Knee Rehab")!));

    expect(images(collect(ProgramDocument({ ...baseProgram, logoBuffer: null })))).toHaveLength(0);
  });

  it("renders to a PDF with and without a logo buffer", async () => {
    for (const logoBuffer of [PNG, null]) {
      const buf = await renderToBuffer(
        React.createElement(ProgramDocument, { ...baseProgram, logoBuffer, accentHex: "#123456" }) as never,
      );
      expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    }
  });
});
