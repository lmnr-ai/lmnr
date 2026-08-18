/**
 * Streamdown 2.1 still emits mdast `html` nodes; without rehype-raw those
 * become raw HAST and are dropped. Map them to text so XML-like tags stay visible.
 */
export const htmlAsTextRemarkRehypeOptions = {
  handlers: {
    html: (_state: unknown, node: { value?: string }) => ({
      type: "text" as const,
      value: node.value ?? "",
    }),
  },
};
