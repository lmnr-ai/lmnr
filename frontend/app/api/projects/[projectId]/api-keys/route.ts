import { type NextRequest } from 'next/server';
import { prettifyError,ZodError } from 'zod/v4';

import { createApiKey, deleteApiKey, getApiKeys } from '@/lib/actions/project-api-keys';

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    const result = await createApiKey({
      projectId: params.projectId,
      name: body.name,
    });

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error creating project API key:', error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const apiKeys = await getApiKeys({
      projectId: params.projectId,
    });

    return new Response(JSON.stringify(apiKeys), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching project API keys:', error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    await deleteApiKey({
      projectId: params.projectId,
      id: body.id,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Error deleting project API key:', error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}
