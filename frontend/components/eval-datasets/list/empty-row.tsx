import { TableCell, TableRow } from "@/components/ui/table";

export default function EvalDatasetsEmptyRow() {
  return (
    <TableRow className="flex">
      <TableCell className="h-auto w-full rounded-b p-4 text-center">
        <div className="flex flex-1 justify-center">
          <div className="flex max-w-md flex-col items-center gap-2">
            <h3 className="text-base font-medium text-secondary-foreground">No eval datasets yet</h3>
            <p className="text-center text-sm text-muted-foreground">
              An eval dataset versions the tasks of one folder under <code>evals/</code>. Push one with{" "}
              <code>npx lmnr-cli eval push</code>, and pin the version your repo runs in its <code>lmnr.lock</code>.
            </p>
          </div>
        </div>
      </TableCell>
    </TableRow>
  );
}
