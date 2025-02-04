self.onmessage = (e) => {
  const { time, isPlaying } = e.data;
  // Simulate the heavy computation
  // Note: actual rrweb-player operations can't run in a worker
  // This is just to offload the calculation
  const result = time * 1000;
  self.postMessage({ result, isPlaying });
};
