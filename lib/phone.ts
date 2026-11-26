// Guests' mobile numbers from any country. Indian numbers are stored as 10 digits ("9876543210");
// others with their country code ("+393450665603"). The database cleans them the same way
// (guest_phone() in SQL).

/** Country codes for the picker: India first, then the countries guests most often come from. */
export const COUNTRY_CODES: { code: string; country: string }[] = [
  { code: "91", country: "India" },
  { code: "1", country: "USA / Canada" },
  { code: "44", country: "UK" },
  { code: "971", country: "UAE" },
  { code: "966", country: "Saudi Arabia" },
  { code: "974", country: "Qatar" },
  { code: "968", country: "Oman" },
  { code: "965", country: "Kuwait" },
  { code: "973", country: "Bahrain" },
  { code: "977", country: "Nepal" },
  { code: "880", country: "Bangladesh" },
  { code: "94", country: "Sri Lanka" },
  { code: "975", country: "Bhutan" },
  { code: "960", country: "Maldives" },
  { code: "65", country: "Singapore" },
  { code: "60", country: "Malaysia" },
  { code: "66", country: "Thailand" },
  { code: "62", country: "Indonesia" },
  { code: "63", country: "Philippines" },
  { code: "84", country: "Vietnam" },
  { code: "86", country: "China" },
  { code: "852", country: "Hong Kong" },
  { code: "81", country: "Japan" },
  { code: "82", country: "South Korea" },
  { code: "61", country: "Australia" },
  { code: "64", country: "New Zealand" },
  { code: "49", country: "Germany" },
  { code: "33", country: "France" },
  { code: "39", country: "Italy" },
  { code: "34", country: "Spain" },
  { code: "351", country: "Portugal" },
  { code: "31", country: "Netherlands" },
  { code: "32", country: "Belgium" },
  { code: "41", country: "Switzerland" },
  { code: "43", country: "Austria" },
  { code: "353", country: "Ireland" },
  { code: "46", country: "Sweden" },
  { code: "47", country: "Norway" },
  { code: "45", country: "Denmark" },
  { code: "358", country: "Finland" },
  { code: "48", country: "Poland" },
  { code: "30", country: "Greece" },
  { code: "90", country: "Turkey" },
  { code: "7", country: "Russia" },
  { code: "380", country: "Ukraine" },
  { code: "972", country: "Israel" },
  { code: "20", country: "Egypt" },
  { code: "27", country: "South Africa" },
  { code: "254", country: "Kenya" },
  { code: "234", country: "Nigeria" },
  { code: "55", country: "Brazil" },
  { code: "52", country: "Mexico" },
  { code: "54", country: "Argentina" },
];

/** The number as it is saved: 10 digits for India, "+<code><number>" otherwise. Null if it doesn't look valid. */
export function fullPhone(code: string, local: string): string | null {
  let d = local.replace(/\D/g, "");
  if (code === "91") {
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    return /^[6-9]\d{9}$/.test(d) ? d : null;
  }
  // Typed the country code again ("+39 …" or "0039 …").
  if (d.startsWith(`00${code}`)) d = d.slice(code.length + 2);
  else if (d.startsWith(code) && d.length > code.length + 7) d = d.slice(code.length);
  d = d.replace(/^0+/, "");
  const all = code + d;
  return d.length >= 6 && /^[1-9]\d{7,14}$/.test(all) ? `+${all}` : null;
}

/** "9876543210" -> "98765 43210"; "+393450665603" stays as it is. */
export function showPhone(p: string) {
  return /^\d{10}$/.test(p) ? `${p.slice(0, 5)} ${p.slice(5)}` : p;
}

/** For tel: links. */
export const telHref = (p: string) => (p.startsWith("+") ? `tel:${p}` : `tel:+91${p}`);
