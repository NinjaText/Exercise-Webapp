import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const phone = vi.hoisted(() => ({ isPhone: false }));
vi.mock("@/hooks/use-is-phone", () => ({ useIsPhoneViewport: () => phone.isPhone }));

import { PhoneOnly } from "../phone-only";

afterEach(() => {
  phone.isPhone = false;
});

describe("PhoneOnly", () => {
  it("renders its children on phone-width viewports", () => {
    phone.isPhone = true;
    expect(renderToStaticMarkup(<PhoneOnly><span>ITEM</span></PhoneOnly>)).toBe("<span>ITEM</span>");
  });

  it("renders nothing above sm, so the children can't take focus", () => {
    expect(renderToStaticMarkup(<PhoneOnly><span>ITEM</span></PhoneOnly>)).toBe("");
  });
});
