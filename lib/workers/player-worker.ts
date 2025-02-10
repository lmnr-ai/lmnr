let startTime: number | null = null;

self.onmessage = (e) => {
  const { time, isPlaying, eventType, timestamp } = e.data;

  // Initialize startTime from the first timestamp we receive
  if (timestamp && startTime === null) {
    startTime = timestamp;
  }

  // Use the timestamp from the nearest event
  const result = timestamp ? timestamp - (startTime ?? 0) : time * 1000;

  // Check if this is a page navigation event (type 4)
  if (eventType === 4) {
    self.postMessage({ result, isPlaying, type: 'navigation' });
  } else {
    self.postMessage({ result, isPlaying });
  }
}; 