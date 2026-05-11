export default function VersionBadge() {
  if (process.env.LAMINAR_CLOUD === "true") return null;
  const version = process.env.LAMINAR_VERSION;
  if (!version) return null;
  return <span className="text-xs text-muted-foreground px-2">{version}</span>;
}
