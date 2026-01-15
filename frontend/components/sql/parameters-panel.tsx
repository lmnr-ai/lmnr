"use client";

import { VariableIcon } from "lucide-react";
import React from "react";

import { DatePicker } from "@/components/sql/date-picker";
import { type SQLParameter } from "@/components/sql/sql-editor-store";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";

interface ParametersPanelProps {
  parameters: SQLParameter[];
  onChange: (name: string, value?: SQLParameter["value"]) => void;
}

const ParametersPanel = ({ parameters, onChange }: ParametersPanelProps) => (
  <div className="size-full">
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
            {parameters.map((parameter) => (
              <TableRow className="last:border-b-0" key={parameter.name}>
                <TableCell className="font-medium">
                  <code className="bg-muted px-2 py-1 rounded text-sm">{parameter.name}</code>
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground capitalize">{parameter.type}</span>
                </TableCell>
                <TableCell className="w-80">
                  <CellRenderer onChange={onChange} parameter={parameter} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    )}
  </div>
);

export default ParametersPanel;

const CellRenderer = ({
  parameter,
  onChange,
}: {
  parameter: SQLParameter;
  onChange: ParametersPanelProps["onChange"];
}) => {
  switch (parameter.type) {
    case "date":
      return (
        <DatePicker
          date={parameter.value}
          onDateChange={(date) => onChange(parameter.name, date)}
          placeholder={`Select ${parameter.name}`}
        />
      );

    case "string":
      return (
        <Input
          className="hide-arrow h-7"
          type="text"
          value={parameter.value}
          onChange={(e) => onChange(parameter.name, e.target.value)}
        />
      );

    case "number":
      return (
        <Input
          className="hide-arrow h-7"
          type="number"
          value={parameter.value}
          onChange={(e) => onChange(parameter.name, Number(e.target.value))}
        />
      );
  }
};
