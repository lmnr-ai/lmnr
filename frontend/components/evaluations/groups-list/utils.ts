const SWATCHES = [
  "bg-sky-500",
  "bg-violet-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-fuchsia-500",
  "bg-cyan-500",
  "bg-orange-500",
  "bg-lime-500",
  "bg-indigo-500",
];

export function hashGroupColor(groupId: string): string {
  let h = 0;
  for (let i = 0; i < groupId.length; i++) {
    h = (h * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return SWATCHES[h % SWATCHES.length];
}

export function groupInitials(groupId: string): string {
  const trimmed = groupId.trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/[\s_\-/.]+/).filter(Boolean);
  if (parts.length === 0) return trimmed.slice(0, 2).toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}
