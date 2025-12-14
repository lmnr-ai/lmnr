import express, { NextFunction, Request, Response } from 'express';
import { config } from 'dotenv';
import { modelMessageSchema } from 'ai';
import type { GenerateRequest } from './types';
import { z } from 'zod';
import { parseTools, runAiSdkRequest, StructuredOutput } from './aisdk';

config({ path: '.env.local' });

const PORT = Number(process.env.PORT ?? 3000);
const MAX_BODY_SIZE = 1024 * 1024; // 1MB upper bound to keep payloads reasonable

const zJsonObject = z
  .string()
  .optional()
  .transform((str, ctx): StructuredOutput => {
    if (!str) {
      return null;
    }
    try {
      return JSON.parse(str);
    } catch (error) {
      ctx.addIssue({ code: 'custom', message: 'structuredOutput must be valid JSON' });
      return z.NEVER;
    }
  });

const providerApiKeySchema = z.object({
  name: z.string().min(1, 'provider_api_key.name is required'),
  nonce: z.string().min(1, 'provider_api_key.nonce is required'),
  value: z.string().min(1, 'provider_api_key.value is required'),
});

const requestSchema = z.object({
  model: z.string().min(1, 'model is required'),
  messages: z.array(modelMessageSchema).min(1, 'messages array is required'),
  providerOptions: z.any().optional(),
  maxTokens: z.number().positive('maxTokens must be positive').optional(),
  temperature: z.number().min(0, 'temperature must be >= 0').max(2, 'temperature must be <= 2').optional(),
  topP: z.number().min(0, 'topP must be >= 0').max(1, 'topP must be <= 1').optional(),
  topK: z.number().positive('topK must be positive').optional(),
  tools: z
    .string()
    .optional()
    .transform((value, ctx) => {
      if (!value) {
        return undefined;
      }
      try {
        return parseTools(value);
      } catch (error) {
        ctx.addIssue({
          code: 'custom',
          message: error instanceof Error ? error.message : 'tools must be valid JSON',
        });
        return z.NEVER;
      }
    }),
  toolChoice: z.any().optional(),
  structuredOutput: zJsonObject,
  provider_api_key: providerApiKeySchema,
});

const app = express();

app.use(
  express.json({
    limit: `${MAX_BODY_SIZE}b`,
  })
);

app.post('/api/generate', async (req: Request<{}, any, GenerateRequest>, res: Response) => {
  const parsedResult = requestSchema.safeParse(req.body);

  if (!parsedResult.success) {
    const message = parsedResult.error.issues[0]?.message ?? 'Invalid payload';
    return res.status(400).json({ error: message });
  }

  try {
    const result = await runAiSdkRequest(parsedResult.data);
    return res.status(200).json(result);
  } catch (error: unknown) {
    console.error('AI SDK request failed', error);
    const message = error instanceof Error ? error.message : 'Failed to call model';
    return res.status(502).json({ error: message });
  }
});

app.use((req: Request, res: Response) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  if ((err as any)?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Payload too large' });
  }
  if (err instanceof SyntaxError) {
    return res.status(400).json({ error: 'Invalid JSON payload' });
  }
  console.error('Unhandled error', err);
  return res.status(500).json({ error: 'Internal Server Error' });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
