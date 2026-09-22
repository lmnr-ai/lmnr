export type Entry =
  | { kind: "status"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "result"; text: string; transferLabel?: string; transferTotal?: number }
  | { kind: "progress"; current: number; label: string; total: number }
  | { kind: "thought"; text: string }
  | { kind: "update"; text: string }
  | { kind: "diff"; sign: "+" | "-" | " "; text: string };

export interface Step {
  entry: Entry;
  delay: number;
}

export interface TransferProgress {
  pipe: number;
  progressBar?: number;
}
