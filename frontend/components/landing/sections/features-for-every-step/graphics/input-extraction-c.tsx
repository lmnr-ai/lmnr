// What the SDK sent versus what the trace opens on. The raw span input is
// dimmed and cropped on purpose: nobody should have to read it to find the task.
const InputExtractionC = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down p-3 pr-5">
      <p className="text-[10px] text-foreground-500">agent_input</p>
      <p className="mt-1.5 text-[12px] leading-[17px] text-white">Book the cheapest direct flight to Tokyo in March.</p>
    </div>

    <p className="mb-1.5 mt-3 text-[10px] text-foreground-500">parsed from spans.input</p>

    <div className="rounded-tl border-t border-l border-surface-up-2 bg-surface-down/70 px-3 py-2.5 font-mono text-[9px] leading-[14px] text-foreground-600">
      <p>{'{ "messages": ['}</p>
      <p className="pl-3">{'{ "role": "system", "content": "You are'}</p>
      <p className="pl-3">{"an autonomous travel agent. Use the"}</p>
      <p className="pl-3">{'tools provided…" },'}</p>
      <p className="pl-3">{'{ "role": "user", "content": ['}</p>
      <p className="pl-6">{'{ "type": "text", "text":'}</p>
      <p className="rounded-[2px] bg-primary-400/12 pl-6 text-primary-200">{'"Book the cheapest direct flight to'}</p>
      <p className="rounded-[2px] bg-primary-400/12 pl-6 text-primary-200">{'Tokyo in March." } ] },'}</p>
      <p className="pl-3">{'{ "role": "assistant", "tool_calls": ['}</p>
    </div>
  </div>
);

export default InputExtractionC;
