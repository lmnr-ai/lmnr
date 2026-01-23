const signalRunsSelectionColumns = [
  "job_id jobId",
  "run_id runId",
  "formatDateTime(updated_at, '%Y-%m-%dT%H:%i:%S.%fZ') as updatedAt",
  "status",
  "event_id eventId",
  "error_message errorMessages",
];
