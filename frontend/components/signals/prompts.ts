export type EventTemplate = {
  name: string;
  description: string;
  prompt: string;
  structuredOutputSchema: string;
};

const templates: EventTemplate[] = [
  {
    name: "Error Detection",
    description: "Detect logical errors and flaws in LLM execution",
    prompt:
      "This event happens when there's a definitive evidence that current trace of an LLM powered application contains logical error that stems from the incorrect logical steps produced by an LLM. Examples of it might be deep flaws in the execution logic, suboptimal tool calls and failures to fully follow and adhere to the original prompt.",
    structuredOutputSchema:
      "{\n" +
      '  "type": "object",\n' +
      '  "required": [\n' +
      '    "analysis",\n' +
      '    "preview"\n' +
      "  ],\n" +
      '  "properties": {\n' +
      '    "preview": {\n' +
      '      "type": "string",\n' +
      '      "description": "Single sentence to summarize why this trace needs attention. This strictly should NOT convey trace specific details, but rather high level overview of core error or flaw."\n' +
      "    },\n" +
      '    "analysis": {\n' +
      '      "type": "string",\n' +
      '      "description": "Description of why do you think there\'s a logical error present in the trace, with proper references to the spans where relevant."\n' +
      "    }\n" +
      "  }\n" +
      "}",
  },
];

export default templates;
