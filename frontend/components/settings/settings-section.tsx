import { times } from "lodash";
import { type PropsWithChildren, type ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface SettingsSectionHeaderProps {
  title: string;
  description?: string;
  size?: "sm" | "lg";
}

export function SettingsSectionHeader({ title, description, size = "lg" }: SettingsSectionHeaderProps) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className={size === "lg" ? "text-2xl font-semibold" : "text-base font-semibold"}>{title}</h1>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
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
    <div className="border rounded-md overflow-x-auto">
      <Table>
        {headers && (
          <TableHeader>
            <TableRow className="h-10 hover:bg-transparent">
              {headers.map((h, i) => (
                <TableHead key={i} className="px-4 text-xs">
                  {h}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {isLoading ? (
            times(loadingRowCount, (i) => (
              <SettingsTableRow key={i}>
                <TableCell colSpan={colSpan}>
                  <Skeleton className="h-8 w-full" />
                </TableCell>
              </SettingsTableRow>
            ))
          ) : isEmpty ? (
            <SettingsTableRow>
              <TableCell colSpan={colSpan} align="center">
                <span className="text-center text-secondary-foreground text-sm font-medium">{emptyMessage}</span>
              </TableCell>
            </SettingsTableRow>
          ) : (
            children
          )}
        </TableBody>
      </Table>
    </div>
  );
}

interface SettingsTableRowProps extends PropsWithChildren {
  className?: string;
  onClick?: () => void;
}

export function SettingsTableRow({ children, className, onClick }: SettingsTableRowProps) {
  return (
    <TableRow
      // Non-clickable rows keep the flat look; clickable rows get the primitive's hover affordance.
      className={cn("border-b last:border-b-0 h-12", !onClick && "hover:bg-transparent", className)}
      onClick={onClick}
    >
      {children}
    </TableRow>
  );
}
