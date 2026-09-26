/**
 * Blob downloads (<a download>) silently do nothing in iOS web views. Inside
 * the shell, write the file to the app cache and open the system share sheet,
 * which offers Save to Files, Print, Mail and so on (spec §5).
 */
import { Capacitor } from "@capacitor/core";

const MAX_NAME = 100;

export function safeFilename(name: string, fallback = "download"): string {
  const cleaned = name
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]+/g, "_")
    .replace(/^[_.]+/, "")
    .trim();
  if (!cleaned) return fallback;
  if (cleaned.length <= MAX_NAME) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_NAME - ext.length) + ext;
}

export interface DownloadDeps {
  isNative(): boolean;
  webDownload(blob: Blob, filename: string): void;
  writeCacheFile(filename: string, base64: string): Promise<string>;
  share(options: { title: string; files: string[] }): Promise<void>;
}

async function blobToBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function webDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function defaultDeps(): DownloadDeps {
  return {
    isNative: () => Capacitor.isNativePlatform(),
    webDownload,
    writeCacheFile: async (filename, base64) => {
      const { Filesystem, Directory } = await import("@capacitor/filesystem");
      const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      return uri;
    },
    share: async (options) => {
      const { Share } = await import("@capacitor/share");
      await Share.share(options);
    },
  };
}

function isShareCancel(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /cancel/i.test(message);
}

export async function saveOrDownload(blob: Blob, filename: string, deps: DownloadDeps = defaultDeps()): Promise<void> {
  const name = safeFilename(filename);
  if (!deps.isNative()) {
    deps.webDownload(blob, name);
    return;
  }
  const uri = await deps.writeCacheFile(name, await blobToBase64(blob));
  try {
    await deps.share({ title: name, files: [uri] });
  } catch (error) {
    if (!isShareCancel(error)) throw error;
  }
}
