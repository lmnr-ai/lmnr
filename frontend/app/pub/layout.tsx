import '@/app/globals.css';
import { UserContextProvider } from '@/contexts/user-context';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

export default async function PubLayout({
  params,
  children
}: {
  children: React.ReactNode;
  params: {};
}) {
  const session = await getServerSession(authOptions);

  // TODO: Refactor this
  const email = session?.user.email ?? '';
  const name = session?.user.name ?? '';
  const image = session?.user.image ?? '';
  const supabaseAccessToken = session?.supabaseAccessToken ?? '';

  return (
    <UserContextProvider
      email={email}
      username={name}
      imageUrl={image}
      supabaseAccessToken={supabaseAccessToken}
    >
      <div className="flex flex-row max-w-full max-h-screen">
        <div className="flex flex-col flex-grow min-h-screen max-w-full h-screen overflow-y-auto">
          <div className="z-10 flex flex-col flex-grow">{children}</div>
        </div>
      </div>
    </UserContextProvider>
  );
}
