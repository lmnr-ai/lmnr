import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/lib/hooks/use-toast";
import { formatTimestamp } from "@/lib/utils";
import { WorkspaceInvitation } from "@/lib/workspaces/types";

interface InvitationsTableProps {
  workspaceId: string;
  invitations: WorkspaceInvitation[];
}
const InvitationsTable = ({ workspaceId, invitations }: InvitationsTableProps) => {
  const { toast } = useToast();

  const router = useRouter();
  const handleRevokeInvitation = async (id: string) => {
    try {
      const response = await fetch(`/api/invitations/${id}`, {
        method: "POST",
        body: JSON.stringify({
          id,
          workspaceId,
          action: "decline",
        }),
      });

      if (!response.ok) {
        const text = await response.json();
        if (text) {
          toast({
            variant: "destructive",
            title: "Error",
            description: text,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to revoke invitation. Please try again.",
          });
        }
        return;
      }

      toast({ title: "Invite revoked successfully." });
      router.refresh();
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to revoke invitation. Please try again.",
      });
    }
  };

  return (
    <div className="flex flex-col gap-2 w-full mt-8">
      <span>Invitations</span>
      {invitations.length > 0 ? (
        <Table>
          <TableHeader className="border-none bg-card text-card-foreground rounded-lg overflow-hidden">
            <TableRow>
              <TableCell>Email</TableCell>
              <TableCell>Invited</TableCell>
              <TableCell className="w-[10%]" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow className="h-14" key={invitation.id}>
                <TableCell>{invitation.email}</TableCell>
                <TableCell>{formatTimestamp(invitation.createdAt)}</TableCell>
                <TableCell>
                  <Button onClick={() => handleRevokeInvitation(invitation.id)} variant="outline">
                    Revoke invite
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <span className="text-base text-secondary-foreground">No recent invitations</span>
      )}
    </div>
  );
};

export default InvitationsTable;
