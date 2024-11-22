import { Button } from '@/components/ui/button';
import { ReloadIcon } from '@radix-ui/react-icons';

export function ButtonLoading({ loadingText = '', ...props }) {
  return (
    <Button disabled {...props}>
      <ReloadIcon className="mr-1 animate-spin" />
      {loadingText}
    </Button>
  );
}
