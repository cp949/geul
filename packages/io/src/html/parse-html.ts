import rehypeParse from "rehype-parse";
import { unified } from "unified";

import type { HtmlRoot } from "./inline-content.js";

// 문서 import 경로와 클립보드 경로가 같은 파서 설정을 쓴다. 각자 unified()
// 체인을 만들면 fragment 옵션 같은 설정이 조용히 갈라져 같은 HTML이 두
// 경로에서 다르게 파싱된다.
export const parseHtmlFragment = (html: string): HtmlRoot | undefined =>
  asRoot(parseProcessor.parse(html));

const parseProcessor = unified().use(rehypeParse, { fragment: true });

// unified().parse()의 반환 타입은 우리 HtmlRoot보다 넓다 — root 노드 모양을
// 확인한 뒤에만 좁힌다. sanitize() 결과에도 같은 검사를 쓴다.
export const asRoot = (node: unknown): HtmlRoot | undefined => {
  if (
    typeof node !== "object" ||
    node === null ||
    !("type" in node) ||
    node.type !== "root" ||
    !("children" in node) ||
    !Array.isArray(node.children)
  ) {
    return undefined;
  }
  return node as HtmlRoot;
};
