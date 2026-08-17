// What the SDK sends versus what the trace opens on. The raw payload is dimmed
// and cropped on purpose: nobody should have to read it.
const InputExtractionC = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200 p-3 pr-5">
      <p className="text-[10px] text-foreground-500">Trace opens on</p>
      <p className="mt-1.5 text-[12px] leading-[17px] text-white">Book the cheapest direct flight to Tokyo in March.</p>
    </div>

    <p className="mt-3 mb-1.5 text-[10px] text-foreground-500">parsed from</p>

    <div className="rounded-tl border-t border-l border-surface-350 bg-surface-200/70 px-3 py-2.5 font-mono text-[9px] leading-[14px] text-foreground-600">
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
