import { DefaultSession, DefaultUser } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string;
      walletAddress: string;
      addressChecksum: string;
    };
  }

  interface User extends DefaultUser {
    walletAddress?: string;
    addressChecksum?: string;
  }
}

declare module 'next-auth/adapters' {
  interface AdapterUser extends DefaultUser {
    walletAddress?: string;
    addressChecksum?: string;
  }
}
