interface StorageEstimate {
  agentTokens: number;
  storedBytes: number;
}

// Stored bytes per run sampled from the previous fit:
//   bytesPerToken = 2.548 * exp(-0.002661 * agentTokens / 1_000) + 0.2221
//   storedBytes = agentTokens * bytesPerToken
// The sampled 1M value was 400,150 bytes, below the 500K bucket's 447,826.
// Clamp it to 447,826 so estimated storage never falls as agent tokens rise.
const STORAGE_ESTIMATES: readonly StorageEstimate[] = [
  { agentTokens: 1_000, storedBytes: 2_763 },
  { agentTokens: 2_500, storedBytes: 6_883 },
  { agentTokens: 5_000, storedBytes: 13_682 },
  { agentTokens: 10_000, storedBytes: 27_032 },
  { agentTokens: 25_000, storedBytes: 65_153 },
  { agentTokens: 50_000, storedBytes: 122_634 },
  { agentTokens: 100_000, storedBytes: 217_479 },
  { agentTokens: 250_000, storedBytes: 383_035 },
  { agentTokens: 500_000, storedBytes: 447_826 },
  { agentTokens: 1_000_000, storedBytes: 447_826 },
];

export function estimatedStoredBytesPerRun(tokensPerRun: number): number {
  let storedBytes = STORAGE_ESTIMATES[0].storedBytes;
  for (const estimate of STORAGE_ESTIMATES) {
    if (tokensPerRun < estimate.agentTokens) break;
    storedBytes = estimate.storedBytes;
  }
  return storedBytes;
}

export function estimateDataGB(runs: number, tokensPerRun: number): number {
  return (runs * estimatedStoredBytesPerRun(tokensPerRun)) / 1_000_000_000;
}
