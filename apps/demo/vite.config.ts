import { defineConfig } from "vite";

export default defineConfig({
  build: {
    target: "chrome75",
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            {
              // core-js를 vendor-runtime에 섞으면 엔트리의 첫 import가
              // vendor-runtime이 되고, 기존 vendor-runtime ⇄ document-io
              // 청크 순환의 평가 순서가 뒤집혀 document-io 본문이
              // vendor-runtime의 var 할당보다 먼저 실행돼 기동이 깨진다
              // (실측: TypeError: m is not a function — cp949/geul#122).
              // 전용 청크로 떼어 폴리필이 가장 먼저, 순환 밖에서 평가되게
              // 한다.
              name: "polyfills",
              test: /node_modules[\\/]core-js[\\/]/,
              priority: 4,
            },
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
