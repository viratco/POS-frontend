/** Rooms are kept as tables named "Room 101", "Room 5"… They get their own section and QR cards. */
export function isRoom(name: string) {
  return /^room\b/i.test(name.trim());
}
