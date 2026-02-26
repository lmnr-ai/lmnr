export interface SystemMessage {
  id: string;
  content: string;
  path: string[]; // Original array of path segments
  pathKey: string; // Dot-joined path for use as map key
}

export async function fetchSystemMessages(
  projectId: string,
  traceId: string,
  paths: Array<{ key: string; path: string[] }>
): Promise<Map<string, SystemMessage>> {
  if (paths.length === 0) {
    return new Map();
  }

  const response = await fetch(`/api/projects/${projectId}/traces/${traceId}/spans/system-messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths: paths.map((p) => p.path) }),
  });

  if (!response.ok) {
    throw new Error("Failed to fetch system messages");
  }

  const data = (await response.json()) as Array<{
    id: string;
    content: string;
    path: string[];
  }>;

  const systemMessagesMap = new Map<string, SystemMessage>();

  data.forEach((msg) => {
    const pathKey = msg.path.join(".");
    systemMessagesMap.set(msg.id, {
      id: msg.id,
      content: msg.content,
      path: msg.path,
      pathKey: pathKey,
    });
  });

  return systemMessagesMap;
}
