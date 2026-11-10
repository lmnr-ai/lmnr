"use client";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import Mono from "@/components/ui/mono";
import { type AuditLogEvent } from "@/lib/actions/audit-log/types";

import { eventName, sourceLabel } from "./constants";

const parseMetadata = (metadata: string): string | null => {
  if (!metadata) return null;
  try {
    return JSON.stringify(JSON.parse(metadata), null, 2);
  } catch {
    return metadata;
  }
};

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <>
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="break-all">{value || <span className="text-muted-foreground">—</span>}</dd>
  </>
);

interface AuditEventDetailsProps {
  event: AuditLogEvent | null;
  onClose: () => void;
}

export default function AuditEventDetails({ event, onClose }: AuditEventDetailsProps) {
  const metadata = event ? parseMetadata(event.metadata) : null;
  return (
    <Dialog open={!!event} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        {event && (
          <>
            <DialogHeader>
              <DialogTitle>
                <Mono>{eventName(event.resourceType, event.action)}</Mono>
              </DialogTitle>
            </DialogHeader>
            <dl className="grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 text-sm">
              <Field label="Time" value={<ClientTimestampFormatter absolute timestamp={event.timestamp} />} />
              <Field label="Project" value={event.projectName} />
              <Field label="Actor" value={event.actorLabel || event.actorId} />
              <Field label="Actor type" value={event.actorType === "api_key" ? "API key" : "User"} />
              {event.actorType === "user" && <Field label="Actor role" value={event.actorRole} />}
              {event.actorType === "api_key" && <Field label="Key created by" value={event.actorOwnerLabel} />}
              <Field label="Source" value={sourceLabel(event.source)} />
              <Field label="Outcome" value={event.outcome} />
              <Field label="Resource name" value={event.resourceLabel} />
              <Field label="Resource ID" value={event.resourceId && <Mono>{event.resourceId}</Mono>} />
              <Field label="Reported IP" value={event.ip} />
              <Field label="User agent" value={event.userAgent} />
              <Field label="Event ID" value={<Mono>{event.eventId}</Mono>} />
            </dl>
            {metadata && (
              <div className="mt-2 flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Metadata</span>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                  {metadata}
                </pre>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
