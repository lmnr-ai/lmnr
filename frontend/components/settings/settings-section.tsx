import { times } from "lodash";
import { type PropsWithChildren, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

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
  colSpan?: number;
}

export function SettingsTable({
  children,
  headers,
  isLoading = false,
  isEmpty = false,
  emptyMessage = "No items found.",
  loadingRowCount = 5,
  colSpan = 2,
}: SettingsTableProps) {
  return (
    <div className="border rounded-md">
      <table className="w-full">
        {headers && (
          <thead>
            <tr className="border-b h-10">
              {headers.map((h, i) => (
                <th key={i} className="px-4 text-left text-xs font-medium text-muted-foreground">
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
              <td colSpan={colSpan} align="center" className="p-2">
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

interface SettingsTableRowProps extends PropsWithChildren {
  className?: string;
  onClick?: () => void;
}

export function SettingsTableRow({ children, className, onClick }: SettingsTableRowProps) {
  return (
    <tr className={cn("border-b last:border-b-0 h-12", className)} onClick={onClick}>
      {children}
    </tr>
  );
}
