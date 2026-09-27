import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";

vi.mock("server-only", () => ({}));

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));

vi.mock("@/lib/prisma", () => ({
  prisma: { user: { findUnique: vi.fn() } },
}));

const mockSend = vi.fn();
vi.mock("@/lib/r2", () => ({
  R2_BUCKET_NAME: "test-bucket",
  getR2Client: () => ({ send: mockSend }),
}));

import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { POST, runtime } from "../route";

const mockAuth = vi.mocked(auth);
const mockFindUser = vi.mocked(prisma.user.findUnique);

const ORG = "org_caller";
const PUBLIC_BASE = "https://cdn.example.com";
const PENDING_PREFIX = `branding-pending/${ORG}/`;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const trainer = { id: "u_1", role: "TRAINER", clerkOrgId: ORG };

// ---------------------------------------------------------------------------
// Real images and real multipart requests
// ---------------------------------------------------------------------------

function solid(width: number, height: number) {
  return sharp({
    create: { width, height, channels: 4, background: { r: 10, g: 80, b: 200, alpha: 0.6 } },
  });
}

const png = (w: number, h: number) => solid(w, h).png().toBuffer();

const SVG = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="red"/></svg>',
);

function uploadRequest(opts: {
  kind?: string | null;
  file?: Buffer | string | null;
  type?: string;
  name?: string;
}) {
  const form = new FormData();
  if (opts.kind !== null) form.set("kind", opts.kind ?? "logo-on-light");
  if (typeof opts.file === "string") {
    form.set("file", opts.file);
  } else if (opts.file) {
    form.set(
      "file",
      new File([new Uint8Array(opts.file)], opts.name ?? "logo.png", {
        type: opts.type ?? "image/png",
      }),
    );
  }
  return new Request("http://localhost:3000/api/branding/assets", { method: "POST", body: form });
}

async function expectError(res: Response, status: number) {
  expect(res.status).toBe(status);
  const body = await res.json();
  expect(typeof body.error).toBe("string");
  expect(body.error.length).toBeGreaterThan(0);
  expect(mockSend).not.toHaveBeenCalled();
  return body.error as string;
}

function sentCommands() {
  return mockSend.mock.calls.map(([command]) => command);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSend.mockResolvedValue({});
  mockAuth.mockResolvedValue({ userId: "clerk_1" } as never);
  mockFindUser.mockResolvedValue(trainer as never);
  vi.stubEnv("CLOUDFLARE_R2_PUBLIC_URL", PUBLIC_BASE);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/branding/assets — config", () => {
  it("runs on the Node.js runtime (sharp)", () => {
    expect(runtime).toBe("nodejs");
  });
});

describe("POST /api/branding/assets — auth", () => {
  it("401 without a Clerk session", async () => {
    mockAuth.mockResolvedValue({ userId: null } as never);
    await expectError(await POST(uploadRequest({ file: await png(300, 100) })), 401);
    expect(mockFindUser).not.toHaveBeenCalled();
  });

  it("401 when the Clerk user has no DB user", async () => {
    mockFindUser.mockResolvedValue(null);
    await expectError(await POST(uploadRequest({ file: await png(300, 100) })), 401);
    expect(mockFindUser).toHaveBeenCalledWith(
      expect.objectContaining({ where: { clerkId: "clerk_1" } }),
    );
  });

  it("403 for a CLIENT", async () => {
    mockFindUser.mockResolvedValue({ ...trainer, role: "CLIENT" } as never);
    await expectError(await POST(uploadRequest({ file: await png(300, 100) })), 403);
  });

  it("403 for a trainer without an organization", async () => {
    mockFindUser.mockResolvedValue({ ...trainer, clerkOrgId: null } as never);
    await expectError(await POST(uploadRequest({ file: await png(300, 100) })), 403);
  });
});

