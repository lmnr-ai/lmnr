'use client';

import { useUserContext } from '@/contexts/user-context';

import { Label } from '../ui/label';

export default function Profile() {
  const user = useUserContext();

  return (
    <div className="h-full p-4 w-full flex-grow">
      <div className="flex flex-col items-start space-y-4">
        <div className="flex flex-row space-x-2">
          <Label className="font-bold mb-4">Email:</Label>
          <Label className="text-secondary-foreground">{user.email}</Label>
        </div>
      </div>
    </div>
  );
}
