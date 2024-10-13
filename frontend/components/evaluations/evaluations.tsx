'use client';

import { useProjectContext } from '@/contexts/project-context';
import { Evaluation } from '@/lib/evaluation/types';
import { ColumnDef } from '@tanstack/react-table';
import ClientTimestampFormatter from '../client-timestamp-formatter';
import { useRouter } from 'next/navigation';
import { DataTable } from '../ui/datatable';
import Mono from '../ui/mono';
import Header from '../ui/header';
import EvalsPagePlaceholder from './page-placeholder';
import { useUserContext } from '@/contexts/user-context';

export interface EvaluationProps {
  evaluations: Evaluation[];
}

export default function Evaluations({ evaluations }: EvaluationProps) {
  const { projectId } = useProjectContext();
  const router = useRouter();

  const { email } = useUserContext();

  const columns: ColumnDef<Evaluation>[] = [
    {
      accessorKey: 'groupId',
      header: 'Group id',
      size: 120
    },
    {
      accessorKey: 'id',
      cell: (row) => <Mono>{String(row.getValue())}</Mono>,
      header: 'ID',
      size: 300
    },
    {
      accessorKey: 'name',
      header: 'Name',
    },
    {
      header: 'Created at',
      accessorKey: 'createdAt',
      cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
    }
  ];

  if (evaluations.length === 0) {
    return (
      <div className="flex flex-col h-full">
        <Header path="evaluations" />

        <EvalsPagePlaceholder />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header path="evaluations" />
      <div className="flex justify-between items-center flex-none h-14 p-4">
        <h3 className="scroll-m-20 text-lg font-semibold tracking-tight">
          Evaluations
        </h3>
        {/* <CreateEvaluationDialog /> */}
      </div>
      <div className="flex-grow">
        <DataTable columns={columns} data={evaluations} onRowClick={(row) => {
          router.push(`/project/${projectId}/evaluations/${row.original.id}`);
        }} />
      </div>
    </div>
  );
}
