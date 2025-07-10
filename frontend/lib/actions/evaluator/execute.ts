import { z } from "zod/v4";

const ExecuteEvaluatorSchema = z.object({
  input: z.any(),
  definition: z.object({
    function_code: z.string().min(1, { error: "Function code is required" }),
  }),
});

const EvaluatorResponseSchema = z.object({
  score: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
});

const EnvironmentSchema = z.object({
  ONLINE_EVALUATORS_SECRET_KEY: z.string({ error: "ONLINE_EVALUATORS_SECRET_KEY is required" }),
  PYTHON_ONLINE_EVALUATOR_URL: z.string({ error: "PYTHON_ONLINE_EVALUATOR_URL must be a valid URL" }),
});

const getEnvironmentVariables = () => {
  const env = {
    ONLINE_EVALUATORS_SECRET_KEY: process.env.ONLINE_EVALUATORS_SECRET_KEY,
    PYTHON_ONLINE_EVALUATOR_URL: process.env.PYTHON_ONLINE_EVALUATOR_URL,
  };

  return EnvironmentSchema.parse(env);
};

const getRequestHeaders = (token: string) => ({
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
  "User-Agent": "lmnr-evaluator/1.0",
});

const callEvaluatorService = async (
  url: string,
  headers: Record<string, string>,
  evaluatorRequest: z.infer<typeof ExecuteEvaluatorSchema>
): Promise<z.infer<typeof EvaluatorResponseSchema>> => {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(evaluatorRequest),
  });

  if (!response.ok) {
    const errorResponse = await response.json();
    throw new Error(errorResponse);
  }

  const responseData = await response.json();
  return EvaluatorResponseSchema.parse(responseData);
};

export const executeEvaluator = async (input: z.infer<typeof ExecuteEvaluatorSchema>) => {
  const { ONLINE_EVALUATORS_SECRET_KEY, PYTHON_ONLINE_EVALUATOR_URL } = getEnvironmentVariables();
  const { input: evaluatorInput, definition } = ExecuteEvaluatorSchema.parse(input);

  const evaluatorRequest: z.infer<typeof ExecuteEvaluatorSchema> = {
    definition,
    input: evaluatorInput,
  };

  const headers = getRequestHeaders(ONLINE_EVALUATORS_SECRET_KEY);

  const evaluatorResponse = await callEvaluatorService(PYTHON_ONLINE_EVALUATOR_URL, headers, evaluatorRequest);

  if (evaluatorResponse.error) {
    throw new Error(evaluatorResponse.error);
  }

  return {
    score: evaluatorResponse.score,
  };
};
