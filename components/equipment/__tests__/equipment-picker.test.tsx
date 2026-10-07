import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/actions/equipment-profile-actions", () => ({
  listMyEquipmentProfilesAction: vi.fn(async () => ({ ok: true, data: [] })),
  saveEquipmentProfileAction: vi.fn(),
}));

import { EquipmentPicker } from "../equipment-picker";
import { EQUIPMENT_PRESETS } from "@/lib/utils/equipment-catalog";

const noop = () => {};
const home = EQUIPMENT_PRESETS.find((p) => p.id === "home-gym")!;

describe("EquipmentPicker", () => {
  it("lists every built-in setup with its size", () => {
    const html = renderToStaticMarkup(<EquipmentPicker value={[]} onChange={noop} profiles={[]} />);
    for (const p of EQUIPMENT_PRESETS) expect(html).toContain(p.name);
    expect(html).toContain(`${home.items.length} pieces of equipment`);
    expect(html).toContain("No equipment");
  });

  it("marks the setup the selection matches and shows the user's own profiles", () => {
    const html = renderToStaticMarkup(
      <EquipmentPicker
        value={[...home.items]}
        onChange={noop}
        profiles={[{ id: "p1", name: "My Garage", items: ["Barbell", "Bench"] }]}
      />
    );
    expect(html).toMatch(/role="radio" aria-checked="true"[^]*?Home Gym/);
    expect(html).toContain("My Garage");
    expect(html).toContain("Your profile");
  });

  it("opens the categories that hold a selection", () => {
    const html = renderToStaticMarkup(<EquipmentPicker value={["Leg Press"]} onChange={noop} profiles={[]} />);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Leg Press</);
    // A category with nothing selected stays closed.
    expect(html).not.toContain(">Treadmill<");
  });

  it("puts non-catalogue items under Other so they can still be removed", () => {
    const html = renderToStaticMarkup(
      <EquipmentPicker value={["Hill Sprint Track"]} extraItems={["Sled"]} onChange={noop} profiles={[]} />
    );
    expect(html).toContain(">Other<");
  });

  it("can hide setups and saving (exercise forms)", () => {
    const html = renderToStaticMarkup(
      <EquipmentPicker value={["Barbell"]} onChange={noop} showSetups={false} allowSave={false} />
    );
    expect(html).not.toContain("Home Gym");
    expect(html).not.toContain("Save as my profile");
  });

  it("offers to save a hand-picked selection, not a preset", () => {
    expect(renderToStaticMarkup(<EquipmentPicker value={["Barbell"]} onChange={noop} profiles={[]} />)).toContain(
      "Save as my profile"
    );
    expect(
      renderToStaticMarkup(<EquipmentPicker value={[...home.items]} onChange={noop} profiles={[]} />)
    ).not.toContain("Save as my profile");
  });

  it("labels bodyweight only", () => {
    const html = renderToStaticMarkup(<EquipmentPicker value={["none"]} onChange={noop} profiles={[]} />);
    expect(html).toMatch(/<p[^>]*>Bodyweight only/);
  });
});
