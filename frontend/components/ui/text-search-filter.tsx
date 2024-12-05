import { Search, X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { usePostHog } from 'posthog-js/react';
import { SyntheticEvent, useEffect, useState } from 'react';

import { Feature, isFeatureEnabled } from '@/lib/features/features';
import { cn } from '@/lib/utils';

import { Input } from './input';

export default function TextSearchFilter() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const [inputValue, setInputValue] = useState<string>('');
  const [inputFocused, setInputFocused] = useState<boolean>(false);
  const posthog = usePostHog();

  const handleKeyPress = (e: SyntheticEvent | any) => {
    if (
      e?.key === 'Enter' ||
      e?.keyCode === 13 ||
      e?.code === 'Enter' ||
      e?.which === 13
    ) {
      if (!inputValue || inputValue === '') {
        searchParams.delete('search');
      } else {
        searchParams.set('search', inputValue);
      }

      router.push(`${pathName}?${searchParams.toString()}`);
      if (isFeatureEnabled(Feature.POSTHOG)) {
        posthog.capture('traces_list_searched', {
          searchParams: searchParams.toString()
        });
      }
    }
  };

  useEffect(() => {
    setInputValue(searchParams.get('search') ?? '');
  }, []);

  return (
    <div
      className={cn(
        'flex align-middle items-center space-x-1 border px-2 rounded-md h-8',
        inputFocused && 'ring-1'
      )}
    >
      <Search size={18} className="text-secondary-foreground flex-grow" />
      <Input
        onFocus={() => setInputFocused(true)}
        onBlur={() => setInputFocused(false)}
        placeholder="Search"
        type="text"
        className="max-h-4 border-none focus-visible:ring-0"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyPress}
      />
      <X
        size={20}
        className="text-secondary-foreground cursor-pointer"
        onClick={() => {
          setInputValue('');
          searchParams.delete('search');
          router.push(`${pathName}?${searchParams.toString()}`);
        }}
      />
    </div>
  );
}
