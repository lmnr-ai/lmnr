'use client';

import { ColumnDef } from '@tanstack/react-table';
import { Loader2, Trash2 } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Resizable } from 're-resizable';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import { DataTable } from '@/components/ui/datatable';
import { useProjectContext } from '@/contexts/project-context';
import { Datapoint, Dataset as DatasetType } from '@/lib/dataset/types';
import { useToast } from '@/lib/hooks/use-toast';
import { PaginatedResponse } from '@/lib/types';
import { swrFetcher } from '@/lib/utils';

import ClientTimestampFormatter from '../client-timestamp-formatter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog';
import DownloadButton from '../ui/download-button';
import Header from '../ui/header';
import MonoWithCopy from '../ui/mono-with-copy';
import AddDatapointsDialog from './add-datapoints-dialog';
import DatasetPanel from './dataset-panel';
import IndexDatasetDialog from './index-dataset-dialog';
import ManualAddDatapoint from './manual-add-datapoint-dialog';

interface DatasetProps {
  dataset: DatasetType;
}

export default function Dataset({ dataset }: DatasetProps) {
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const { projectId } = useProjectContext();
  const { toast } = useToast();
  const [datapoints, setDatapoints] = useState<Datapoint[] | undefined>(undefined);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Get datapointId from URL params
  const datapointId = searchParams.get('datapointId');
  const [selectedDatapoint, setSelectedDatapoint] = useState<Datapoint | null>(null);

  const parseNumericSearchParam = (
    key: string,
    defaultValue: number
  ): number => {
    const param = searchParams.get(key);
    if (Array.isArray(param)) {
      return defaultValue;
    }
    const parsed = param ? parseInt(param as string) : defaultValue;
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const pageNumber = parseNumericSearchParam('pageNumber', 0);
  const pageSize = Math.max(parseNumericSearchParam('pageSize', 50), 1);

  const [totalCount, setTotalCount] = useState<number>(0);
  const pageCount = Math.ceil(totalCount / pageSize);

  const { data, mutate } = useSWR<PaginatedResponse<Datapoint>>(
    `/api/projects/${projectId}/datasets/${dataset.id}/datapoints` +
      `?pageNumber=${pageNumber}&pageSize=${pageSize}`,
    swrFetcher
  );

  useEffect(() => {
    if (data) {
      setDatapoints(data.items);
      setTotalCount(data.totalCount);
    }
  }, [data]);

  useEffect(() => {
    if (!datapointId) {
      setSelectedDatapoint(null);
    }
  }, [datapointId]);

  const columns: ColumnDef<Datapoint>[] = [
    {
      accessorKey: 'createdAt',
      header: 'Created at',
      size: 150,
      cell: (row) => (
        <ClientTimestampFormatter timestamp={String(row.getValue())} />
      )
    },
    {
      accessorFn: (row) => JSON.stringify(row.data),
      header: 'Data',
      size: 200
    },
    {
      accessorFn: (row) => (row.target ? JSON.stringify(row.target) : '-'),
      header: 'Target',
      size: 200
    },
    {
      accessorFn: (row) => (row.metadata ? JSON.stringify(row.metadata) : '-'),
      header: 'Metadata',
      size: 200
    }
  ];

  const handleDeleteDatapoints = async (datapointIds: string[]) => {
    setIsDeleting(true);
    const response = await fetch(
      `/api/projects/${projectId}/datasets/${dataset.id}/datapoints` +
        `?datapointIds=${datapointIds.join(',')}` +
        (dataset.indexedOn ? `&indexedOn=${dataset.indexedOn}` : ''),
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    if (!response.ok) {
      toast({
        title: 'Failed to delete datapoints',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Datapoints deleted',
        description: `Successfully deleted ${datapointIds.length} datapoint(s).`,
      });
      mutate();
    }

    if (selectedDatapoint && datapointIds.includes(selectedDatapoint.id)) {
      handleDatapointSelect(null);
    }

    setIsDeleting(false);
    setIsDeleteDialogOpen(false);
  };

  // Update URL when datapoint is selected
  const handleDatapointSelect = (datapoint: Datapoint | null) => {
    setSelectedDatapoint(datapoint);
    const newSearchParams = new URLSearchParams(searchParams);
    if (datapoint) {
      newSearchParams.set('datapointId', datapoint.id);
    } else {
      newSearchParams.delete('datapointId');
    }
    router.push(`${pathName}?${newSearchParams.toString()}`);
  };

  // Load selected datapoint from URL param on initial load
  useEffect(() => {
    if (datapointId && datapoints) {
      const datapoint = datapoints.find(d => d.id === datapointId);
      if (datapoint) {
        setSelectedDatapoint(datapoint);
      }
    }
  }, [datapointId, datapoints]);

  return (
    <div className="h-full flex flex-col">
      <Header path={'datasets/' + dataset.name} />
      <div className="flex flex-none p-4 items-center space-x-4">
        <div className="flex-grow flex items-center space-x-4">
          <h1 className="text-2xl font-medium">{dataset.name}</h1>
          <MonoWithCopy className="text-secondary-foreground pt-1">{dataset.id}</MonoWithCopy>
        </div>
        <IndexDatasetDialog
          datasetId={dataset.id}
          defaultDataset={dataset}
          onUpdate={() => {
            mutate();
            router.refresh();
          }}
        />
        <DownloadButton
          uri={`/api/projects/${projectId}/datasets/${dataset.id}/download`}
          fileFormat="JSON"
          filenameFallback={`${dataset.name.replace(/[^a-zA-Z0-9-_\.]/g, '_')}-${dataset.id}.json`}
          variant="outline"
        />
        <AddDatapointsDialog datasetId={dataset.id} onUpdate={mutate} />
        <ManualAddDatapoint datasetId={dataset.id} onUpdate={mutate} />
      </div>
      <div className="flex-grow">
        <DataTable
          columns={columns}
          data={datapoints}
          getRowId={(datapoint) => datapoint.id}
          onRowClick={(row) => {
            handleDatapointSelect(row.original);
          }}
          paginated
          focusedRowId={datapointId}
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
          selectionPanel={(selectedRowIds) => (
            <div className="flex flex-col space-y-2">
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="ghost">
                    <Trash2 size={12} />
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Datapoints</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to delete
                      {selectedRowIds.length} datapoint(s)? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)} disabled={isDeleting}>
                      Cancel
                    </Button>
                    <Button onClick={() => handleDeleteDatapoints(selectedRowIds)} disabled={isDeleting}>
                      {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Delete
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        />
      </div>
      {selectedDatapoint && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
          <Resizable
            enable={{
              top: false,
              right: false,
              bottom: false,
              left: true,
              topRight: false,
              bottomRight: false,
              bottomLeft: false,
              topLeft: false
            }}
            defaultSize={{
              width: 800
            }}
          >
            <div className="w-full h-full flex">
              <DatasetPanel
                datasetId={dataset.id}
                datapoint={selectedDatapoint}
                onClose={() => {
                  handleDatapointSelect(null);
                  mutate();
                }}
                indexedOn={dataset.indexedOn}
              />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
