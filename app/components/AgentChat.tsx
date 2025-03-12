import { useAgentChat } from "../../frontend/components/chat/useAgentChat";

export function AgentChat() {
  const {
    messages,
    agentState,
    lastActionResult,
    isLoading,
    handleSubmit,
    input,
    setInput,
    stop,
    reload,
  } = useAgentChat({
    id: "agent-chat",
    onError: (error) => {
      console.error("Chat error:", error);
      // Handle error (e.g., show toast notification)
    },
  });

  return (
    <div className="flex flex-col space-y-4">
      <div className="flex flex-col space-y-2">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`p-4 rounded ${
              message.role === "user"
                ? "bg-blue-100 ml-auto"
                : "bg-gray-100 mr-auto"
            }`}
          >
            <div className="font-bold">{message.role}</div>
            <div>{message.content}</div>
          </div>
        ))}
      </div>

      {lastActionResult && (
        <div className="p-4 bg-gray-100 rounded">
          <h3 className="font-bold">Last Action Result:</h3>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(lastActionResult, null, 2)}
          </pre>
        </div>
      )}

      {agentState && (
        <div className="p-4 bg-gray-100 rounded">
          <h3 className="font-bold">Agent State:</h3>
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(agentState, null, 2)}
          </pre>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex space-x-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 p-2 border rounded"
        />
        <div className="flex space-x-2">
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-300"
          >
            Send
          </button>
          {isLoading && (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-2 bg-red-500 text-white rounded"
            >
              Stop
            </button>
          )}
          <button
            type="button"
            onClick={reload}
            disabled={isLoading || messages.length === 0}
            className="px-4 py-2 bg-gray-500 text-white rounded disabled:bg-gray-300"
          >
            Retry
          </button>
        </div>
      </form>
    </div>
  );
}
