import type { Diet } from "@/lib/types";

// Indian menu convention: green dot = veg, amber = egg, brown triangle = non-veg.
const DIET = {
  veg: { label: "Veg", color: "#15803d", shape: "dot" },
  egg: { label: "Contains egg", color: "#d97706", shape: "dot" },
  nonveg: { label: "Non-veg", color: "#8b3a1e", shape: "triangle" },
} as const;

export function DietMark({ diet, className = "" }: { diet: Diet; className?: string }) {
  const d = DIET[diet];
  return (
    <span
      title={d.label}
      aria-label={d.label}
      className={`inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] bg-white ${className}`}
      style={{ borderColor: d.color }}
    >
      {d.shape === "dot" ? (
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: d.color }} />
      ) : (
        <span
          className="h-0 w-0 border-x-[3.5px] border-b-[6px] border-x-transparent"
          style={{ borderBottomColor: d.color }}
        />
      )}
    </span>
  );
}

export function SpiceLevel({ level }: { level: number }) {
  if (level <= 0) return null;
  const label = ["", "Mild", "Medium", "Hot"][level];
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-chili" title={`${label} spice`}>
      {"🌶".repeat(level)}
      <span className="ml-0.5">{label}</span>
    </span>
  );
}
