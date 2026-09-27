import { useRef, useState } from "react"
import { confirmBrandAsset, removeBrandAsset } from "@/actions/branding-actions"
import { ACCEPTED_MIME, MAX_ASSET_BYTES, type AssetKind } from "@/lib/branding/asset-kinds"

export type UploadState = "idle" | "uploading" | "confirming" | "done" | "error"

// Mirrors the upload route's copy so a client-side rejection reads the same as a server one.
const TOO_LARGE = "Images must be 2 MB or smaller."
const WRONG_TYPE = "Upload a PNG, JPEG or WebP image."
const EMPTY = "That file is empty."
const GENERIC = "Upload failed. Please try again."

/** Client-side pre-check before any bytes leave the browser. Null means "looks fine". */
export function precheckBrandAssetFile(file: { size: number; type: string }): string | null {
  if (file.size === 0) return EMPTY
  if (file.size > MAX_ASSET_BYTES) return TOO_LARGE
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) return WRONG_TYPE
  return null
}

/**
 * Readable message for a failed upload whose body we can't use — e.g. Vercel's
 * own HTML 413 page when the request exceeds its 4.5 MB function body cap.
 */
export function messageForUploadStatus(status: number): string {
  switch (status) {
    case 400:
      return "That upload wasn't accepted. Try a different image."
    case 401:
    // Clerk's auth.protect() returns a 404 (not 401) for a signed-out API request.
    case 404:
      return "Your session has expired. Refresh the page and sign in again."
    case 403:
      return "You don't have permission to change this organization's branding."
    case 413:
      return TOO_LARGE
    case 415:
      return WRONG_TYPE
    case 422:
      return "We couldn't use that image. Try a different file."
    case 500:
      return "Something went wrong processing that image."
    case 502:
    case 503:
    case 504:
      return "Storage is unavailable right now. Please try again."
    default:
      return GENERIC
  }
}

type PendingKeys = { primary: string; derivatives: string[] }
export type UploadResponse = { ok: true; pendingKeys: PendingKeys } | { ok: false; error: string }

function isPendingKeys(value: unknown): value is PendingKeys {
  if (!value || typeof value !== "object") return false
  const { primary, derivatives } = value as Record<string, unknown>
  return (
    typeof primary === "string" &&
    Array.isArray(derivatives) &&
    derivatives.every((key) => typeof key === "string")
  )
}

/** Parses the route's response without assuming a JSON body on error. */
export async function readUploadResponse(res: Response): Promise<UploadResponse> {
  let body: unknown = null
  if (res.headers.get("content-type")?.includes("application/json")) {
    try {
      body = await res.json()
    } catch {
      body = null
    }
  }

  if (!res.ok) {
    const error = body && typeof body === "object" ? (body as Record<string, unknown>).error : undefined
    return {
      ok: false,
      error: typeof error === "string" && error.trim() ? error : messageForUploadStatus(res.status),
    }
  }

  const pendingKeys = body && typeof body === "object" ? (body as Record<string, unknown>).pendingKeys : undefined
  if (!isPendingKeys(pendingKeys)) return { ok: false, error: GENERIC }
  return { ok: true, pendingKeys }
}

/**
 * Brand asset upload (spec §6.2): pre-check → POST /api/branding/assets
 * (sharp re-encode, staged under `branding-pending/`) → `confirmBrandAsset`
 * (promote to `branding/` and save). States mirror `useVoiceMemoUpload`.
 */
export function useBrandAssetUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [removing, setRemoving] = useState(false)
  // A ref, not state: a second call in the same tick must see the first one.
  const inFlight = useRef(false)

  function fail(message: string) {
    setError(message)
    setUploadState("error")
    return null
  }

  async function upload(kind: AssetKind, file: File): Promise<{ url: string } | null> {
    if (inFlight.current) return null

    const precheck = precheckBrandAssetFile(file)
    if (precheck) return fail(precheck)

    inFlight.current = true
    setUploadState("uploading")
    setError(null)
    try {
      const formData = new FormData()
      formData.append("kind", kind)
      formData.append("file", file)

      let res: Response
      try {
        res = await fetch("/api/branding/assets", { method: "POST", body: formData })
      } catch {
        return fail("Couldn't reach the server. Check your connection and try again.")
      }

      const staged = await readUploadResponse(res)
      if (!staged.ok) return fail(staged.error)

      setUploadState("confirming")
      const confirmed = await confirmBrandAsset({
        kind,
        pendingKey: staged.pendingKeys.primary,
        derivativeKeys: staged.pendingKeys.derivatives,
      })
      if (!confirmed.success) return fail(confirmed.error)

      setUploadState("done")
      return { url: confirmed.url }
    } catch (err) {
      console.error("[useBrandAssetUpload]", err)
      return fail(GENERIC)
    } finally {
      inFlight.current = false
    }
  }

  async function remove(kind: AssetKind): Promise<boolean> {
    if (inFlight.current) return false
    inFlight.current = true
    setRemoving(true)
    setError(null)
    try {
      const result = await removeBrandAsset({ kind })
      if (!result.success) {
        setError(result.error)
        setUploadState("error")
        return false
      }
      setUploadState("idle")
      return true
    } catch (err) {
      console.error("[useBrandAssetUpload] remove", err)
      setError("Couldn't remove the image. Please try again.")
      setUploadState("error")
      return false
    } finally {
      inFlight.current = false
      setRemoving(false)
    }
  }

  function reset() {
    setUploadState("idle")
    setError(null)
  }

  const busy = removing || uploadState === "uploading" || uploadState === "confirming"

  return { upload, remove, uploadState, error, removing, busy, reset }
}
