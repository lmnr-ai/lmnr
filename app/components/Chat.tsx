import { useChat } from 'ai/react';
import { useState } from 'react';
import { RunAgentResponseStreamChunk, AgentState, ActionResult } from '@/types';

export function Chat() {
    const [agentState, setAgentState] = useState<AgentState | null>(null);
    const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null);

    const { messages, handleSubmit, isLoading } = useChat({
        api: '/api/agent',
        onFinish: (message) => {
            // The final state will be available in message.data
            const finalData = message.data;
            if (finalData?.type === 'finalOutput') {
                setAgentState(finalData.state);
                setLastActionResult(finalData.result);
            }
        },
        onResponse: (response) => {
            // You can access the additional data stream here
            const reader = response.data.getReader();
            reader.read().then(function process({ done, value }): any {
                if (done) return;

                // Handle step data
                if (value.type === 'step') {
                    // Update UI with action results, etc.
                    setLastActionResult(value.actionResult);
                }

                return reader.read().then(process);
            });
        },
    });

    return (
        <div className="flex flex-col space-y-4">
            <div className="flex flex-col space-y-2">
                {messages.map((m) => (
                    <div key={m.id} className="p-4 border rounded">
                        <div className="font-bold">{m.role}</div>
                        <div>{m.content}</div>
                    </div>
                ))}
            </div>

            {lastActionResult && (
                <div className="p-4 bg-gray-100 rounded">
                    <h3 className="font-bold">Last Action Result:</h3>
                    <pre>{JSON.stringify(lastActionResult, null, 2)}</pre>
                </div>
            )}

            {agentState && (
                <div className="p-4 bg-gray-100 rounded">
                    <h3 className="font-bold">Agent State:</h3>
                    <pre>{JSON.stringify(agentState, null, 2)}</pre>
                </div>
            )}

            <form onSubmit={handleSubmit} className="flex space-x-4">
                <input
                    name="input"
                    placeholder="Say something..."
                    className="flex-1 p-2 border rounded"
                />
                <button
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
                >
                    Send
                </button>
            </form>
        </div>
    );
} 