describe("POST /api/branding/assets — request validation", () => {
  it("400 for an unknown kind (no zod throw into a 500)", async () => {
    await expectError(await POST(uploadRequest({ kind: "banner", file: await png(300, 100) })), 400);
  });

  it("400 when kind is missing", async () => {
    await expectError(await POST(uploadRequest({ kind: null, file: await png(300, 100) })), 400);
  });

  it("400 when file is missing", async () => {
    await expectError(await POST(uploadRequest({ file: null })), 400);
  });

  it("400 when file is a plain string field", async () => {
    await expectError(await POST(uploadRequest({ file: "not a file" })), 400);
  });

  it("400 for an empty file", async () => {
    await expectError(await POST(uploadRequest({ file: Buffer.alloc(0) })), 400);
  });

  it("400 for a body that is not multipart form data", async () => {
    const req = new Request("http://localhost:3000/api/branding/assets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "mark" }),
    });
    await expectError(await POST(req), 400);
  });

  it("413 when the file exceeds 2 MB, without reading its bytes", async () => {
    const arrayBuffer = vi.spyOn(File.prototype, "arrayBuffer");
    const res = await POST(uploadRequest({ file: Buffer.alloc(2 * 1024 * 1024 + 1) }));
    await expectError(res, 413);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("413 from the Content-Length header alone, before parsing the form", async () => {
    const formData = vi.spyOn(Request.prototype, "formData");
    const req = new Request("http://localhost:3000/api/branding/assets", {
      method: "POST",
      headers: {
        "content-type": "multipart/form-data; boundary=x",
        "content-length": String(2 * 1024 * 1024 + 64 * 1024 + 1),
      },
      body: "--x--",
    });
    const error = await expectError(await POST(req), 413);
    expect(error).toBe("Images must be 2 MB or smaller.");
    expect(formData).not.toHaveBeenCalled();
  });

  it("accepts a Content-Length within the multipart allowance", async () => {
    const file = await png(300, 100);
    const probe = uploadRequest({ file });
    const body = await probe.arrayBuffer();
    const req = new Request("http://localhost:3000/api/branding/assets", {
      method: "POST",
      headers: {
        "content-type": probe.headers.get("content-type")!,
        "content-length": String(body.byteLength),
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("415 for image/svg+xml, without reading its bytes", async () => {
    const arrayBuffer = vi.spyOn(File.prototype, "arrayBuffer");
    const res = await POST(uploadRequest({ file: SVG, type: "image/svg+xml", name: "logo.svg" }));
    await expectError(res, 415);
    expect(arrayBuffer).not.toHaveBeenCalled();
  });

  it("415 for a GIF MIME type", async () => {
    await expectError(await POST(uploadRequest({ file: await png(300, 100), type: "image/gif" })), 415);
  });
});

describe("POST /api/branding/assets — decoder verdicts", () => {
  it("415 when an SVG is disguised as image/png (sharp is the real gate)", async () => {
    await expectError(await POST(uploadRequest({ file: SVG, type: "image/png" })), 415);
  });

  it("415 for an animated image", async () => {
    const frame = (background: string) =>
      sharp({ create: { width: 200, height: 200, channels: 4, background } }).png().toBuffer();
    const animated = await sharp([await frame("#ff0000"), await frame("#00ff00")], {
      join: { animated: true },
    })
      .webp({ loop: 0 })
      .toBuffer();
    await expectError(
      await POST(uploadRequest({ kind: "mark", file: animated, type: "image/webp" })),
      415,
    );
  });

  it("422 when sharp cannot decode the bytes, without echoing sharp's message", async () => {
    const res = await POST(uploadRequest({ file: Buffer.from("definitely not a png") }));
    const error = await expectError(res, 422);
    expect(error).not.toMatch(/vips|sharp|unsupported image format/i);
  });

  it("422 when the image is outside the slot's dimensions", async () => {
    await expectError(await POST(uploadRequest({ kind: "mark", file: await png(40, 40) })), 422);
  });
});

describe("POST /api/branding/assets — success", () => {
  it("200 for a valid PNG logo: one pending PNG under the caller's org", async () => {
    const res = await POST(uploadRequest({ kind: "logo-on-light", file: await png(300, 100) }));
    expect(res.status).toBe(200);
    const body = await res.json();

    const { primary, derivatives } = body.pendingKeys;
    expect(derivatives).toEqual([]);
    expect(primary.startsWith(PENDING_PREFIX)).toBe(true);
    expect(primary).toMatch(/-logo-on-light\.png$/);
    expect(primary.slice(PENDING_PREFIX.length, PENDING_PREFIX.length + 36)).toMatch(UUID_SHAPE);
    expect("previewUrl" in body).toBe(false);

    const commands = sentCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0]).toBeInstanceOf(PutObjectCommand);
    const input = commands[0].input;
    expect(input).toMatchObject({
      Bucket: "test-bucket",
      Key: primary,
      ContentType: "image/png",
      CacheControl: "public, max-age=31536000, immutable",
    });
    // The stored body is the sharp re-encode, not the upload.
    expect((await sharp(input.Body).metadata()).format).toBe("png");
  });

  it("200 for a mark: primary + favicon-32 + apple-180, all under the caller's pending prefix", async () => {
    const res = await POST(uploadRequest({ kind: "mark", file: await png(300, 300) }));
    expect(res.status).toBe(200);
    const body = await res.json();

    // Derivative keys are plain strings (favicon-32, apple-180) — the shape
    // `confirmBrandAsset({ derivativeKeys })` takes.
    const { primary, derivatives } = body.pendingKeys as {
      primary: string;
      derivatives: string[];
    };

    const uuid = primary.slice(PENDING_PREFIX.length, PENDING_PREFIX.length + 36);
    expect(uuid).toMatch(UUID_SHAPE);
    expect(primary).toBe(`${PENDING_PREFIX}${uuid}-mark.png`);
    expect(derivatives).toEqual([
      `${PENDING_PREFIX}${uuid}-favicon-32.png`,
      `${PENDING_PREFIX}${uuid}-apple-180.png`,
    ]);
    expect("previewUrl" in body).toBe(false);

    const commands = sentCommands();
    expect(commands).toHaveLength(3);
    const keys = commands.map((c) => c.input.Key);
    expect(keys.sort()).toEqual([primary, ...derivatives].sort());
    for (const command of commands) {
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input.Key.startsWith(PENDING_PREFIX)).toBe(true);
      expect(command.input.ContentType).toBe("image/png");
      expect(command.input.CacheControl).toBe("public, max-age=31536000, immutable");
      expect(command.input.Bucket).toBe("test-bucket");
    }

    const favicon = commands.find((c) => c.input.Key.endsWith("-favicon-32.png"))!;
    const meta = await sharp(favicon.input.Body).metadata();
    expect([meta.width, meta.height]).toEqual([32, 32]);
  });

  it("ignores any org hint in the form: keys use only the DB user's org", async () => {
    const form = new FormData();
    form.set("kind", "logo-on-dark");
    form.set("orgId", "org_victim");
    form.set("clerkOrgId", "org_victim");
    form.set("file", new File([new Uint8Array(await png(300, 100))], "l.png", { type: "image/png" }));
    const res = await POST(
      new Request("http://localhost:3000/api/branding/assets", { method: "POST", body: form }),
    );
    expect(res.status).toBe(200);
    for (const command of sentCommands()) {
      expect(command.input.Key.startsWith(PENDING_PREFIX)).toBe(true);
      expect(command.input.Key).not.toContain("org_victim");
    }
  });

  it("uses a fresh uuid per upload", async () => {
    const a = await (await POST(uploadRequest({ file: await png(300, 100) }))).json();
    const b = await (await POST(uploadRequest({ file: await png(300, 100) }))).json();
    expect(a.pendingKeys.primary).not.toBe(b.pendingKeys.primary);
  });
});

describe("POST /api/branding/assets — storage failures", () => {
  it("502 when an R2 put fails, and best-effort deletes the objects already put", async () => {
    let puts = 0;
    mockSend.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand) {
        puts += 1;
        if (command.input.Key?.endsWith("-apple-180.png")) throw new Error("R2 down: secret detail");
      }
      return {};
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(uploadRequest({ kind: "mark", file: await png(300, 300) }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).not.toContain("secret detail");
    expect(body.pendingKeys).toBeUndefined();
    expect(puts).toBe(3);

    const deletes = sentCommands().filter((c) => c instanceof DeleteObjectCommand);
    const deletedKeys = deletes.map((c) => String(c.input.Key)).sort();
    const putKeys = sentCommands()
      .filter((c) => c instanceof PutObjectCommand)
      .map((c) => String(c.input.Key))
      .filter((k) => !k.endsWith("-apple-180.png"))
      .sort();
    expect(deletedKeys).toEqual(putKeys);
    for (const key of deletedKeys) expect(key.startsWith(PENDING_PREFIX)).toBe(true);
    expect(consoleError).toHaveBeenCalled();
  });

  it("logs only name/message/httpStatusCode of the R2 error, not the SDK error object", async () => {
    const sdkError = Object.assign(new Error("R2 down"), {
      name: "ServiceUnavailable",
      $metadata: { httpStatusCode: 503, requestId: "req-1" },
      $response: { headers: { authorization: "secret" } },
    });
    mockSend.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand) throw sdkError;
      return {};
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(uploadRequest({ file: await png(300, 100) }));
    expect(res.status).toBe(502);

    const call = consoleError.mock.calls.find(([msg]) => String(msg).includes("R2 put failed"));
    expect(call).toBeDefined();
    const logged = call![1] as Record<string, unknown>;
    expect(logged.error).toEqual({ name: "ServiceUnavailable", message: "R2 down", httpStatusCode: 503 });
    for (const arg of call!) expect(arg).not.toBe(sdkError);
    expect(JSON.stringify(call)).not.toContain("secret");
  });

  it("still returns 502 when the cleanup delete also fails", async () => {
    mockSend.mockImplementation(async (command: unknown) => {
      if (command instanceof PutObjectCommand && command.input.Key?.endsWith("-favicon-32.png")) {
        throw new Error("put failed");
      }
      if (command instanceof DeleteObjectCommand) throw new Error("delete failed");
      return {};
    });
    vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await POST(uploadRequest({ kind: "mark", file: await png(300, 300) }));
    expect(res.status).toBe(502);
  });

});
