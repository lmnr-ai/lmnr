import { NextRequest } from 'next/server';
import { prettifyError,ZodError } from 'zod/v4';

import { createProviderApiKey, deleteProviderApiKey, getProviderApiKeys } from '@/lib/actions/provider-api-keys';

export async function GET(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const apiKeys = await getProviderApiKeys({
      projectId: params.projectId,
    });

    return new Response(JSON.stringify(apiKeys), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error fetching provider API keys:', error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string }> }
): Promise<Response> {
  const params = await props.params;

  try {
    const body = await req.json();

    await createProviderApiKey({
      projectId: params.projectId,
      name: body.name,
      value: body.value,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Error creating provider API key:', error);
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
    const name = req.nextUrl.searchParams.get('name') ?? '';

    await deleteProviderApiKey({
      projectId: params.projectId,
      name,
    });

    return new Response(null, { status: 200 });
  } catch (error) {
    console.error('Error deleting provider API key:', error);
    if (error instanceof ZodError) {
      return new Response(prettifyError(error), { status: 400 });
    }
    if (error instanceof Error) {
      return new Response(error.message, { status: 404 });
    }
    return new Response('Internal Server Error', { status: 500 });
  }
}
