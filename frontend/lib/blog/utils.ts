import fs from "fs";
import matter from "gray-matter";
import path from "path";

import { BlogListItem, MatterAndContent } from "./types";

const BLOG_DIR = path.join(process.cwd(), "assets/blog");

export const getBlogPosts = ({
  sortByDate = true,
}: {
  sortByDate?: boolean;
}): BlogListItem[] => {
  const files = fs.readdirSync(BLOG_DIR);
  const posts = files.filter((file) => file.endsWith(".mdx")).map((file) => {
    const content = fs.readFileSync(path.join(BLOG_DIR, file), "utf8");
    return {
      ...(matter(content) as unknown as MatterAndContent),
      slug: file.replace(".mdx", ""),
    };
  });
  if (sortByDate) {
    posts.sort((a, b) => new Date(b.data.date).getTime() - new Date(a.data.date).getTime());
  }
  return posts as unknown as BlogListItem[];
};

export const getBlogPost = (slug: string): MatterAndContent => {
  const filePath = path.join(BLOG_DIR, `${slug}.mdx`);
  const content = fs.readFileSync(filePath, "utf8");

  const parsed = matter(content);
  if (parsed.excerpt === undefined || parsed.excerpt === '') {
    parsed.excerpt = parsed.content
      .slice(0, 160)
      .replace(/\s+/g, ' ');
  }
  return { ...parsed, slug } as unknown as MatterAndContent;
};

export const headingToUrl = (heading: string) => heading.replace(/[ ]/g, '-').replace(/[^a-zA-Z0-9-]/g, '').toLowerCase();


export const parseHeadings = (content: string) => {
  const tagHeadings = content.match(/(<h\d>)(.*)<\/h\d>/gm);
  const mdHeadings = content.match(/^ *(#{1,4}) (.*)$/gm);
  const headings = [...(tagHeadings ?? []), ...(mdHeadings ?? [])];
  return headings.map((heading) => {
    const trimmed = heading.trim();
    const level = trimmed.match(/^ *(#{1,4}) /)?.[1].length ?? parseInt(trimmed.match(/^<h(\d)>/)?.[1] ?? '0') ?? 0;
    const text = trimmed.replace(/^ *#{1,4} /, '').replace(/<h\d>/, '').replace(/<\/h\d>/, '').trim();
    return { level: level - 1, text, anchor: headingToUrl(text) };
  }).filter((heading) => heading.text !== '' && heading.level >= 0);
};
