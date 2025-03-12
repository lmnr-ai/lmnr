export function useAgentChat({
    api = '/api/agent',
    id,
    initialMessages = [],
    onResponse,
    onFinish,
    onError,
}: UseAgentChatOptions = {}): UseAgentChatHelpers {
    const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [agentState, setAgentState] = useState<AgentState | null>(null);
    const [lastActionResult, setLastActionResult] = useState<ActionResult | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const stop = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    const handleSubmit = useCallback(
        async (e: React.FormEvent<HTMLFormElement>) => {
            e.preventDefault();

            if (!input.trim() || isLoading) {
                return;
            }

            setIsLoading(true);
            const abortController = new AbortController();
            abortControllerRef.current = abortController;

            try {
                // Add user message to the list
                const userMessage: ChatMessage = {
                    id: crypto.randomUUID(),
                    role: 'user',
                    content: input,
                    isStateMessage: false,
                };
                setMessages((messages) => [...messages, userMessage]);
                setInput('');

                const response = await fetch(api, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        prompt: input,
                        chatId: id || crypto.randomUUID(),
                        isNewChat: messages.length === 0,
                        model: "claude-3-7-sonnet-latest",
                    }),
                    signal: abortController.signal,
                });

                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }

                if (onResponse) {
                    await onResponse(response);
                }

                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error('No reader available');
                }

                const decoder = new TextDecoder();
                let accumulatedData = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const text = decoder.decode(value);
                    accumulatedData += text;

                    const lines = accumulatedData.split('\n');
                    accumulatedData = lines.pop() || ''; // Keep the last incomplete line

                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.slice(6).trim();
                            if (jsonStr) {
                                try {
                                    const chunk = JSON.parse(jsonStr) as RunAgentResponseStreamChunk;

                                    if (chunk.chunkType === 'step') {
                                        setLastActionResult(chunk.actionResult);
                                        // Only add a message if there's content in the actionResult
                                        if (chunk.actionResult.content) {
                                            const stepMessage: ChatMessage = {
                                                id: chunk.messageId,
                                                role: 'assistant',
                                                content: chunk.actionResult.content,
                                                isStateMessage: false,
                                            };
                                            setMessages((messages) => [...messages, stepMessage]);
                                        }
                                    } else if (chunk.chunkType === 'finalOutput') {
                                        setAgentState(chunk.content.state);
                                        // Only add final message if it has different content
                                        if (chunk.content.result.content &&
                                            (!messages.length ||
                                                messages[messages.length - 1].content !== chunk.content.result.content)) {
                                            const finalMessage: ChatMessage = {
                                                id: crypto.randomUUID(),
                                                role: 'assistant',
                                                content: chunk.content.result.content,
                                                isStateMessage: true,
                                            };
                                            setMessages((messages) => [...messages, finalMessage]);
                                        }
                                        if (onFinish) {
                                            await onFinish(messages[messages.length - 1]);
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to parse JSON:', e);
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                if (error.name === 'AbortError') {
                    return;
                }
                if (onError && error instanceof Error) {
                    await onError(error);
                }
                console.error('Error in chat:', error);
            } finally {
                setIsLoading(false);
                abortControllerRef.current = null;
            }
        },
        [api, id, input, isLoading, messages, onError, onFinish, onResponse]
    );

    const reload = useCallback(async () => {
        if (messages.length === 0) return;

        // Find the last user message
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
        if (!lastUserMessage) return;

        // Clear all messages after the last user message
        const userMessageIndex = messages.indexOf(lastUserMessage);
        setMessages(messages.slice(0, userMessageIndex + 1));

        // Create a new form event and submit
        const fakeEvent = {
            preventDefault: () => { },
        } as React.FormEvent<HTMLFormElement>;

        setInput(lastUserMessage.content);
        await handleSubmit(fakeEvent);
    }, [messages, handleSubmit]);

    return {
        messages,
        agentState,
        lastActionResult,
        isLoading,
        handleSubmit,
        handleInputChange,
        setMessages,
        input,
        setInput,
        reload,
        stop,
    };
} 