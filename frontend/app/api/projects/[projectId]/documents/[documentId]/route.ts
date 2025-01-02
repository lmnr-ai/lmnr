import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ''
  }
});

const bucket = process.env.S3_TRACE_PAYLOADS_BUCKET ?? '';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; documentId: string } }
): Promise<Response> {
  const { projectId, documentId } = params;
  const getObjectRequest = new GetObjectCommand({
    Bucket: bucket,
    Key: `project/${projectId}/${documentId}`
  });
  const blob = await client.send(getObjectRequest);
  const bytes = await blob.Body?.transformToByteArray();
  const headers = new Headers();
  // backend sets the key to *.pdf, if we know from the LLM provider
  // that the media-type is application/pdf
  if (documentId.endsWith('.pdf')) {
    headers.set('Content-Type', 'application/pdf');
  } else {
    headers.set('Content-Type', 'application/octet-stream');
  }
  headers.set('Content-Disposition', `attachment; filename="${documentId}"`);
  return new Response(bytes, { headers });
}
