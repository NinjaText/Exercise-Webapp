import { Activity } from "lucide-react";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="flex items-center gap-2 p-4 sm:p-6">
        <Activity className="h-6 w-6 text-blue-600" />
        <span className="text-lg font-bold text-slate-900">INMOTUS RX</span>
      </div>
      <div className="flex items-center justify-center px-4 pb-16">
        {children}
      </div>
    </div>
  );
}
