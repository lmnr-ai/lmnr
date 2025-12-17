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
    <div className="flex flex-col gap-8 items-center">
      <div className="flex flex-col w-full md:w-[700px] lg:max-w-3xl gap-4 mb-16">
        <h1 className="text-5xl font-bold font-title">{data.title}</h1>
        <p className="text-secondary-foreground text-sm"> {formatUTCDate(data.date)} </p>
        {data.author.url
          ? <Label className="text-secondary-foreground hover:text-primary"><Link href={data.author.url}>{data.author.name}</Link></Label>
          : <Label className="text-secondary-foreground">{data.author.name}</Label>
        }
      </div>
      {data.image &&
        <div className="w-full flex rounded overflow-hidden">
          <Image src={data.image} alt={data.title} width={1000} height={800} />
        </div>
      }
    </div>
  );
}
