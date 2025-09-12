import { NextResponse } from 'next/server';

import { getEvents } from '@/lib/actions/events';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; spanId: string }> }
): Promise<Response> {
  const params = await props.params;
  const { projectId, spanId } = params;

  try {
    const events = await getEvents({ spanId, projectId });
    return NextResponse.json(events);
  } catch (error) {
    return NextResponse.json({ error: "Events not found" }, { status: 404 });
  }
}
