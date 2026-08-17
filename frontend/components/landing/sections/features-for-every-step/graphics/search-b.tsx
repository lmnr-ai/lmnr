// Search reaches inside the payload, not just the span name. The hits are lit
// where they actually live: in the output body and in an attribute.
const Hit = ({ children }: { children: string }) => (
  <span className="rounded-[2px] bg-primary-400/25 px-[3px] text-primary-200">{children}</span>
);

const SearchB = () => (
  <div className="absolute inset-0 overflow-hidden pl-5">
    <div className="flex items-center justify-between rounded-tl border-t border-l border-surface-350 bg-surface-200 px-3 py-2 pr-6">
      <span className="font-mono text-[10px] text-foreground-200">chat.completion</span>
      <span className="rounded-full bg-primary-400/15 px-1.5 py-[1px] font-mono text-[9px] text-primary-200">3</span>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-350 bg-surface-200 px-3 py-2.5 font-mono text-[10px] leading-[16px] text-foreground-300">
      <p className="text-foreground-500">output</p>
      <p className="mt-1">
        The request hit a <Hit>timeout</Hit> at the
      </p>
      <p>
        booking gateway. Retried once, same <Hit>timeout</Hit>,
      </p>
      <p>then fell back to the cached fare.</p>

      <p className="mt-3 text-foreground-500">attributes</p>
      <p className="mt-1">
        error.type = <Hit>timeout</Hit>
      </p>
      <p>http.status = 504</p>
      <p>retry.count = 1</p>
    </div>
  </div>
);

export default SearchB;
