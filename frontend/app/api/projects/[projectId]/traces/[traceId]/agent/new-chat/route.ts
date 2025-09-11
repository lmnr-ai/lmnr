import { db } from '@/lib/db/drizzle';
import { tracesAgentChats } from '@/lib/db/migrations/schema';

export async function POST(
  req: Request,
  props: { params: Promise<{ projectId: string; traceId: string }> }
) {
  const params = await props.params;
  const { projectId, traceId } = params;

  try {
    // Create a new chat session in the database
    const newChat = await db
      .insert(tracesAgentChats)
      .values({
        traceId: traceId,
        projectId: projectId,
      })
      .returning();

    return Response.json({
      success: true,
      chatId: newChat[0].id,
      message: 'New chat session created successfully'
    });
  } catch (error) {
    console.error('Error creating new chat session:', error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : 'Failed to create new chat session'
      },
      { status: 500 }
    );
  }
}
