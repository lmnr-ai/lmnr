export type Log = {
  logId: string;
  projectId: string;
  spanId: string;
  traceId: string;
  time: string;
  observedTime: string;
  severityNumber: number;
  severityText: string;
  body: string;
  attributes: Record<string, any>;
  eventName: string;
};

// Based on OpenTelemetry SeverityNumber proto
export function getSeverityLabel(severityNumber: number): string {
  if (severityNumber >= 21) return "FATAL";
  if (severityNumber >= 17) return "ERROR";
  if (severityNumber >= 13) return "WARN";
  if (severityNumber >= 9) return "INFO";
  if (severityNumber >= 5) return "DEBUG";
  if (severityNumber >= 1) return "TRACE";
  return "UNKNOWN";
}

// Safely extract content from body JSON
export function getLogContent(body: string): string {
  try {
    const parsed = JSON.parse(body);
    return parsed?.content ?? "";
  } catch (e) {
    console.error("Failed to parse log body:", e);
    return "";
  }
}
