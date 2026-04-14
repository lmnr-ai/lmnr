import { type Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { getBlogPosts } from "@/lib/blog/utils";
import { formatUTCDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Articles",
  description: "In-depth articles on AI observability, agent frameworks, and LLM tooling from the Laminar team.",
  openGraph: {
    title: "Laminar Articles",
    description: "In-depth articles on AI observability, agent frameworks, and LLM tooling from the Laminar team.",
    url: "https://laminar.sh/article",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Laminar Articles",
    description: "In-depth articles on AI observability, agent frameworks, and LLM tooling from the Laminar team.",
  },
};

export default async function ArticlesPage() {
  const posts = await getBlogPosts({ sortByDate: true, category: "article" });

  return (
    <div className="px-4 mt-32 pb-16 grid grid-cols-1 gap-4 container w-full md:grid-cols-3">
      {posts.map((post, index) => (
        <Link href={`/article/${post.slug}`} key={index}>
          <Card className="overflow-hidden h-[300px] bg-background flex flex-col">
            {post.data.image && (
              <Image
                src={post.data.image}
                alt={post.data.title}
                width={400}
                height={200}
                className="object-cover mx-auto"
              />
            )}
            <CardHeader>
              <CardTitle className="font-space-grotesk text-2xl text-white">{post.data.title}</CardTitle>
            </CardHeader>
            <CardContent className="flex grow"></CardContent>
            <CardFooter className="flex align-bottom">
              <Label className="text-secondary-foreground">{formatUTCDate(post.data.date)}</Label>
            </CardFooter>
          </Card>
        </Link>
      ))}
    </div>
  );
}
