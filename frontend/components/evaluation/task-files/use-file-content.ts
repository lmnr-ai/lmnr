import { useEffect, useState } from "react";

/** Only this much of a file is shown; the rest is a download away. */
export const PREVIEW_BYTES = 1024 * 1024;
/** A NUL byte this early means the file is not text. */
const BINARY_SNIFF_BYTES = 8000;

export interface FileContent {
  text: string;
  truncated: boolean;
  binary: boolean;
}

/**
 * Reads the first `PREVIEW_BYTES` of a file and cancels the rest of the
 * response, which also stops the server's S3 read.
 */
const readPreview = async (url: string, size: number, signal: AbortSignal): Promise<FileContent> => {
  const response = await fetch(url, { signal });
  if (!response.ok || !response.body) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Failed to load the file (${response.status})`);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  while (received < PREVIEW_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
  }
  await reader.cancel();

  const bytes = new Uint8Array(Math.min(received, PREVIEW_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
  }
  return {
    text: new TextDecoder().decode(bytes),
    truncated: size > PREVIEW_BYTES,
    binary: bytes.subarray(0, BINARY_SNIFF_BYTES).includes(0),
  };
};

export const useFileContent = (url: string | null, size: number) => {
  const [state, setState] = useState<{ url: string; content?: FileContent; error?: string }>();

  useEffect(() => {
    if (!url) return;
    const controller = new AbortController();
    readPreview(url, size, controller.signal).then(
      (content) => setState({ url, content }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState({ url, error: error instanceof Error ? error.message : "Failed to load the file" });
      }
    );
    return () => controller.abort();
  }, [url, size]);

  const current = state?.url === url ? state : undefined;
  return { content: current?.content, error: current?.error, isLoading: !!url && !current };
};
