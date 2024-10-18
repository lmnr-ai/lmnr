import PublicPipeline from '@/components/public-pipeline/public-pipeline';
import { fetcherJSON } from '@/lib/utils';
import { Metadata } from 'next';

// TODO: Add pipeline name to the params
export const metadata: Metadata = {
  title: 'Pipeline',
  openGraph: {
    type: 'website',
    title: 'Laminar AI pipeline',
    description: 'LLM pipeline built on lmnr.ai'
  },
  twitter: {
    card: 'summary',
    description: 'LLM pipeline built on lmnr.ai',
    title: 'Laminar AI pipeline',
    images: {
      url: 'https://www.lmnr.ai/twitter-image.png',
      alt: 'Logo of Laminar AI - the LLM pipeline engineering platform'
    }
  }
};

// required to force reload on each pipeline page visit
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinePage({
  params,
  searchParams
}: {
  params: { pipelineId: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}) {
  const pipelineId = params.pipelineId;

  const pipeline = await fetcherJSON(`/public/pipelines/${pipelineId}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json'
    }
  });

  return (
    <>
      <PublicPipeline pipeline={pipeline} />
    </>
  );
}
