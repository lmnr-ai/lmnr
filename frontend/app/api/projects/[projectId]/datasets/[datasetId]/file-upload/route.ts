import { type NextRequest } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

import { createDatapoints } from '@/lib/clickhouse/datapoints';

// 25MB file size limit
const MAX_FILE_SIZE = 25 * 1024 * 1024;

export async function POST(
  req: NextRequest,
  props: { params: Promise<{ projectId: string; datasetId: string }> }
): Promise<Response> {
  const params = await props.params;
  const projectId = params.projectId;
  const datasetId = params.datasetId;

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    // Check file size limit
    if (file.size > MAX_FILE_SIZE) {
      return Response.json(
        { error: `File size exceeds 50MB limit. File size: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 413 }
      );
    }

    const filename = file.name;
    const extension = filename.split('.').pop()?.toLowerCase();

    if (!['json', 'jsonl', 'csv'].includes(extension || '')) {
      return Response.json(
        { error: 'Unsupported file format. Supported formats: json, jsonl, csv' },
        { status: 400 }
      );
    }

    // Read file content
    const fileBuffer = await file.arrayBuffer();
    const fileContent = new TextDecoder().decode(fileBuffer);

    let records: any[] = [];

    try {
      if (extension === 'json') {
        const parsed = JSON.parse(fileContent);
        records = Array.isArray(parsed) ? parsed : [parsed];
      } else if (extension === 'jsonl') {
        records = fileContent
          .split('\n')
          .filter(line => line.trim())
          .map(line => JSON.parse(line));
      } else if (extension === 'csv') {
        // Simple CSV parser - for production, consider using a proper CSV library
        const lines = fileContent.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          return Response.json({ error: 'Empty CSV file' }, { status: 400 });
        }

        const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
        records = lines.slice(1).map(line => {
          const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
          const record: any = {};
          headers.forEach((header, index) => {
            record[header] = values[index] || '';
          });
          return record;
        });
      }
    } catch (parseError) {
      return Response.json(
        { error: `Failed to parse ${extension} file: ${parseError instanceof Error ? parseError.message : 'Unknown error'}` },
        { status: 400 }
      );
    }

    if (records.length === 0) {
      return Response.json({ error: 'No valid records found in file' }, { status: 400 });
    }

    // Prepare datapoints for ClickHouse
    const datapointsWithIds = records.map((record) => {
      // Extract data, target, and metadata from the record
      // If record has these specific keys, use them; otherwise put everything in data
      const { data, target, metadata, ...rest } = record;

      return {
        id: uuidv4(),
        data: data !== undefined ? data : (Object.keys(rest).length > 0 ? rest : record),
        target: target || null,
        metadata: metadata || {},
        createdAt: new Date().toISOString(),
      };
    });

    console.log(datapointsWithIds);

    // Insert into ClickHouse
    await createDatapoints(projectId, datasetId, datapointsWithIds);

    return Response.json({
      success: true,
      message: `Successfully uploaded ${records.length} datapoints`,
      count: records.length,
    });

  } catch (error) {
    console.error('Error uploading file:', error);
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
