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
      <h1 className={size === "lg" ? "text-2xl font-semibold" : "text-base font-semibold"}>{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function SettingsSection({ children }: PropsWithChildren) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

interface SettingsTableProps {
  children: ReactNode;
  headers?: string[];
  isLoading?: boolean;
  isEmpty?: boolean;
  emptyMessage?: string;
  loadingRowCount?: number;
}

export function SettingsTable({
  children,
  headers,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "No items found.",
  loadingRowCount = 5,
}: SettingsTableProps) {
  return (
    <div className="border rounded-md">
      <table className="w-full">
        {headers && (
          <thead>
            <tr className="border-b h-10">
              {headers.map((h) => (
                <th key={h} className="px-4 text-left text-xs font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
        )}
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
                <span className="text-center text-secondary-foreground text-sm font-medium">{emptyMessage}</span>
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
  return <tr className="border-b last:border-b-0 h-12">{children}</tr>;
}
