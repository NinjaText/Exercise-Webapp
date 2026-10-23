import { z } from "zod";
import {
  FEELING_RATINGS,
  FOLLOW_ALONG_COMMENT_MAX_LENGTH,
  MAX_FOLLOW_ALONG_VIDEO_BYTES,
} from "@/lib/utils/follow-along";

/** Video types a trainer can upload, mapped to the extension the R2 key gets. */
export const FOLLOW_ALONG_VIDEO_EXTENSIONS = {
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
} as const;

export type FollowAlongVideoContentType = keyof typeof FOLLOW_ALONG_VIDEO_EXTENSIONS;

export const FOLLOW_ALONG_VIDEO_CONTENT_TYPES = Object.keys(
  FOLLOW_ALONG_VIDEO_EXTENSIONS
) as FollowAlongVideoContentType[];

/**
 * Presign request for a follow-along upload. The declared size is signed into
 * the URL as Content-Length, so R2 rejects a PUT whose body is any other size —
 * the 2 GB cap can't be bypassed by lying here and uploading more.
 */
export const followAlongVideoPresignSchema = z.object({
  contentType: z.enum(FOLLOW_ALONG_VIDEO_CONTENT_TYPES as [FollowAlongVideoContentType, ...FollowAlongVideoContentType[]], {
    message: "Only MP4, WebM, or MOV videos are supported",
  }),
  fileSize: z
    .number()
    .int()
    .positive("The video file is empty")
    .max(MAX_FOLLOW_ALONG_VIDEO_BYTES, "Videos can be at most 2 GB"),
});

/** The client's "How did it go?" answer when a follow-along session ends. */
export const completeFollowAlongSessionSchema = z.object({
  sessionId: z.string().min(1),
  // Optional: "Skip" completes the session without a rating.
  feelingRating: z.enum(FEELING_RATINGS).optional().nullable(),
  comment: z
    .string()
    .trim()
    .max(FOLLOW_ALONG_COMMENT_MAX_LENGTH, `Keep it under ${FOLLOW_ALONG_COMMENT_MAX_LENGTH} characters`)
    .optional()
    .nullable(),
  // Seconds of video actually played; capped at 12 h like Workout.videoDurationSec.
  watchedSeconds: z.number().int().min(0).max(12 * 60 * 60),
  // True when the video played to its end; lets a 0-second count through
  // (e.g. a very short clip finishing between playhead polls).
  videoEnded: z.boolean().default(false),
});

export type FollowAlongVideoPresignInput = z.infer<typeof followAlongVideoPresignSchema>;
export type CompleteFollowAlongSessionInput = z.input<typeof completeFollowAlongSessionSchema>;
