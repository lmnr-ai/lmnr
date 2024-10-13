'use client';

import { useState, useEffect } from 'react';
import TraceView from './trace-view';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Resizable } from 're-resizable';
import TracesTable from './traces-table-traces-view';
import { Tabs, TabsTrigger, TabsList, TabsContent } from '../ui/tabs';
import SessionsTable from './traces-table-sessions-view';


export default function Traces() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const [traceId, setTraceId] = useState<string | null>(searchParams.get('traceId') ?? null);
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(traceId != null);

  useEffect(() => {
    setIsSidePanelOpen(traceId != null);
  }, [traceId]);

  return (
    <div className="flex flex-col h-full flex-grow">
      <div className='flex-grow flex'>
        <Tabs
          defaultValue={searchParams.get('view') ?? 'traces'}
          className='flex flex-col w-full'
          onValueChange={(v) => {
            searchParams.delete('filter');
            searchParams.delete('selectedId');
            searchParams.delete('textSearch');
            searchParams.delete('startDate');
            searchParams.delete('endDate');
            searchParams.set('pastHours', '24');
            setIsSidePanelOpen(false);
            setTraceId(null);
            router.push(`${pathName}?${searchParams.toString()}`);
          }}>
          <div className='flex-none'>
            <TabsList className='w-full flex px-4 border-b'>
              <TabsTrigger value='traces'>Traces</TabsTrigger>
              <TabsTrigger value='sessions'>Sessions</TabsTrigger>
            </TabsList>
          </div>
          <div className='flex-grow flex'>
            <TabsContent value='traces' className='w-full'>
              <TracesTable onRowClick={setTraceId} />
            </TabsContent>
            <TabsContent value='sessions' className='w-full'>
              <SessionsTable onRowClick={setTraceId} />
            </TabsContent>
          </div>
        </Tabs >
      </div >
      {isSidePanelOpen && (
        <div className='absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex'>
          <Resizable
            enable={
              {
                top: false,
                right: false,
                bottom: false,
                left: true,
                topRight: false,
                bottomRight: false,
                bottomLeft: false,
                topLeft: false
              }
            }
            defaultSize={{
              width: 1000,
            }}
          >
            <div className='w-full h-full flex'>
              <TraceView
                onClose={() => {
                  searchParams.delete('traceId');
                  router.push(`${pathName}?${searchParams.toString()}`);
                  setIsSidePanelOpen(false);
                  setTraceId(null);
                }}
                traceId={traceId!}
              />
            </div>
          </Resizable>
        </div>
      )
      }
    </div >
  );
}
