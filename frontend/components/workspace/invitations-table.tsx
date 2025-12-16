import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
  const handleRevokeInvitation = async (id: string, email: string) => {
    try {
      const response = await fetch(`/api/invitations/${id}`, {
        method: "POST",
        body: JSON.stringify({
          id,
          workspaceId,
          action: "decline",
          email,
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
    <div className="border rounded-md">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="px-3">Email</TableHead>
            <TableHead className="px-3">Invited</TableHead>
            <TableHead className="px-3">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.filter((invitation) => invitation.email !== null).map((invitation) => (
            <TableRow className="border-b last:border-b-0 h-12" key={invitation.id}>
              <TableCell className="font-medium px-3">{invitation.email}</TableCell>
              <TableCell className="text-muted-foreground px-3">{formatTimestamp(invitation.createdAt)}</TableCell>
              <TableCell className="px-3">
                <Button onClick={() => handleRevokeInvitation(invitation.id, invitation.email!)} variant="outline">
                  Revoke invite
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default InvitationsTable;
