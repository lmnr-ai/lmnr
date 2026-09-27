import './instrumentation.js';
import { Laminar } from '@lmnr-ai/lmnr';
import { leadAgent } from './agent.js';

const PROMPT = 'Hey, can you add pagination to my REST endpoint and test it?';

const result = await leadAgent.generate({ prompt: PROMPT });

console.log('\n--- final answer ---\n');
console.log(result.text);
console.log(`\nsteps: ${result.steps.length}`);

await Laminar.flush();
await Laminar.shutdown();
