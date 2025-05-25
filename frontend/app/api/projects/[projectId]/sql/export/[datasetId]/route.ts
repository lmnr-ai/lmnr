import { and, eq } from 'drizzle-orm';
import { NextRequest, NextResponse } from 'next/server';

import { CreateDatapointsSchema } from '@/lib/dataset/types';
import { db } from '@/lib/db/drizzle';
import { datasetDatapoints, datasets } from '@/lib/db/migrations/schema';
import { downloadS3ObjectHttp } from '@/lib/s3';
import { inferImageType } from '@/lib/utils';

type JSONValue = string | number | boolean | null | JSONValue[] | { [key: string]: JSONValue };

type ImageUrl = {
  type: 'image_url';
  url: string;
  detail?: string;
}

type RelativeImageUrl = ImageUrl & {
  url: `/api/projects/${string}/payloads/${string}`;
}

type ImageBase64 = Omit<ImageUrl, 'type' | 'url'> & {
  type: 'image';
  base64: `data:image/${string};base64,${string}`;
}

const isRelativeImageUrl = (payload: JSONValue, projectId: string): payload is RelativeImageUrl => {
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    const keys = Object.keys(payload);
    const url = payload.url;
    const uuidRegex = '[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}';
    const imageUrlRegex = new RegExp(`^/api/projects/${projectId}/payloads/${uuidRegex}`);
    return payload.type === 'image_url' && typeof url === 'string' && imageUrlRegex.test(url);
  }
  return false;
};

const downloadImage = async (url: string, projectId: string): Promise<{
  blob: Blob;
  mediaType?: string;
} | undefined> => {
  const uuidRegex = '[0-9a-z]{8}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{12}';
  const imageUrlRegex = new RegExp(`^/api/projects/${projectId}/payloads/(${uuidRegex})`);
  const payloadId = url.match(imageUrlRegex)?.[1];
  if (payloadId) {
    const { bytes, headers } = await downloadS3ObjectHttp(projectId, payloadId, 'image');
    return {
      blob: new Blob([bytes]),
      mediaType: headers.get('Content-Type') || undefined,
    };
  }
};

const toImageBase64 = async (payload: RelativeImageUrl, projectId: string): Promise<ImageBase64 | RelativeImageUrl> => {
  const downloadResult = await downloadImage(payload.url, projectId);
  if (!downloadResult) {
    return payload;
  }
  const { blob, mediaType } = downloadResult;
  const arrayBuffer = await blob.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const base64 = buffer.toString('base64');

  const imageType = inferImageType(base64) ?? mediaType;
  return {
    type: 'image',
    base64: `data:image/${imageType};base64,${base64}`,
    detail: payload.detail,
  };
};

const materializeAttachments = async (payload: JSONValue, projectId: string): Promise<JSONValue> => {
  if (Array.isArray(payload)) {
    return await Promise.all(payload.map((value) => materializeAttachments(value, projectId)));
  }
  if (typeof payload === 'object' && payload !== null && !Array.isArray(payload)) {
    if (isRelativeImageUrl(payload, projectId)) {
      return await toImageBase64(payload, projectId);
    }
    for (const key in payload) {
      payload[key] = await materializeAttachments(payload[key], projectId);
    }
  }
  return payload;
};

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<NextResponse> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  const dataset = await db.query.datasets.findFirst({
    where: and(eq(datasets.id, datasetId), eq(datasets.projectId, projectId)),
  });

  if (!dataset) {
    return NextResponse.json({ error: 'Dataset not found' }, { status: 404 });
  }

  const body = await req.json();

  // Validate request body
  const parseResult = CreateDatapointsSchema.safeParse(body);
  if (!parseResult.success) {
    return NextResponse.json(
      {
        error: "Invalid request body",
        details: parseResult.error.issues
      },
      { status: 400 }
    );
  }
  const { datapoints } = parseResult.data;

  const materializedDatapoints = await Promise.all(datapoints.map(async (datapoint) => ({
    ...datapoint,
    data: await materializeAttachments(datapoint.data as JSONValue, projectId),
    target: await materializeAttachments(datapoint.target as JSONValue, projectId),
    metadata: await materializeAttachments(datapoint.metadata as JSONValue, projectId),
  })));

  const res = await db.insert(datasetDatapoints).values(
    materializedDatapoints.map((datapoint) => ({
      ...datapoint,
      data: datapoint.data,
      createdAt: new Date().toUTCString(),
      datasetId
    }))
  ).returning();

  if (res.length === 0) {
    return NextResponse.json({ error: 'Error creating datasetDatapoints' }, { status: 500 });
  }

  return NextResponse.json(res[0], { status: 200 });
}
