"use client";

import { isEmpty } from "lodash";
import { Loader2, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton.tsx";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "./settings-section";

interface SummaryTriggerSpan {
  id: string;
  spanName: string;
  eventName: string | null;
  projectId: string;
}

interface SlackIntegration {
  id: string;
  teamName: string | null;
  createdAt: string;
}

export default function TraceSummarySettings({
  slackClientId,
  slackRedirectUri,
}: {
  slackClientId?: string;
  slackRedirectUri?: string;
}) {
  const { projectId } = useParams();
  const { toast } = useToast();

  const {
    data: triggerSpans = [],
    mutate,
    isLoading: isFetching,
  } = useSWR<SummaryTriggerSpan[]>(`/api/projects/${projectId}/summary-trigger-spans/unassigned`, swrFetcher);

  const { data: slackIntegration, isLoading: isFetchingSlack } = useSWR<SlackIntegration | null>(
    `/api/projects/${projectId}/slack`,
    swrFetcher
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newSpanName, setNewSpanName] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const slackURL = useMemo(() => {
    if (!slackClientId || !slackRedirectUri) {
      return;
    }
    const scope = ["chat:write", "channels:read", "groups:read", "commands", "mpim:read"].join(",");

    const sp = new URLSearchParams({
      scope,
      client_id: slackClientId,
      state: projectId as string,
      // TODO: uncomment
      // redirect_uri: slackRedirectUri,
      redirect_uri: `https://780ecb5b4527.ngrok-free.app/api/integrations/slack`,
    });
    return `https://slack.com/oauth/v2/authorize?${sp}`;
  }, [projectId, slackClientId, slackRedirectUri]);

  const addSpanName = useCallback(async () => {
    if (!newSpanName.trim()) return;

    setIsLoading(true);
    try {
      await mutate(
        async (currentData) => {
          const res = await fetch(`/api/projects/${projectId}/summary-trigger-spans`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              spanName: newSpanName.trim(),
              eventName: null,
            }),
          });

          if (!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.error || "Failed to add trigger span.");
          }

          const newSpan = await res.json();
          return [...(currentData || []), newSpan];
        },
        {
          revalidate: false,
          populateCache: true,
          rollbackOnError: true,
        }
      );

      setNewSpanName("");
      setIsDialogOpen(false);
      toast({
        title: "Success",
        description: "Trigger span added successfully.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add trigger span.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [newSpanName, projectId, mutate, toast]);

  const deleteSpanName = useCallback(
    async (id: string) => {
      try {
        await mutate(
          async (currentData) => {
            const res = await fetch(`/api/projects/${projectId}/summary-trigger-spans/${id}`, {
              method: "DELETE",
            });

            if (!res.ok) {
              const errorData = await res.json();
              throw new Error(errorData.error || "Failed to delete trigger span.");
            }

            return (currentData || []).filter((item) => item.id !== id);
          },
          {
            revalidate: false,
            populateCache: true,
            rollbackOnError: true,
            optimisticData: (currentData) => (currentData || []).filter((item) => item.id !== id),
          }
        );

        toast({
          title: "Success",
          description: "Trigger span deleted successfully.",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to delete trigger span.",
          variant: "destructive",
        });
      }
    },
    [projectId, mutate, toast]
  );

  return (
    <>
      <SettingsSectionHeader title="Trace Summary" description="Configure trace summary." />
      <div className="flex flex-col gap-8">
        <SettingsSection>
          <SettingsSectionHeader
            title="Trigger spans"
            description="Add span names that should trigger trace summary generation when they complete. Use name of span that ends last in your trace."
            size="sm"
          />
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button icon="plus" variant="outline" className="w-fit">
                Span
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add span</DialogTitle>
              </DialogHeader>
              <div className="grid gap-2">
                <Label>Name</Label>
                <Input
                  autoFocus
                  placeholder="Enter span name..."
                  value={newSpanName}
                  onChange={(e) => setNewSpanName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newSpanName.trim() && !isLoading) {
                      addSpanName();
                    }
                  }}
                  disabled={isLoading}
                />
              </div>
              <DialogFooter>
                <Button disabled={!newSpanName.trim() || isLoading} onClick={addSpanName} handleEnter>
                  {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Add
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          <SettingsTable isLoading={isFetching} isEmpty={isEmpty(triggerSpans)} emptyMessage="No trigger spans found.">
            {triggerSpans.map((span) => (
              <SettingsTableRow key={span.id}>
                <td className="px-4 text-sm font-medium">{span.spanName}</td>
                <td className="px-4">
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => deleteSpanName(span.id)}>
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </td>
              </SettingsTableRow>
            ))}
          </SettingsTable>
        </SettingsSection>
        <SettingsSection>
          <SettingsSectionHeader
            title="Slack Integration"
            description="Add slackbot to receive announcements in slack."
            size="sm"
          />
          <div className="flex items-center gap-2">
            {isFetchingSlack ? (
              <Skeleton className="h-8 w-32" />
            ) : slackIntegration ? (
              <Badge className="py-1.5 border-success bg-success/80" variant="outline">
                Connected
              </Badge>
            ) : (
              <a href={slackURL}>
                <Button variant="outlinePrimary">Connect</Button>
              </a>
            )}
          </div>
        </SettingsSection>
      </div>
    </>
  );
}
