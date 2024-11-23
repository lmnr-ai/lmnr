import { Copy } from 'lucide-react';
import CopyToClipboard from './copy-to-clipboard';
import Mono from '@/components/ui/mono';

interface MonoWithCopyProps {
  children: React.ReactNode;
  className?: string;
  copySize?: number;
}

export default function MonoWithCopy({
  children,
  className,
  copySize
}: MonoWithCopyProps) {
  return (
    <div className="flex items-center group space-x-2">
      <Mono className={className}>{children}</Mono>
      <CopyToClipboard
        text={String(children)}
        className="hidden group-hover:block max-h-4"
      >
        <Copy size={copySize ?? 16} />
      </CopyToClipboard>
    </div>
  );
}
