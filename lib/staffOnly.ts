/** A menu category named "Staff only" holds items staff can add to a bill but guests never see on the QR menu. */
export function isStaffOnlyCategory(name: string) {
  return /^staff[\s-]*only$/i.test(name.trim());
}
