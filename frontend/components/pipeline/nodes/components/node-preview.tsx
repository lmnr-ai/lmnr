import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StaticImageData, StaticImport } from "next/dist/shared/lib/get-img-props";
import Image from "next/image";
import { useState } from "react";

export interface NodePreviewProps {
  name: string
  description: string,
  imageSrc: StaticImport | StaticImageData,
  imageAlt?: string,
  documentationUrl?: string
}

export default function NodePreviewComponent({
  name,
  description,
  documentationUrl,
  imageSrc,
  imageAlt,
}: NodePreviewProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  return (
    <div className='p-4 space-x-4 flex md:w-[500px] sm:w-[300px] '>
      <div className='space-y-2 flex flex-col w-1/2'>
        <Label>{name}</Label>
        <Label className='text-secondary-foreground text-sm'>
          {description}
        </Label>
        <a className="text-sm" href={documentationUrl} target="_blank">Learn more</a>
      </div>
      <div className='relative w-1/2 h-[200px]'>
        <Image
          src={imageSrc}
          alt={imageAlt ?? `${name} node preview`}
          layout="fill"
          objectFit="contain"
          // className={`${(!imageLoaded) ? 'opacity-0' : 'opacity-100'}}`}
          onLoadingComplete={() => setImageLoaded(true)}
        />
        {!imageLoaded && (
          <Skeleton className='absolute inset-0' />
        )}
      </div>
    </div>
  )
}
