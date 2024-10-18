import TracesDashboard from '@/components/traces/traces';
import { Metadata } from 'next';
import Header from '@/components/ui/header';

export const metadata: Metadata = {
  title: 'Traces'
};

export default async function TracesPage() {
  return (
    <>
      <Header path={'traces'} className="border-b-0" />
      <TracesDashboard />
    </>
  );
}
