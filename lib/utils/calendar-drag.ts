/**
 * Whether a calendar event may be dragged to reschedule it. Drag is off on
 * phones: a long-press drag fights page scrolling, and tapping the event
 * (its menu or editor) is the phone's way to act on it.
 */
export function isCalendarDraggable({
  readOnly,
  isPhone,
}: {
  readOnly: boolean;
  isPhone: boolean;
}): boolean {
  return !readOnly && !isPhone;
}
