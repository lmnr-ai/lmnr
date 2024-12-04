import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { getServerSession } from "next-auth";

import Footer from "@/components/landing/footer";
import LandingHeader from "@/components/landing/landing-header";
import { Card, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { authOptions } from "@/lib/auth";
import { getBlogPosts } from "@/lib/blog/utils";
import { formatUTCDate } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Laminar Blog",
  description: "Laminar blog posts",
  openGraph: {
    title: "Laminar Blog",
    description: "Laminar blog posts",
  },
  twitter: {
    title: "Laminar Blog",
    description: "Laminar blog posts",
  },
};

export default async function BlogsPage() {
  const posts = getBlogPosts({ sortByDate: true });
  const session = await getServerSession(authOptions);
  return <>
    <div className="h-full">
      <LandingHeader hasSession={session !== null && session !== undefined} />
      <div className="mt-32 pb-48 grid grid-cols-1 gap-4 md:w-[1000px] w-full md:grid-cols-3 mx-auto">
        {posts.map((post, index) => (
          <Link href={`/blog/${post.slug}`} key={index}>
            <Card key={index} className="overflow-hidden h-[350px]">
              {post.data.image && <Image src={post.data.image} alt={post.data.title} width={400} height={200} className="object-cover mx-auto"/>}
              <CardHeader>
                <CardTitle>
                  {post.data.title}
                </CardTitle>
              </CardHeader>
              <CardFooter>
                <Label className="text-secondary-foreground">
                  {formatUTCDate(post.data.date)}
                </Label>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
      <Footer />
    </div>
  </>;
}
