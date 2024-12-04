'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { Resizable } from 're-resizable';
import { useEffect, useState } from 'react';

import { useUserContext } from '@/contexts/user-context';
import { Feature, isFeatureEnabled } from '@/lib/features/features';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import SessionsTable from './sessions-table';
import SpansTable from './spans-table';
import TraceView from './trace-view';
import TracesTable from './traces-table';

enum SelectedTab {
  TRACES = 'traces',
  SESSIONS = 'sessions',
  SPANS = 'spans'
}

export default function Traces() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const { email } = useUserContext();
  const posthog = usePostHog();
  const selectedView = searchParams.get('view') ?? SelectedTab.TRACES;

  const resetUrlParams = (newView: string) => {
    searchParams.delete('filter');
    searchParams.delete('textSearch');
    searchParams.delete('traceId');
    searchParams.delete('spanId');
    searchParams.set('view', newView);
    setIsSidePanelOpen(false);
    setTraceId(null);
    router.push(`${pathName}?${searchParams.toString()}`);
  };

  if (isFeatureEnabled(Feature.POSTHOG)) {
    posthog.identify(email);
  }

  const [traceId, setTraceId] = useState<string | null>(
    searchParams.get('traceId') ?? null
  );
  const [isSidePanelOpen, setIsSidePanelOpen] = useState<boolean>(
    traceId != null
  );

  useEffect(() => {
    setIsSidePanelOpen(traceId != null);
  }, [traceId]);

  return (
    <div className="flex flex-col h-full flex-grow">
      <div className="flex-grow flex">
        <Tabs
          value={selectedView}
          className="flex flex-col w-full"
          onValueChange={value => resetUrlParams(value)}
        >
          <div className="flex-none">
            <TabsList className="w-full flex px-4 border-b">
              <TabsTrigger value="traces">
                Traces
              </TabsTrigger>
              <TabsTrigger value="sessions">
                Sessions
              </TabsTrigger>
              <TabsTrigger value="spans">
                Spans
              </TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-grow flex">
            <TabsContent value="traces" className="w-full">
              <TracesTable onRowClick={setTraceId} />
            </TabsContent>
            <TabsContent value="sessions" className="w-full">
              <SessionsTable onRowClick={setTraceId} />
            </TabsContent>
            <TabsContent value="spans" className="w-full">
              <SpansTable onRowClick={setTraceId}/>
            </TabsContent>
          </div>
        </Tabs>
      </div>
      {isSidePanelOpen && (
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
              width: 1000
            }}
          >
            <div className="w-full h-full flex">
              <TraceView
                onClose={() => {
                  searchParams.delete('traceId');
                  searchParams.delete('spanId');
                  router.push(`${pathName}?${searchParams.toString()}`);
                  setIsSidePanelOpen(false);
                  setTraceId(null);
                }}
                traceId={traceId!}
              />
            </div>
          </Resizable>
        </div>
      )}
    </div>
  );
}
