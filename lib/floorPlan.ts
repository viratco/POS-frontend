// A café's floor plan, as data (top view, entrance at the top). Saved per café in
// cafes.floor_plan; units are SVG pixels. Tables are matched to spots by number:
// spot n ↔ the table named "Table n".

export type Side = "top" | "bottom" | "left" | "right";
export type Spot = { n: number; x: number; y: number; w: number; h: number; chairs: Partial<Record<Side, number>> };
export type Rect = { x: number; y: number; w: number; h: number };
export type Gap = { x1: number; x2: number; y: number }; // a horizontal door or opening

export type FloorPlan = {
  view: Rect;
  floor: string[]; // floor shapes (SVG paths)
  walls: string[]; // wall lines (SVG paths)
  entrance?: Gap;
  openings?: Gap[]; // open archways / glass doors between areas
  counter?: Rect & { label?: string };
  labels?: { x: number; y: number; text: string }[];
  spots: Spot[];
};

/* ───────────── Sohee's Kitchen, drawn from the owner's sketch ───────────── */

const S_ENTRANCE = { x1: 643, x2: 793, y: 255 };
const S_ARCH = { x1: 605, x2: 865, y: 730 };

export const SOHEES_PLAN: FloorPlan = {
  // Crops the open-ended passage on the left; it simply runs off the edge.
  view: { x: 165, y: 200, w: 890, h: 1215 },
  floor: ["M95,255 L1035,255 L1035,930 L470,930 L470,1395 L190,1395 L190,730 L400,730 L400,445 L95,445 Z"],
  walls: [
    `M95,255 L${S_ENTRANCE.x1},255`,
    `M${S_ENTRANCE.x2},255 L1035,255 L1035,930 L470,930 L470,1395 L190,1395 L190,730 L400,730 L400,445 L95,445`,
    `M400,730 L${S_ARCH.x1},730`,
    `M${S_ARCH.x2},730 L1035,730`,
  ],
  entrance: S_ENTRANCE,
  openings: [S_ARCH],
  counter: { x: 447, y: 280, w: 145, h: 55 },
  spots: [
    { n: 1, x: 890, y: 290, w: 95, h: 66, chairs: { left: 1, right: 1 } },
    { n: 2, x: 890, y: 432, w: 95, h: 68, chairs: { left: 1, right: 1 } },
    { n: 3, x: 898, y: 553, w: 107, h: 142, chairs: { left: 2, right: 2 } },
    { n: 4, x: 637, y: 430, w: 128, h: 95, chairs: { top: 1, bottom: 1 } },
    { n: 5, x: 432, y: 600, w: 93, h: 92, chairs: { top: 1, bottom: 1 } },
    { n: 6, x: 897, y: 785, w: 106, h: 100, chairs: { top: 2, bottom: 2 } },
    { n: 7, x: 675, y: 835, w: 100, h: 75, chairs: { left: 1, right: 1 } },
    { n: 8, x: 248, y: 768, w: 172, h: 100, chairs: { top: 2, bottom: 2 } },
    { n: 9, x: 318, y: 995, w: 142, h: 110, chairs: { top: 2, bottom: 2 } },
    { n: 10, x: 214, y: 1285, w: 93, h: 83, chairs: { top: 1, right: 1 } },
  ],
};

/* ───────────── a tidy default for cafés without their own plan ───────────── */

/** One room, tables in rows of four, entrance at the top and the counter beside it. */
export function autoPlan(tableNumbers: number[]): FloorPlan {
  const nums = [...new Set(tableNumbers)].sort((a, b) => a - b);
  const cols = 4;
  const rows = Math.max(1, Math.ceil(nums.length / cols));
  const cell = { w: 210, h: 190 };
  const left = 60, top = 80, inset = 50;
  const right = left + inset * 2 + cols * cell.w;
  const bottom = top + 150 + rows * cell.h;
  const door = { x1: right / 2 + 40, x2: right / 2 + 190, y: top };
  return {
    view: { x: left - 40, y: top - 60, w: right - left + 80, h: bottom - top + 100 },
    floor: [`M${left},${top} L${right},${top} L${right},${bottom} L${left},${bottom} Z`],
    walls: [`M${left},${top} L${door.x1},${top}`, `M${door.x2},${top} L${right},${top} L${right},${bottom} L${left},${bottom} Z`],
    entrance: door,
    counter: { x: left + inset, y: top + 30, w: 200, h: 56 },
    spots: nums.map((n, i) => ({
      n,
      x: left + inset + (i % cols) * cell.w + 40,
      y: top + 150 + Math.floor(i / cols) * cell.h + 45,
      w: 130,
      h: 90,
      chairs: { top: 2, bottom: 2 },
    })),
  };
}

/** A saved plan from the database, if it has the right shape; otherwise null. */
export function readPlan(v: unknown): FloorPlan | null {
  if (!v || typeof v !== "object") return null;
  const p = v as FloorPlan;
  const ok =
    p.view && typeof p.view.w === "number" && Array.isArray(p.floor) && Array.isArray(p.walls) &&
    Array.isArray(p.spots) && p.spots.every((s) => typeof s.n === "number" && typeof s.x === "number" && s.chairs);
  return ok ? p : null;
}

/** "Table 7" / "table 7" / "T7" / "7" → 7. Anything else (e.g. "Window 1") isn't on a plan. */
export function spotNumber(name: string): number | null {
  const m = name.trim().match(/^(?:table\s*|t\s*)?(\d{1,3})$/i);
  return m ? Number(m[1]) : null;
}
