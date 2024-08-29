import { EvaluationDatapoint, EvaluationDatapointError } from '@/lib/evaluation/types';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { useRouter } from 'next/navigation';
import { useProjectContext } from '@/contexts/project-context';

// Checks if an object is empty
function isEmpty(obj: any) {
  for (const prop in obj) {
    if (Object.hasOwn(obj, prop)) {
      return false;
    }
  }

  return true;
}

interface EvaluationDatapointErrorProps {
  datapoint: EvaluationDatapoint;
}

/**
 * Evaluation datapoint error component
 *
 * If it's related to wrong input-output matching or missing env vars, it will show the error.
 * Otherwise, it will show nothing
 */
export default function EvaluationDatapointErr({ datapoint }: EvaluationDatapointErrorProps) {
  const router = useRouter();
  const { projectId } = useProjectContext();
  const error = datapoint.error as EvaluationDatapointError;

  return (
    (
      (error.errorType === "GraphError" && (error.error.startsWith("Graph input is missing:")))
      || error.errorType === "InvalidSchemasError"
      || error.errorType === "MissingEnvVarsError") ?

      (
        <div className="flex flex-col space-y-4">
          <Label>Error</Label>

          <div className="border-2 bg-secondary p-4 rounded">

            {(error.errorType === "GraphError") && (error.error.startsWith("Graph input is missing:")) && (!!error.executorInputNodeNames) && (
              <div className="flex flex-col space-y-2 font-medium text-sm">
                <div className="font-bold text-md">Executor inputs do not match</div>
                <div>Executor inputs</div>
                <ul className="list-disc list-inside">
                  {error.executorInputNodeNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                <div>Incoming inputs</div>
                {(isEmpty(datapoint.data)) ? <div>No data keys</div> : (<ul className="list-disc list-inside">
                  {Object.keys(datapoint.data).map((name) => (
                    <li key={name}>{name} (data)</li>
                  ))}
                </ul>)}
              </div>
            )}

            {error.errorType === "GraphError" && (error.error.startsWith("Graph input is missing:")) && (!!error.evaluatorInputNodeNames) && (
              <div className="flex flex-col space-y-2 font-medium text-sm">
                <div className="font-bold text-md">Evaluator inputs do not match</div>
                <div>Evaluator inputs</div>
                <ul className="list-disc list-inside">
                  {error.evaluatorInputNodeNames.map((name) => (
                    <li key={name}>{name}</li>
                  ))}
                </ul>
                <div>Incoming inputs</div>
                <ul className="list-disc list-inside">
                  {Object.keys(datapoint.target).map((name) => (
                    <li className="space-x-0" key={`target-${name}`}>{name} (target)</li>
                  ))}
                  {!datapoint.executorTrace ? (
                    Object.keys(datapoint.data).map((name) => (
                      <li className="space-x-0" key={`data-${name}`}>{name} (data)</li>
                    ))
                  ) : (
                    Object.keys(datapoint.executorOutput!).map((name) => (
                      <li className="space-x-0" key={`executorOutput-${name}`}>{name} (executor output)</li>
                    ))
                  )}
                </ul>
              </div>
            )}

            {error.errorType === "InvalidSchemasError" && (
              <div>
                <div className="font-medium text-sm">BAML schemas are invalid</div>
                <div className="text-sm text-gray-500">{error.error}</div>
              </div>
            )}

            {error.errorType === "MissingEnvVarsError" && (
              <div>
                <div className="font-medium text-sm">{error.error}</div>
                <Button className="max-w-32 mt-2" onClick={() => { router.push(`/project/${projectId}/env`) }}>Go to env vars</Button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <></>
      )
  )
} 