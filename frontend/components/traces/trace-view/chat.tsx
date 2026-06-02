interface ChatProps {
  traceId: string;
  onSetSpanId: (spanId: string) => void;
  onClose?: () => void;
}

export default function Chat(_props: ChatProps) {
  return null;
}
