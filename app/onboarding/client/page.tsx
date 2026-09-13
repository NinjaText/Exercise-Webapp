import { auth } from "@clerk/nextjs/server";
import { SignUp } from "@clerk/nextjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ClientOnboardingForm } from "@/components/onboarding/client-onboarding-form";
import { Activity } from "lucide-react";

export default async function ClientOnboardingPage() {
  const { userId } = await auth();

  // Unauthenticated: render Clerk's SignUp so it can consume the __clerk_ticket
  // from the invitation URL and complete account creation inline.
  if (!userId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-blue-50 px-4 py-12">
        <SignUp routing="hash" forceRedirectUrl="/onboarding/client" />
      </div>
    );
  }

  const user = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (user?.onboarded) redirect("/dashboard");

  return (
    <div className="flex min-h-screen">
      <div className="hidden w-1/2 flex-col justify-between bg-gradient-to-br from-[#0f172a] via-[#1e3a5f] to-[#0c4a6e] p-12 lg:flex">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold text-white">INMOTUS RX</span>
        </div>
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-white">
            Welcome to your rehabilitation program.
          </h1>
          <p className="mt-4 max-w-md text-lg text-slate-300">
            Complete your profile so your trainer can personalize your exercise program.
          </p>
        </div>
        <p className="text-sm text-slate-400">
          &copy; {new Date().getFullYear()} INMOTUS RX. All rights reserved.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center bg-[oklch(0.97_0.005_247)] p-6 sm:p-12">
        <div className="flex items-center gap-2.5 mb-8 lg:hidden">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-400 to-indigo-500">
            <Activity className="h-5 w-5 text-white" />
          </div>
          <span className="text-xl font-bold">INMOTUS RX</span>
        </div>
        <div className="w-full max-w-lg">
          <ClientOnboardingForm />
        </div>
      </div>
    </div>
  );
}
