import { type ImgHTMLAttributes } from "react";

import LightboxImage from "@/components/blog/lightbox-image";

/**
 * Blog image, optionally captioned.
 *
 * Caption comes from markdown's native title syntax:
 *
 *   ![alt text](https://…/image.png "This is the caption")
 *
 * Always wrapped in a <figure> so spacing is uniform whether or not a caption
 * is present — typeset gives `figure` the flow margin, which is why the image
 * itself carries no margin class. Typeset supplies the caption's typography
 * and spacing, while the classes below customize its color and top margin.
 */
export default function BlogImage({ title, ...props }: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <figure>
      <LightboxImage className="not-typeset relative w-full border rounded-lg" {...props} />
      {title ? <figcaption className="mt-3 text-sm text-foreground-300">{title}</figcaption> : null}
    </figure>
  );
}
