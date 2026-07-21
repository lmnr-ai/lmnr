export type TextPart = { text: string };

export interface ParsedInput {
  systemText: string | null;
  userParts: TextPart[];
}

export interface ExtractedTool {
  name: string;
  input: unknown;
}
