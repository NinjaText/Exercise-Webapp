import { AuthShell } from "@/components/auth/auth-shell";
import { NativeAwareSignIn } from "@/components/auth/native-aware-auth";
import { getOrgBranding } from "@/lib/services/branding.service";
import { toViewModel } from "@/lib/branding/types";
import { getNativeInfo } from "@/lib/native/server";

export default async function SignInPage() {
  const branding = toViewModel(await getOrgBranding(null));
  const native = await getNativeInfo();

  return (
    <AuthShell
      branding={branding}
      headingMode="form"
      headline="Welcome back"
      subhead="Sign in to manage your clients and programs."
    >
      <NativeAwareSignIn nativeFromServer={native.isNative} />
    </AuthShell>
  );
}
