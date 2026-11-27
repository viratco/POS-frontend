// Guests' mobile numbers from any country. Indian numbers are stored as 10 digits ("9876543210");
// others with their country code ("+393450665603"). The database cleans them the same way
// (guest_phone() in SQL).

/** Country codes for the picker: India first, then the countries guests most often come from. */
export const COUNTRY_CODES: { code: string; country: string; iso: string }[] = [
  { code: "91", country: "India", iso: "IN" },
  { code: "1", country: "USA / Canada", iso: "US" },
  { code: "44", country: "UK", iso: "GB" },
  { code: "971", country: "UAE", iso: "AE" },
  { code: "966", country: "Saudi Arabia", iso: "SA" },
  { code: "974", country: "Qatar", iso: "QA" },
  { code: "968", country: "Oman", iso: "OM" },
  { code: "965", country: "Kuwait", iso: "KW" },
  { code: "973", country: "Bahrain", iso: "BH" },
  { code: "977", country: "Nepal", iso: "NP" },
  { code: "880", country: "Bangladesh", iso: "BD" },
  { code: "94", country: "Sri Lanka", iso: "LK" },
  { code: "975", country: "Bhutan", iso: "BT" },
  { code: "960", country: "Maldives", iso: "MV" },
  { code: "65", country: "Singapore", iso: "SG" },
  { code: "60", country: "Malaysia", iso: "MY" },
  { code: "66", country: "Thailand", iso: "TH" },
  { code: "62", country: "Indonesia", iso: "ID" },
  { code: "63", country: "Philippines", iso: "PH" },
  { code: "84", country: "Vietnam", iso: "VN" },
  { code: "86", country: "China", iso: "CN" },
  { code: "852", country: "Hong Kong", iso: "HK" },
  { code: "81", country: "Japan", iso: "JP" },
  { code: "82", country: "South Korea", iso: "KR" },
  { code: "61", country: "Australia", iso: "AU" },
  { code: "64", country: "New Zealand", iso: "NZ" },
  { code: "49", country: "Germany", iso: "DE" },
  { code: "33", country: "France", iso: "FR" },
  { code: "39", country: "Italy", iso: "IT" },
  { code: "34", country: "Spain", iso: "ES" },
  { code: "351", country: "Portugal", iso: "PT" },
  { code: "31", country: "Netherlands", iso: "NL" },
  { code: "32", country: "Belgium", iso: "BE" },
  { code: "41", country: "Switzerland", iso: "CH" },
  { code: "43", country: "Austria", iso: "AT" },
  { code: "353", country: "Ireland", iso: "IE" },
  { code: "46", country: "Sweden", iso: "SE" },
  { code: "47", country: "Norway", iso: "NO" },
  { code: "45", country: "Denmark", iso: "DK" },
  { code: "358", country: "Finland", iso: "FI" },
  { code: "48", country: "Poland", iso: "PL" },
  { code: "30", country: "Greece", iso: "GR" },
  { code: "90", country: "Turkey", iso: "TR" },
  { code: "7", country: "Russia", iso: "RU" },
  { code: "380", country: "Ukraine", iso: "UA" },
  { code: "972", country: "Israel", iso: "IL" },
  { code: "20", country: "Egypt", iso: "EG" },
  { code: "27", country: "South Africa", iso: "ZA" },
  { code: "254", country: "Kenya", iso: "KE" },
  { code: "234", country: "Nigeria", iso: "NG" },
  { code: "55", country: "Brazil", iso: "BR" },
  { code: "52", country: "Mexico", iso: "MX" },
  { code: "54", country: "Argentina", iso: "AR" },
];

/** "IN" -> 🇮🇳 */
export const flag = (iso: string) => String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

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
