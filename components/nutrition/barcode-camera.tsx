"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"] as const;
const SCAN_INTERVAL_MS = 200;

interface DetectedCode {
  rawValue: string;
  format: string;
}

interface Detector {
  detect(source: HTMLVideoElement): Promise<DetectedCode[]>;
}

type NativeDetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<string[]>;
};

/** The browser's own BarcodeDetector when it reads retail codes (Android Chrome), else the ZXing WASM ponyfill (iOS). */
async function createDetector(): Promise<Detector> {
  const Native = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats();
      if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: [...FORMATS] });
    } catch {
      // Fall through to the ponyfill.
    }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: [...FORMATS] });
}

export type CameraFailure = "denied" | "unavailable";

interface BarcodeCameraProps {
  /** Called with each decoded code; return true to stop scanning (the code was accepted). */
  onDetected: (code: DetectedCode) => boolean;
  onFailure: (reason: CameraFailure) => void;
}

/** Live rear-camera view that decodes retail barcodes (EAN/UPC) continuously until one is accepted. */
export function BarcodeCamera({ onDetected, onFailure }: BarcodeCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  // Keep the latest callbacks without restarting the camera when the parent re-renders.
  const onDetectedRef = useRef(onDetected);
  const onFailureRef = useRef(onFailure);
  useEffect(() => {
    onDetectedRef.current = onDetected;
    onFailureRef.current = onFailure;
  });

  useEffect(() => {
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        onFailureRef.current("unavailable");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        if (stopped) return;
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        onFailureRef.current(denied ? "denied" : "unavailable");
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay of a muted inline video is allowed; ignore spurious interruptions.
      }

      let detector: Detector;
      try {
        detector = await createDetector();
      } catch (err) {
        console.error("[barcode] detector failed to load:", err);
        if (!stopped) onFailureRef.current("unavailable");
        return;
      }
      if (stopped) return;
      setReady(true);

      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          try {
            const codes = await detector.detect(video);
            for (const code of codes) {
              if (stopped) return;
              if (onDetectedRef.current({ rawValue: code.rawValue, format: code.format })) {
                navigator.vibrate?.(60);
                return;
              }
            }
          } catch {
            // A single bad frame is not fatal; keep scanning.
          }
        }
        if (!stopped) timer = setTimeout(tick, SCAN_INTERVAL_MS);
      };
      void tick();
    }

    void start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black">
      <video ref={videoRef} className="h-full w-full object-cover" playsInline muted autoPlay />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="h-[38%] w-[78%] rounded-lg ring-2 ring-white/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white">
        {ready ? (
          "Line up the barcode inside the frame"
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Starting camera…
          </span>
        )}
      </p>
    </div>
  );
}
