import { type ReactNode } from "react";

import { type AlertType, type AlertWithDetails } from "@/lib/actions/alerts/types";

import AlertSection from "./alert-section";
import { SECTION_ORDER } from "./constants";

interface AlertSectionsProps {
  alerts: AlertWithDetails[];
  onCreate: (type: AlertType) => void;
  renderRow: (alert: AlertWithDetails) => ReactNode;
}

export default function AlertSections({ alerts, onCreate, renderRow }: AlertSectionsProps) {
  return (
    <div className="flex flex-col gap-6">
      {SECTION_ORDER.map((type) => (
        <AlertSection
          key={type}
          type={type}
          alerts={alerts.filter((a) => a.type === type)}
          onCreate={onCreate}
          renderRow={renderRow}
        />
      ))}
    </div>
  );
}
