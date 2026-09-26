import { Capacitor } from "@capacitor/core";

/** A light tap inside the native shell (spec §5); a no-op everywhere else. */
export async function haptic(style: "light" | "medium" = "light"): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: style === "medium" ? ImpactStyle.Medium : ImpactStyle.Light });
  } catch {
    // Haptics are a nicety; never let them affect the action that triggered them.
  }
}
