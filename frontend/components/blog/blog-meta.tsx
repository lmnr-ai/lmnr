import Image from "next/image";
import Link from "next/link";

import { BlogMetadata } from "@/lib/blog/types";
import { formatUTCDate } from "@/lib/utils";

import { Label } from "../ui/label";

interface BlogMetaProps {
  data: BlogMetadata;
}



export default function BlogMeta({ data }: BlogMetaProps) {
  return (
    <div className="flex flex-col space-y-1 items-start">
      <h1 className="text-5xl font-bold py-2">{data.title}</h1>
      {/* <p className="text-secondary-foreground">{data.description}</p> */}
      <p className="text-secondary-foreground"> {formatUTCDate(data.date)} </p>
      {data.author.url
        ? <Label className="text-secondary-foreground hover:text-primary"><Link href={data.author.url}>{data.author.name}</Link></Label>
        : <Label className="text-secondary-foreground">{data.author.name}</Label>
      }
      {data.image &&
        <div className="w-full flex items-center py-4">
          <Image src={data.image} alt={data.title} width={1200} height={800} />
        </div>
      }
    </div>
  );
}
