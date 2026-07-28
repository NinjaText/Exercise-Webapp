import { useState } from "react";
import {
  generateMealPhotoPresignedUrl,
  confirmMealPhotoUpload,
} from "@/actions/nutrition-actions";

export type UploadState = "idle" | "uploading" | "confirming" | "done" | "error";

export function useMealPhotoUpload() {
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [error, setError] = useState<string | null>(null);

  async function upload(file: File): Promise<string | null> {
    setUploadState("uploading");
    setError(null);
    try {
      const fileExtension = (file.name.split(".").pop() ?? "jpg").toLowerCase();

      const presignResult = await generateMealPhotoPresignedUrl({ fileExtension });
      if (!presignResult.success) {
        setError(presignResult.error);
        setUploadState("error");
        return null;
      }
      const { presignedUrl, pendingKey } = presignResult.data;

      const uploadResp = await fetch(presignedUrl, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type || `image/${fileExtension}` },
      });
      if (!uploadResp.ok) {
        setError("Upload to storage failed. Please try again.");
        setUploadState("error");
        return null;
      }

      setUploadState("confirming");
      const confirmResult = await confirmMealPhotoUpload({ pendingKey });
      if (!confirmResult.success) {
        setError(confirmResult.error);
        setUploadState("error");
        return null;
      }

      setUploadState("done");
      return confirmResult.data.photoUrl;
    } catch (err) {
      console.error("[useMealPhotoUpload]", err);
      setError("Upload failed. Please try again.");
      setUploadState("error");
      return null;
    }
  }

  function reset() {
    setUploadState("idle");
    setError(null);
  }

  return { upload, uploadState, error, reset };
}
