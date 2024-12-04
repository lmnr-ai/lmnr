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

// Return type of gray-matter
export type MatterAndContent = {
  data: BlogMetadata;
  content: string;
};

