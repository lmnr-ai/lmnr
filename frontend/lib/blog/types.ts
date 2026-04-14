type BlogAuthor = {
  name: string;
  url?: string;
};

export type BlogMetadata = {
  title: string;
  description: string;
  date: string;
  author: BlogAuthor;
  coAuthors?: BlogAuthor[];
  image?: string;
  thumbnail?: string;
  excerpt?: string;
  tags?: string[];
};

export type BlogListItem = BlogMetadata & {
  slug: string;
  data: BlogMetadata;
};

export type MatterAndContent = {
  data: BlogMetadata;
  content: string;
};

export interface StrapiPost {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  content: string;
  description: string | null;
  date: string;
  image: string | null;
  author_name: string | null;
  author_url: string | null;
  tags: string[] | null;
  category: "blog" | "article" | null;
  publishedAt: string | null;
}

export interface StrapiListResponse {
  data: StrapiPost[];
  meta: { pagination: { page: number; pageSize: number; pageCount: number; total: number } };
}
