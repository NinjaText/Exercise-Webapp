import { describe, it, expect } from "vitest";
import { CLUB_MEMBER_LIST_LIMIT, memberListTruncationNote } from "../members-limit";

describe("memberListTruncationNote", () => {
  it("says the list is cut off when it hits the take limit", () => {
    expect(CLUB_MEMBER_LIST_LIMIT).toBe(200);
    expect(memberListTruncationNote(200)).toBe("Showing the first 200 members");
  });
  it("says nothing below the limit", () => {
    expect(memberListTruncationNote(0)).toBeUndefined();
    expect(memberListTruncationNote(199)).toBeUndefined();
  });
});
