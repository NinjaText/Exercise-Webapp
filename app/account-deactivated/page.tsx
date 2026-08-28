import { SignOutButton } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShieldOff } from "lucide-react";

export default function AccountDeactivatedPage() {
  return (
    <div className="flex items-center justify-center min-h-screen p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <ShieldOff className="h-12 w-12 text-muted-foreground" />
          </div>
          <CardTitle>Account Deactivated</CardTitle>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-muted-foreground text-sm">
            Your account has been deactivated and no longer has access to the
            platform. If you believe this is a mistake, contact your trainer
            or an administrator.
          </p>
          <SignOutButton>
            <Button variant="outline">Sign out</Button>
          </SignOutButton>
        </CardContent>
      </Card>
    </div>
  );
}
