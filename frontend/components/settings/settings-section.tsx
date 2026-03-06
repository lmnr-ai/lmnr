import { times } from "lodash";
import { type PropsWithChildren, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

interface SettingsSectionHeaderProps {
  title: string;
  description: string;
  size?: "sm" | "lg";
}

export function SettingsSectionHeader({ title, description, size = "lg" }: SettingsSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className={size === "lg" ? "text-lg font-medium" : "text-sm font-medium"}>{title}</h1>
      <p className="text-xs text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsSection({ children }: PropsWithChildren) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

interface SettingsTableProps {
  children: ReactNode;
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  loadingRowCount?: number;
}

export function SettingsTable({
  children,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "No items found.",
  loadingRowCount = 5,
}: SettingsTableProps) {
  return (
    <div className="border rounded-md">
      <table className="w-full">
        <tbody>
          {isLoading ? (
            times(loadingRowCount, (i) => (
              <SettingsTableRow key={i}>
                <td className="p-2">
                  <Skeleton className="h-8 w-full" />
                </td>
              </SettingsTableRow>
            ))
          ) : isEmpty ? (
            <SettingsTableRow>
              <td align="center" className="p-2">
                <span className="text-center text-muted-foreground text-xs">{emptyMessage}</span>
              </td>
            </SettingsTableRow>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SettingsTableRow({ children }: PropsWithChildren) {
  return <tr className="border-b last:border-b-0 h-10">{children}</tr>;
}
