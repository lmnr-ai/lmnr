// Search reaches inside the span, not just its name. The hits are lit where
// they live: in `output` and in `attributes`, both indexed columns.
const Hit = ({ children }: { children: string }) => (
  <span className="rounded-[2px] bg-primary-400/25 px-[3px] text-primary-200">{children}</span>
);

const SearchB = () => (
  <div className="absolute inset-0 overflow-hidden pl-6">
    <div className="flex items-center justify-between rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2 pr-6">
      <span className="text-[11px] text-foreground-100">chat.completion</span>
      <span className="rounded-full bg-primary-400/15 px-1.5 py-[1px] font-mono text-[9px] text-primary-200">3</span>
    </div>

    <div className="mt-2 rounded-tl border-t border-l border-surface-up-2 bg-surface-down px-3 py-2.5 font-mono text-[10px] leading-[16px] text-foreground-300">
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
      <p>http.status_code = 504</p>
      <p>retry.count = 1</p>
      <p>gen_ai.request.model = gpt-5.1</p>
    </div>
  </div>
);

export default SearchB;
