/** Bounded CDP requests: socket loss rejects pending rendering/PCM reads. */
export function createCdpClient(socket: WebSocket, timeoutMs = 120_000) {
  let sequence = 0;
  let failure: Error | undefined;
  const pending = new Map<number, {resolve: (value: any) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();
  let resolveReady: () => void;
  let rejectReady: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {resolveReady = resolve; rejectReady = reject;});
  const openTimer = setTimeout(() => close(new Error('CDP connection timed out')), timeoutMs);
  function close(error = new Error('CDP connection closed')) {
    failure ??= error;
    clearTimeout(openTimer);
    rejectReady(failure);
    for (const request of pending.values()) {clearTimeout(request.timer); request.reject(failure);}
    pending.clear();
    socket.close();
  }
  socket.onopen = () => {clearTimeout(openTimer); resolveReady();};
  socket.onclose = () => {if (!failure) close(new Error('CDP socket closed'));};
  socket.onerror = () => close(new Error('CDP socket failed'));
  socket.onmessage = event => {
    try {
      const message = JSON.parse(String(event.data));
      const request = pending.get(message.id);
      if (!request) return;
      clearTimeout(request.timer); pending.delete(message.id);
      if (message.error || message.result?.exceptionDetails) request.reject(new Error(JSON.stringify(message.error ?? message.result.exceptionDetails)));
      else request.resolve(message.result?.result?.value);
    } catch (error) {close(error instanceof Error ? error : new Error(String(error)));}
  };
  return {
    ready, close,
    evaluate(expression: string): Promise<any> {
      if (failure) return Promise.reject(failure);
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => close(new Error('CDP request timed out')), timeoutMs);
        pending.set(id, {resolve, reject, timer});
        try {socket.send(JSON.stringify({id, method: 'Runtime.evaluate', params: {expression, returnByValue: true, awaitPromise: true}}));}
        catch (error) {close(error instanceof Error ? error : new Error(String(error)));}
      });
    },
  };
}
