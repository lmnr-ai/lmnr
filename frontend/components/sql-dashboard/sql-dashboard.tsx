"use client";

import { ColumnDef } from "@tanstack/react-table";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import CodeEditor from "@/components/ui/code-editor";
import { DataTable } from "@/components/ui/datatable";

export default function SqlDashboard() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnDef<any>[]>([]);

  const executeQuery = async () => {
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sqlQuery: query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute query');
      }

      setResults(data.result);
      if (data.result && data.result.length > 0) {
        setColumns(Object.keys(data.result[0]).map((column: string) => ({
          header: column,
          accessorKey: column,
          cell: ({ row }) => (
            <div className="max-w-80 min-w-40 ">
              {JSON.stringify(row.original[column])}
            </div>
          )
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-4 h-full flex flex-col">
      <h1 className="text-2xl font-bold mb-4">SQL Dashboard</h1>
      <div className="mb-6 flex-grow">
        <h2 className="text-lg font-semibold mb-2">Query</h2>
        <CodeEditor
          editable
          value={query}
          onChange={(value) => setQuery(value)}
          language="sql"
          className="w-full p-2 border rounded h-32 font-mono"
          placeholder="Enter your SQL query here..."
        />
        <Button
          onClick={executeQuery}
          disabled={isLoading || !query.trim()}
          className="mt-2 px-4 py-2"
        >
          {isLoading ? 'Executing...' : 'Execute Query'}
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {results && (
        <DataTable
          columns={columns}
          data={results}
          className="flex flex-grow"
          paginated
        />
      )}
    </div>
  );
}
