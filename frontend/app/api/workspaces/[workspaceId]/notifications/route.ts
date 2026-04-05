import { type NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { getWebNotifications } from "@/lib/actions/notifications";
import { authOptions } from "@/lib/auth";

export async function GET(_request: NextRequest, props: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await props.params;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const result = await getWebNotifications(workspaceId);
    return NextResponse.json(result);
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch notifications." },
      { status: 500 }
    );
  }
}
