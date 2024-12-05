import { ArrowRight } from 'lucide-react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

import { useProjectContext } from '@/contexts/project-context';
import { swrFetcher } from '@/lib/utils';

import { Skeleton } from '../ui/skeleton';

const URL_QUERY_PARAMS = {
  COMPARE_EVAL_ID: 'comparedEvaluationId'
};

const getEvaluationIdFromPathname = (pathName: string) => {
  if (pathName.endsWith('/')) {
    pathName = pathName.slice(0, -1);
  }
  const pathParts = pathName.split('/');
  return pathParts[pathParts.length - 1];
};

interface ScoreCardProps {
  scoreName: string;
}

export default function ScoreCard({ scoreName }: ScoreCardProps) {
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const { projectId } = useProjectContext();

  const [evaluationId, setEvaluationId] = useState(
    getEvaluationIdFromPathname(pathName)
  );
  const [comparedEvaluationId, setComparedEvaluationId] = useState(
    searchParams.get(URL_QUERY_PARAMS.COMPARE_EVAL_ID)
  );

  const { data, isLoading, error } = useSWR(
    `/api/projects/${projectId}/evaluation-score-stats?evaluationId=${evaluationId}&scoreName=${scoreName}`,
    swrFetcher
  );
  const {
    data: comparedData,
    isLoading: isComparedLoading,
    error: isComparedError
  } = useSWR(
    comparedEvaluationId
      ? `/api/projects/${projectId}/evaluation-score-stats?evaluationId=${comparedEvaluationId}&scoreName=${scoreName}`
      : null,
    swrFetcher
  );

  useEffect(() => {
    setEvaluationId(getEvaluationIdFromPathname(pathName));
  }, [pathName]);

  useEffect(() => {
    setComparedEvaluationId(searchParams.get(URL_QUERY_PARAMS.COMPARE_EVAL_ID));
  }, [searchParams]);

  return (
    <div className="rounded-lg shadow-md h-full">
      {isLoading || !data || error ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <div>
          <h2 className="text-xl font-semibold mb-4">{scoreName}</h2>
          <div className="flex flex-col">
            <div className="text-sm text-gray-500">Average</div>
            <div className="flex flex-row">
              {!isComparedLoading &&
                comparedData &&
                !isComparedError &&
                comparedData.averageValue != null && (
                <div className="flex flex-row items-center">
                  <div className="text-5xl font-bold mr-2">
                    {comparedData.averageValue?.toFixed(2)}
                  </div>
                  <ArrowRight className="text-5xl font-bold mr-2" size={24} />
                </div>
              )}
              <div className="text-5xl font-bold">
                {data.averageValue?.toFixed(2)}
              </div>
            </div>
            {!isComparedLoading &&
              comparedData &&
              !isComparedError &&
              comparedData.averageValue != null && (
              <div
                className={`text-md font-medium ${data.averageValue >= comparedData.averageValue ? 'text-green-400' : 'text-red-400'}`}
              >
                <span className="mx-1">
                  {data.averageValue >= comparedData.averageValue ? '▲' : '▼'}
                </span>
                {Math.abs(
                  data.averageValue - comparedData.averageValue
                ).toFixed(2)}
                {comparedData.averageValue !== 0 && (
                  <span>
                    {' '}
                      (
                    {(
                      ((data.averageValue - comparedData.averageValue) /
                          comparedData.averageValue) *
                        100
                    ).toFixed(2)}
                      %)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
