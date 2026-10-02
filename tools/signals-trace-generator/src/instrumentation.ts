import { registerAiSdkTelemetry } from '@lmnr-ai/lmnr';

// Registers Laminar as a global receiver for every AI SDK v7 call that has
// telemetry enabled. This reaches calls the SDK makes from inside its own
// bundle (e.g. ToolLoopAgent -> generateText), which wrapAISDK cannot.
registerAiSdkTelemetry({
  laminarOptions: {
    projectApiKey: process.env.LMNR_PROJECT_API_KEY,
  },
});
