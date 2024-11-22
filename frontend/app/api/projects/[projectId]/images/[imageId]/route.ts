import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

const client = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? ''
  }
});

const bucket = process.env.S3_IMGS_BUCKET ?? '';

export async function GET(
  req: Request,
  { params }: { params: { projectId: string; imageId: string } }
): Promise<Response> {
  const { projectId, imageId } = params;
  const getObjectRequest = new GetObjectCommand({
    Bucket: bucket,
    Key: `project/${projectId}/${imageId}`
  });
  const blob = await client.send(getObjectRequest);
  return new Response(await blob.Body?.transformToByteArray());
}
