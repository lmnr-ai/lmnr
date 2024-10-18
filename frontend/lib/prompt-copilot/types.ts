import { GenericNode, NodeInput } from '../flow/types';

interface InputVariable {
  name: string;
  value: NodeInput;
}

export interface PromptCopilotMessage {
  type: 'Prompt' | 'Feedback';
}

export interface PromptCopilotPromptMessageRun {
  inputs: InputVariable[];
  output: string;
  expectedOutput: string | null;
}
export interface PromptCopilotPromptMessage extends PromptCopilotMessage {
  prompt: string;
  runs: PromptCopilotPromptMessageRun[];
  editable: boolean;
}

export interface Feedback extends PromptCopilotMessage {
  content: string;
}

// interface PromptCopilotState {
//   inputVariableNames: string[]
//   setInputVariableNames: (inputVariableNames: string[]) => void
//   getInputVariableNames: () => string[]
//   allInputs: InputVariable[][]
//   setAllInputs: (inputs: InputVariable[][]) => void
//   getAllInputs: () => InputVariable[][]
//   node: GenericNode
//   setNode: (node: GenericNode) => void
//   getNode: () => GenericNode
//   messages: PromptCopilotMessage[]
//   updateMessage: (message: PromptCopilotMessage, index: number) => void
//   setMessages: (messages: PromptCopilotMessage[]) => void
//   pushMessage: (message: PromptCopilotMessage) => void
//   resetMessages: () => void
// }

// export const usePromptCopilotStore = create<PromptCopilotState>()((set, get) => ({
//   inputVariableNames: ["input"],
//   setInputVariableNames: (inputVariableNames: string[]) => {
//     if (!inputVariableNames.includes("input")) {
//       inputVariableNames.push("input")
//     }
//     set({ inputVariableNames })
//   },
//   getInputVariableNames: () => get().inputVariableNames,
//   allInputs: [[]],
//   setAllInputs: (inputs: InputVariable[][]) => {
//     set({ allInputs: inputs })
//   },
//   getAllInputs: () => get().allInputs,
//   node: {} as GenericNode,
//   setNode: (node: GenericNode) => {
//     set({ node })
//   },
//   getNode: () => get().node,
//   messages: [{
//     type: 'Prompt',
//     prompt: '',
//     outputs: [],
//     editable: true
//   } as PromptCopilotPromptMessage],
//   updateMessage: (message: PromptCopilotMessage, index: number) => {
//     let newMessages = [...get().messages]
//     newMessages[index] = {
//       ...newMessages[index],
//       ...message
//     }
//     set({ messages: newMessages })
//   },
//   setMessages: (messages: PromptCopilotMessage[]) => {
//     set({ messages })
//   },
//   pushMessage: (message: PromptCopilotMessage) => {
//     let newMessages = [...get().messages]
//     newMessages.push(message)
//     set({ messages: newMessages })
//   },
//   resetMessages: () => {
//     set({
//       messages: [{
//         type: 'Prompt',
//         prompt: '',
//         outputs: [],
//         editable: true
//       } as PromptCopilotPromptMessage]
//     })
//   }
// }))
