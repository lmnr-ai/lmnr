import { PropsWithChildren } from "react";

interface SettingsSectionHeaderProps {
  title: string;
  description: string;
  size?: "sm" | "lg";
}

export function SettingsSectionHeader({ title, description, size = "lg" }: SettingsSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className={size === "lg" ? "text-2xl font-semibold" : "text-base font-semibold"}>{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsSection({ children }: PropsWithChildren) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

export function SettingsTable({ children }: PropsWithChildren) {
  return (
    <div className="border rounded-md">
      <table className="w-full">
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function SettingsTableRow({ children }: PropsWithChildren) {
  return <tr className="border-b last:border-b-0 h-12">{children}</tr>;
}
