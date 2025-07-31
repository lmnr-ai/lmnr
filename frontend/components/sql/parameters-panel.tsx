"use client";

import { VariableIcon } from "lucide-react";
import React from "react";

import { DatePicker } from "@/components/sql/date-picker";
import { useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

export function ParametersPanel() {
  const { parameters, setParameters } = useSqlEditorStore((state) => ({
    parameters: state.parameters,
    setParameters: state.setParameterValue,
  }));

  return (
    <div className="size-full p-4">
      {parameters.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
          <VariableIcon className="w-8 h-8 opacity-50" />
          <p className="text">No variables configured</p>
        </div>
      ) : (
        <div className="rounded-lg border max-w-5xl">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 font-medium">
                <TableCell>
                  <span>Parameter Name</span>
                </TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Value</TableCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {parameters.map((variable) => (
                <TableRow className="last:border-b-0" key={variable.name}>
                  <TableCell className="font-medium">
                    <code className="bg-muted px-2 py-1 rounded text-sm">{variable.name}</code>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground capitalize">{variable.type}</span>
                  </TableCell>
                  <TableCell className="w-80">
                    <DatePicker
                      date={variable.value}
                      onDateChange={(date) => setParameters(variable.name, date)}
                      placeholder={`Select ${variable.name}`}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
