import { isCurrentUserMemberOfProject } from "@/lib/db/utils";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {

  // check if bearer token is valid
  const token = req.headers.get('Authorization')?.split(' ')[1];
  if (!token || token !== process.env.SHARED_SECRET_TOKEN) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();

  const { projectId } = body;

  if (!await isCurrentUserMemberOfProject(projectId)) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ message: 'Authorized' });
}
