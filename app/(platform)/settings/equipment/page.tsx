import { getCurrentUser } from "@/lib/current-user";
import { prisma } from "@/lib/prisma";
import { listEquipmentProfiles } from "@/lib/services/equipment-profile.service";
import { EquipmentSettings } from "@/components/settings/equipment-settings";

export default async function EquipmentSettingsPage() {
  const user = await getCurrentUser();
  const [profiles, clientProfile] = await Promise.all([
    listEquipmentProfiles(user.id),
    user.role === "CLIENT"
      ? prisma.clientProfile.findUnique({
          where: { userId: user.id },
          select: { availableEquipment: true, equipmentSetupName: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <EquipmentSettings
      profiles={profiles}
      myEquipment={
        user.role === "CLIENT"
          ? { items: clientProfile?.availableEquipment ?? [], setupName: clientProfile?.equipmentSetupName ?? null }
          : null
      }
    />
  );
}
