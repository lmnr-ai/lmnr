import { Search, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const SKELETON_COLUMNS = 4;
const SKELETON_ROWS = 5;

export default function EvalTableSkeleton() {
  return (
    <div className="flex overflow-hidden flex-1">
      <div className="flex flex-col gap-2 relative overflow-hidden w-full">
        <div className="flex flex-col gap-2 items-start">
          <div className="flex flex-1 w-full space-x-2">
            <Button icon="filter" variant="outline" disabled>
              Add filter
            </Button>
            <Button icon="columns2" className="text-secondary-foreground" variant="outline" disabled>
              Columns
            </Button>
            <Button className="h-7 w-7" variant="outline" size="icon" disabled>
              <Settings className="h-4 w-4 text-secondary-foreground" />
            </Button>
            <div className="flex flex-1 relative">
              <div className="flex items-center gap-x-1 border px-2 h-7 rounded-md w-full bg-secondary opacity-50">
                <Search size={14} className="text-secondary-foreground" />
                <span className="text-xs text-muted-foreground">Search in data, targets, scores and spans...</span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex relative overflow-auto styled-scrollbar bg-secondary border rounded">
          <div className="size-full">
            <Table className="grid border-collapse border-spacing-0 rounded bg-secondary">
              <TableHeader className="text-xs flex bg-secondary rounded-t sticky top-0 z-20">
                <TableRow className="p-0 m-0 w-full rounded-tl rounded-tr flex">
                  {Array.from({ length: SKELETON_COLUMNS }).map((_, i) => (
                    <TableHead
                      key={i}
                      className="m-0 relative text-secondary-foreground truncate flex-1"
                      style={{ height: 32, display: "flex" }}
                    >
                      <div className="flex items-center pl-4 h-full">
                        <Skeleton className="h-3 w-16" />
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {Array.from({ length: SKELETON_ROWS }).map((_, rowIdx) => (
                  <TableRow key={rowIdx} className="flex min-w-full border-b last:border-b-0" style={{ height: 36 }}>
                    {Array.from({ length: SKELETON_COLUMNS }).map((_, colIdx) => (
                      <TableCell key={colIdx} className="relative px-4 py-0 m-0 flex items-center flex-1">
                        <Skeleton className="h-5 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}
