
import { and, asc, eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { db } from '@/lib/db/drizzle';
import { events, labelClasses, labels, spans, traces } from '@/lib/db/migrations/schema';

export async function GET(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const traceId = params.traceId;

  const traceQuery = db.query.traces.findFirst({
    where: and(eq(traces.id, traceId), eq(traces.projectId, projectId)),
  });

  const spanEventsQuery = db.$with('span_events').as(
    db.select({
      spanId: events.spanId,
      projectId: events.projectId,
      events: sql`jsonb_agg(jsonb_build_object(
        'id', events.id,
        'spanId', events.span_id,
        'timestamp', events.timestamp,
        'name', events.name,
        'attributes', events.attributes
      ))`.as('events')
    })
      .from(events)
      .groupBy(events.spanId, events.projectId)
  );
  const spanLabelsQuery = db.$with('span_labels').as(
    db.select({
      spanId: labels.spanId,
      projectId: labelClasses.projectId,
      labels: sql`jsonb_agg(jsonb_build_object(
        'id', labels.id,
        'spanId', labels.span_id,
        'classId', labels.class_id,
        'createdAt', labels.created_at,
        'updatedAt', labels.updated_at,
        'className', label_classes.name,
        'valueMap', label_classes.value_map,
        'value', labels.value,
        'labelSource', labels.label_source,
        'description', label_classes.description,
        'reasoning', labels.reasoning
      ))`.as('labels')
    })
      .from(labels)
      .innerJoin(labelClasses, eq(labels.classId, labelClasses.id))
      .groupBy(labels.spanId, labelClasses.projectId)
  );

  const spansQuery = db.with(spanEventsQuery, spanLabelsQuery).select({
    // inputs and outputs are ignored on purpose
    spanId: spans.spanId,
    startTime: spans.startTime,
    endTime: spans.endTime,
    traceId: spans.traceId,
    parentSpanId: spans.parentSpanId,
    name: spans.name,
    attributes: spans.attributes,
    spanType: spans.spanType,
    events: sql`COALESCE(${spanEventsQuery.events}, '[]'::jsonb)`.as('events'),
    labels: sql`COALESCE(${spanLabelsQuery.labels}, '[]'::jsonb)`.as('labels')
  })
    .from(spans)
    .leftJoin(spanEventsQuery, eq(spans.spanId, spanEventsQuery.spanId))
    .leftJoin(spanLabelsQuery, eq(spans.spanId, spanLabelsQuery.spanId))
    .where(and(eq(spans.traceId, traceId), eq(spans.projectId, projectId)))
    .orderBy(asc(spans.startTime));

  const [trace, spanItems] = await Promise.all([traceQuery, spansQuery]);

  return NextResponse.json({ ...trace, spans: spanItems });
}

