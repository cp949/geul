// importMarkdown이 반환하는 경고·성공 payload 타입만 담는다. 외부 model
// 타입만 참조하는 leaf라 다른 신규 markdown 파일 전체가 순환 없이 기댈 수
// 있다.
import { MAX_NESTING_DEPTH, type Document } from "@cp949/geul-model";

import { MAX_MARKDOWN_TREE_DEPTH } from "./import-markdown-tree-depth.js";

export type ImportWarning = {
  kind:
    | "RAW_HTML_DOWNGRADED"
    | "IMAGE_DOWNGRADED"
    | "UNSUPPORTED_BLOCK_DOWNGRADED"
    | "UNSUPPORTED_INLINE_DOWNGRADED"
    | "CODE_BLOCK_META_DROPPED"
    | "NESTED_BLOCKS_FLATTENED"
    | "DEEP_TREE_FLATTENED";
  // 대부분의 kind는 warning을 유발한 블록의 id를 채운다. DEEP_TREE_FLATTENED만
  // 예외다 — 파싱 직후, own-traversal이 블록 id를 발급하기 전에 일어나는
  // 사전 트리 캡이라 특정할 블록이 아직 없다(HTML의 DEEP_TREE_FLATTENED도
  // 동일하게 blockId 없이 정의돼 있다).
  blockId?: string;
  rowId?: string;
  cellId?: string;
  message: string;
};

// blockquote·list item 중첩이 model 상한(MAX_NESTING_DEPTH)에 걸려 초과분이
// 형제 블록으로 평탄화됐다(Issue #135, G-CNV-002 — 전면 거절 대신 구조
// 손실을 종류·위치가 있는 warning으로 반환한다). blockId는 캡에 걸린
// quote/list-item 블록 자신의 id다(UNSUPPORTED_BLOCK_DOWNGRADED가
// firstBlock.id를 쓰는 기존 관례와 동일한 성격). HTML의
// nestedChildrenFlattenedWarning(html/import-warnings.ts)과 대응하지만,
// markdown 쪽은 캡에 걸린 블록을 warning 자체에서 특정할 수 있어 blockId를
// 인자로 받는다(HTML은 인자 없이 고정 메시지 하나만 낸다).
export const nestedBlocksFlattenedWarning = (
  blockId: string,
): ImportWarning => ({
  kind: "NESTED_BLOCKS_FLATTENED",
  blockId,
  message: `Blocks nested deeper than ${MAX_NESTING_DEPTH} levels were flattened into sibling blocks`,
});

// mdast 트리 깊이가 MAX_MARKDOWN_TREE_DEPTH를 넘어 own-traversal 이전
// 사전 캡(capMarkdownTreeDepth, Issue #135 §9)에서 절단됐다. 절단 자체는
// import-markdown.ts가 파싱 직후 호출하는 capMarkdownTreeDepth가 수행하고,
// 이 경고는 그 반환값(truncated)을 문서 import 경로가 경고로 바꾼 것이다.
// HTML의 deepTreeFlattenedWarning(html/import-warnings.ts)과 대응하지만
// element 필드가 없다 — markdown 쪽 ImportWarning에는 애초에 그 필드가
// 없다(kind마다 다른 위치 정보를 blockId 하나로 표현하는 기존 관례).
export const deepTreeFlattenedWarning = (): ImportWarning => ({
  kind: "DEEP_TREE_FLATTENED",
  message: `Markdown nested deeper than ${MAX_MARKDOWN_TREE_DEPTH} levels was flattened to text`,
});

export type ImportSuccess = {
  document: Document;
  warnings: ImportWarning[];
};
