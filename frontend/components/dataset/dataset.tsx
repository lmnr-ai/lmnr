'use client'

import { Datapoint, Dataset as DatasetType } from "@/lib/dataset/types";
import { useEffect, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import AddDatapointsDialog from "./add-datapoints-dialog";
import { DataTable } from "@/components/ui/datatable";
import IndexDatasetDialog from "./index-dataset-dialog";
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ManualAddDatapoint from "./manual-add-datapoint-dialog";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import DatasetPanel from "./dataset-panel";
import Header from "../ui/header";
import DeleteDatapointsDialog from "./delete-datapoints-dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { useProjectContext } from "@/contexts/project-context";
import ClientTimestampFormatter from "../client-timestamp-formatter";
import { PaginatedResponse } from "@/lib/types";

interface DatasetProps {
  dataset: DatasetType;
}

export default function Dataset({
  dataset,
}: DatasetProps) {
  const [expandedDatapoint, setExpandedDatapoint] = useState<Datapoint | null>(null);
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const { projectId } = useProjectContext();
  const [selectedDatapointIds, setSelectedDatapointIds] = useState<string[]>([]);
  const [allDatapointsAcrossPagesSelected, setAllDatapointsAcrossPagesSelected] = useState<boolean>(false);
  const { toast } = useToast();
  const [datapoints, setDatapoints] = useState<Datapoint[] | undefined>(undefined);

  const parseNumericSearchParam = (key: string, defaultValue: number): number => {
    const param = searchParams.get(key);
    if (Array.isArray(param)) {
      return defaultValue;
    }
    const parsed = param ? parseInt(param as string) : defaultValue;
    return isNaN(parsed) ? defaultValue : parsed;
  }

  const pageNumber = parseNumericSearchParam('pageNumber', 0);
  const pageSize = Math.max(parseNumericSearchParam('pageSize', 50), 1);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageCount = Math.ceil(totalCount / pageSize);

  const deleteDatapoints = async (ids: string[], useAll: boolean) => {
    try {
      if (useAll) {
        await fetch(`/api/projects/${projectId}/datasets/${dataset.id}/datapoints/all`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } else {
        await fetch(`/api/projects/${projectId}/datasets/${dataset.id}/datapoints`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ids }),
        });
      }
      router.refresh();
    } catch (e) {
      toast({
        title: 'Error deleting datapoints',
      });
    }
  }

  const getDatapoints = async () => {
    setDatapoints(undefined);
    let url = `/api/projects/${projectId}/datasets/` +
      `${dataset.id}/datapoints?pageNumber=${pageNumber}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await res.json() as PaginatedResponse<Datapoint>;
    setDatapoints(data.items);
    setTotalCount(data.totalCount);
  };

  useEffect(() => {
    getDatapoints();
  }, [projectId, pageNumber, pageSize]);

  const columns: ColumnDef<Datapoint>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Created at',
      size: 200,
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    },
    {
      accessorFn: (row) => JSON.stringify(row.data),
      header: 'Data',
      size: 400,
    },
    {
      accessorFn: (row) => row.target ? JSON.stringify(row.target) : "-",
      header: 'Target',
      size: 400,
    },
  ]

  return (
    <div className="h-full flex flex-col">
      <Header path={"datasets/" + dataset.name} />
      <ResizablePanelGroup direction="horizontal">
        <ResizablePanel className="flex flex-col">
          <div className="flex flex-none p-4 h-12 items-center space-x-4">
            <div className="flex-grow text-lg font-semibold">
              <h1>
                {dataset.name}
              </h1>
            </div>
            <div className="text-secondary-foreground bg-secondary text-sm border rounded p-1 px-2">
              {dataset?.indexedOn
                ? `Indexed on "${dataset.indexedOn}"`
                : `Not indexed`}
            </div>
            <DeleteDatapointsDialog
              selectedDatapointIds={selectedDatapointIds}
              onDelete={deleteDatapoints}
              totalDatapointsCount={totalCount}
              useAll={allDatapointsAcrossPagesSelected} />
            <AddDatapointsDialog datasetId={dataset.id} onUpdate={router.refresh} />
            <ManualAddDatapoint datasetId={dataset.id} onUpdate={router.refresh} />
            <IndexDatasetDialog datasetId={dataset.id} defaultDataset={dataset} onUpdate={router.refresh} />
          </div>
          <div className='flex-grow'>
            <DataTable
              columns={columns}
              data={datapoints}
              getRowId={(datapoint) => datapoint.id}
              onRowClick={(row) => {
                setExpandedDatapoint(row.original);
              }}
              paginated
              focusedRowId={expandedDatapoint?.id}
              manualPagination
              pageCount={pageCount}
              defaultPageSize={pageSize}
              defaultPageNumber={pageNumber}
              onPageChange={(pageNumber, pageSize) => {
                searchParams.set('pageNumber', pageNumber.toString());
                searchParams.set('pageSize', pageSize.toString());
                router.push(`${pathName}?${searchParams.toString()}`);
              }}
              totalItemsCount={totalCount}
              enableRowSelection
              onSelectedRowsChange={setSelectedDatapointIds}
              onSelectAllAcrossPages={setAllDatapointsAcrossPagesSelected}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle />
        {expandedDatapoint && <ResizablePanel>
          <DatasetPanel datasetId={dataset.id} datapoint={expandedDatapoint} onClose={() => {
            setExpandedDatapoint(null);
          }}
          />
        </ResizablePanel>
        }
      </ResizablePanelGroup >
    </div >
  );
}
