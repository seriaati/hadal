// A font file imported from code is bundled as a file, and the import is its URL.
declare module "*.woff2" {
  const url: string;
  export default url;
}
