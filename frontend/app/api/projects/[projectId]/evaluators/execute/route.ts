import { NextRequest } from "next/server";
import { z } from "zod/v4";

const requestBodySchema = z.object({
  input: z.any(),
  definition: z.object({
    function_code: z.string().min(1, { error: "Function code is required" }),
  }),
});

const evaluatorResponseSchema = z.object({
  score: z.number().nullable().optional(),
  error: z.string().nullable().optional(),
});

const environmentSchema = z.object({
  ONLINE_EVALUATORS_SECRET_KEY: z.string().min(1, { error: "ONLINE_EVALUATORS_SECRET_KEY is required" }),
  PYTHON_ONLINE_EVALUATOR_URL: z.string().url({ error: "PYTHON_ONLINE_EVALUATOR_URL must be a valid URL" }),
});

type EvaluatorRequest = {
  definition: Record<string, unknown>;
  input: unknown;
};

type EvaluatorResponse = z.infer<typeof evaluatorResponseSchema>;

function validateEnvironment() {
  const env = {
    ONLINE_EVALUATORS_SECRET_KEY: process.env.ONLINE_EVALUATORS_SECRET_KEY,
    PYTHON_ONLINE_EVALUATOR_URL: process.env.PYTHON_ONLINE_EVALUATOR_URL,
  };

  try {
    return environmentSchema.parse(env);
  } catch (error) {
    console.error("Environment validation failed:", error);
    throw new Error("Server configuration error");
  }
}

function createRequestHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "User-Agent": "lmnr-evaluator/1.0",
  };
}

async function callEvaluatorService(
  url: string,
  headers: Record<string, string>,
  evaluatorRequest: EvaluatorRequest
): Promise<EvaluatorResponse> {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(evaluatorRequest),
  });

  if (!response.ok) {
    const status = response.status;

    let error: string | null;
    try {
      const errorResponse = await response.json();
      error = errorResponse.error;
    } catch {
      try {
        error = await response.text();
      } catch {
        error = null;
      }
    }

    if (status >= 500) {
      throw new Error(error || "Evaluator service temporarily unavailable");
    } else if (status >= 400) {
      throw new Error(error || "Invalid request to evaluator service");
    } else {
      throw new Error(error || "Unexpected response from evaluator service");
    }
  }

  const responseData = await response.json();
  return evaluatorResponseSchema.parse(responseData);
}

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const { ONLINE_EVALUATORS_SECRET_KEY, PYTHON_ONLINE_EVALUATOR_URL } = validateEnvironment();
    const body = await req.json();
    const { input, definition } = requestBodySchema.parse(body);

    const evaluatorRequest: EvaluatorRequest = {
      definition,
      input,
    };

    const headers = createRequestHeaders(ONLINE_EVALUATORS_SECRET_KEY);

    const evaluatorResponse = await callEvaluatorService(PYTHON_ONLINE_EVALUATOR_URL, headers, evaluatorRequest);

    if (evaluatorResponse.error) {
      return Response.json({ error: evaluatorResponse.error }, { status: 400 });
    }

    return Response.json({
      score: evaluatorResponse.score,
    });
  } catch (error) {
    console.error("Failed to execute evaluator:", error);

    if (error instanceof z.ZodError) {
      return Response.json({ error: "Validation error", details: error.issues }, { status: 400 });
    }

    if (error instanceof SyntaxError) {
      return Response.json({ error: "Invalid JSON in request body" }, { status: 400 });
    }

    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
