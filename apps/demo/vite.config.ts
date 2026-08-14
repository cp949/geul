import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              name: "editor-runtime",
              test: /node_modules[\\/](?:@tiptap[\\/]|prosemirror-[^\\/]+[\\/])/,
              priority: 3,
            },
            {
              name: "react-runtime",
              test: /node_modules[\\/](?:react|react-dom|scheduler)[\\/]/,
              priority: 2,
            },
            {
              name: "document-io",
              test: /node_modules[\\/](?:hast-|mdast-|micromark|rehype-|remark-|unified[\\/]|unist-|vfile|zod[\\/])/,
              priority: 1,
            },
            {
              name: "vendor-runtime",
              test: /node_modules[\\/]/,
            },
          ],
        },
      },
    },
  },
});
