import { AuthShell } from "@/components/auth/auth-shell";
import { NativeAwareSignUp } from "@/components/auth/native-aware-auth";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { getNativeInfo } from "@/lib/native/server";

export default async function SignUpPage() {
  const branding = toViewModel(await getOrgBranding(null));
  const native = await getNativeInfo();

  return (
    <AuthShell
      branding={branding}
      headingMode="form"
      headline="Create your account"
      // No trial or pricing talk inside the native app (Apple 3.1.1).
      subhead={native.isNative ? "Sign up with your email." : "Start your free trial today."}
      bullets={[
        "Build and assign exercise programs in minutes",
        "Track client progress, check-ins and adherence",
        "Message clients and keep everyone on plan",
      ]}
    >
      <NativeAwareSignUp nativeFromServer={native.isNative} />
    </AuthShell>
  );
}
