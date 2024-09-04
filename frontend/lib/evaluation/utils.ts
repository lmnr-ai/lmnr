import { EvaluationDatapointPreview, EvaluationDatapointPreviewWithCompared } from "./types";

export function mergeOriginalWithComparedDatapoints(results: EvaluationDatapointPreview[], comparedResults: EvaluationDatapointPreview[]): EvaluationDatapointPreviewWithCompared[] {
  // Assumes that the results and comparedResults are of the same length
  // but for safety, we'll take the minimum length
  const minLen = Math.min(results.length, comparedResults.length);

  const mergedResults: EvaluationDatapointPreviewWithCompared[] = [];
  for (let i = 0; i < minLen; i++) {
    const original = results[i];
    const compared = comparedResults[i];

    if (original.status === 'Error' || compared.status === 'Error') {
      mergedResults.push(original as EvaluationDatapointPreviewWithCompared);
      continue;
    }

    const merged: EvaluationDatapointPreviewWithCompared = {
      ...original,
      comparedId: compared.id,
      comparedEvaluationId: compared.evaluationId,
      comparedScores: compared.scores,
    };
    mergedResults.push(merged);
  }

  return mergedResults;
}
