import type { OptionGroup, PickedOption } from "./types";

// "Full · Honey Butter" for receipts, KOTs and the dashboard.
export function optionsLabel(options: PickedOption[] | null | undefined) {
  return (options ?? []).map((o) => o.name).join(" · ");
}

// Same dish with the same picks = same cart line.
export function lineKey(itemId: string, picks: PickedOption[]) {
  const sorted = [...picks].map((p) => `${p.group}=${p.name}`).sort();
  return sorted.length ? `${itemId}|${sorted.join("|")}` : itemId;
}

export function extraPrice(groups: OptionGroup[], picks: PickedOption[]) {
  let sum = 0;
  for (const p of picks) {
    sum += groups.find((g) => g.name === p.group)?.choices.find((c) => c.name === p.name)?.price ?? 0;
  }
  return sum;
}

// Mirrors the server's checks; returns the first group that isn't satisfied.
export function missingGroup(groups: OptionGroup[], picks: PickedOption[]) {
  return groups.find((g) => {
    const n = picks.filter((p) => p.group === g.name).length;
    return n < (g.min ?? 0) || n > (g.max ?? 1);
  });
}

// Required single-choice groups start on their first choice (like "Half" on DotPe).
export function defaultPicks(groups: OptionGroup[]): PickedOption[] {
  return groups.filter((g) => g.min >= 1 && g.max === 1 && g.choices[0]).map((g) => ({ group: g.name, name: g.choices[0].name }));
}

// Text format used in Menu admin:
//   Choice (pick 1)
//   Veg
//   Chicken +50
//   Add On (pick 0-3)
//   Honey Butter +50
export function optionsToText(groups: OptionGroup[]) {
  return groups
    .map((g) => {
      const rule = g.min === g.max ? `pick ${g.max}` : `pick ${g.min}-${g.max}`;
      const lines = g.choices.map((c) => (c.price ? `${c.name} +${c.price / 100}` : c.name));
      return [`${g.name} (${rule})`, ...lines].join("\n");
    })
    .join("\n");
}

export function textToOptions(text: string): { groups: OptionGroup[]; error: string | null } {
  const groups: OptionGroup[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const head = line.match(/^(.+?)\s*\(pick\s+(\d+)(?:\s*-\s*(\d+))?\)$/i);
    if (head) {
      const min = Number(head[2]);
      const max = head[3] !== undefined ? Number(head[3]) : min;
      if (max < 1 || min > max) return { groups, error: `"${line}": pick range doesn't make sense` };
      groups.push({ name: head[1].trim(), min, max, choices: [] });
      continue;
    }
    const g = groups.at(-1);
    if (!g) return { groups, error: `"${line}": start with a group line like "Choice (pick 1)"` };
    const ch = line.match(/^(.+?)(?:\s*\+\s*(\d+(?:\.\d{1,2})?))?$/);
    if (!ch) return { groups, error: `Couldn't read "${line}"` };
    const price = ch[2] ? Math.round(Number(ch[2]) * 100) : 0;
    g.choices.push({ name: ch[1].trim(), price });
  }
  const empty = groups.find((g) => g.choices.length === 0);
  if (empty) return { groups, error: `"${empty.name}" has no choices` };
  const tooMany = groups.find((g) => g.max > g.choices.length);
  if (tooMany) return { groups, error: `"${tooMany.name}" allows ${tooMany.max} picks but has ${tooMany.choices.length} choices` };
  return { groups, error: null };
}
