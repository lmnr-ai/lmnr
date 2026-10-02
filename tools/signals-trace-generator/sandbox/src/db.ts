export interface User {
  id: number;
  email: string;
  displayName: string;
  role: 'admin' | 'member' | 'viewer';
  createdAt: string;
}

export interface Post {
  id: number;
  authorId: number;
  title: string;
  publishedAt: string;
}

/** Offset-based pagination options, used by every findAll in this layer. */
export interface PageOptions {
  limit?: number;
  offset?: number;
}

const page = <T>(rows: T[], { limit, offset = 0 }: PageOptions = {}): T[] =>
  limit === undefined ? rows.slice(offset) : rows.slice(offset, offset + limit);

const USER_SEED: User[] = Array.from({ length: 240 }, (_, i) => ({
  id: i + 1,
  email: `user${i + 1}@example.com`,
  displayName: `User ${i + 1}`,
  role: i % 17 === 0 ? 'admin' : i % 3 === 0 ? 'viewer' : 'member',
  createdAt: new Date(Date.UTC(2024, 0, 1) + i * 86_400_000).toISOString(),
}));

const POST_SEED: Post[] = Array.from({ length: 85 }, (_, i) => ({
  id: i + 1,
  authorId: (i % 240) + 1,
  title: `Post ${i + 1}`,
  publishedAt: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString(),
}));

export const db = {
  users: {
    async findAll(options?: PageOptions): Promise<User[]> {
      return page(USER_SEED, options);
    },
    async count(): Promise<number> {
      return USER_SEED.length;
    },
    async findById(id: number): Promise<User | undefined> {
      return USER_SEED.find((u) => u.id === id);
    },
  },
  posts: {
    async findAll(options?: PageOptions): Promise<Post[]> {
      return page(POST_SEED, options);
    },
    async count(): Promise<number> {
      return POST_SEED.length;
    },
  },
};
