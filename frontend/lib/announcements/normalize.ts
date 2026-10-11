// The host class excludes whitespace so a URL before a relative image cannot
// consume the Markdown between them while searching for the next `/uploads/`.
export const normalizeStrapiUploadUrls = (text: string): string =>
  text.replaceAll(/https?:\/\/[^/\s]+\/uploads\//g, "/uploads/");
