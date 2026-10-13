// 글자 런을 mdast 인라인 노드로 바꾼다. mark별 감싸기와 인접 노드 병합까지 한다.
// 표 셀 판정(code-table-pipe.ts)과 내보내기(export-markdown.ts)가 같은 변환을 쓴다.
// 판정이 변환 결과의 노드를 보므로 합치는 규칙을 모델 쪽에 복제하지 않는다(G-CNV-001).
import type { InlineContent, TextMark } from "@cp949/geul-model";

import { mergeAdjacentInline } from "./merge-adjacent-inline.js";
import { mergeAdjacentText } from "./merge-adjacent-text.js";

export type MarkdownOutputNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  alt?: string;
  lang?: string;
  align?: Array<"left" | "center" | "right" | null>;
  ordered?: boolean;
  start?: number;
  spread?: boolean;
  checked?: boolean;
  children?: MarkdownOutputNode[];
};

// textColor/backgroundColor는 기존 6종 뒤(6·7)에 붙는다 — RD-001
// DELTA-01(model TextMark 확장)이 이 Record를 컴파일 오류로 강제 갱신시켜
// 여기 추가했다.
const markOrder: Record<TextMark["type"], number> = {
  link: 0,
  bold: 1,
  italic: 2,
  strike: 3,
  code: 4,
  underline: 5,
  textColor: 6,
  backgroundColor: 7,
};

const wrapNodes = (
  nodes: MarkdownOutputNode[],
  mark: TextMark,
): MarkdownOutputNode[] => {
  switch (mark.type) {
    case "link":
      return [{ type: "link", url: mark.href, children: nodes }];
    case "bold":
      return [{ type: "strong", children: nodes }];
    case "italic":
      return [{ type: "emphasis", children: nodes }];
    case "strike":
      return [{ type: "delete", children: nodes }];
    case "underline":
      return nodes;
    case "code":
      return nodes;
    case "textColor":
    case "backgroundColor":
      // GFM/commonmark에는 색상을 표현할 구문이 없다 — underline·code와
      // 같은 이유로 값을 버리고 콘텐츠만 통과시킨다(최종 lossy 동작,
      // 임시 스텁이 아니다). strict export의 거절과 손실 경고 보고는 더
      // 상위 계층(analyzeMarkdownLoss)이 맡는다 — RD-004가 그 카테고리를
      // 추가한다.
      return nodes;
  }
};

// table 밖 블록(inTableCell: false)의 `\n`도 table cell과 대칭으로
// 하드브레이크 노드를 삽입한다(RD-004, #177). table cell은 GFM 표 구문이
// 셀 안 개행을 허용하지 않아 mdast `break`가 공백 하나로 뭉개진다(실측,
// mdast-util-to-markdown의 기본 break 핸들러 — 개행이 허용되지 않는
// scope에서는 space로 폴백) — 그래서 계속 `<br>` HTML 노드로 우회한다.
// table 밖은 그 제약이 없어 `break`가 `\\\n`(백슬래시+개행)으로 정상
// 직렬화되고, import 쪽(`import-markdown-inline.ts`의 `case "break"`)은
// 이미 위치와 무관하게 `\n`으로 디코드해 대칭이 갖춰져 있었다 — export
// 쪽만 이 DELTA가 채운다.
const textNodes = (
  text: string,
  inTableCell: boolean,
): MarkdownOutputNode[] => {
  if (!inTableCell && !text.includes("\n")) {
    return [{ type: "text", value: text }];
  }

  const parts = text.split("\n");
  const nodes: MarkdownOutputNode[] = [];
  for (const [index, part] of parts.entries()) {
    if (part.length > 0) nodes.push({ type: "text", value: part });
    if (index < parts.length - 1) {
      nodes.push(
        inTableCell ? { type: "html", value: "<br>" } : { type: "break" },
      );
    }
  }
  return nodes;
};

// 글자 런마다 mark 노드를 따로 감싼다. 인접 노드 병합은 inlineNodes가 한다.
const runNodes = (
  content: InlineContent,
  inTableCell: boolean,
): MarkdownOutputNode[] =>
  content.flatMap((rawItem) => {
    // 계약: exportMarkdown의 blocksInlineContentViolation(RD-002-DELTA-16)
    // 가 이 함수 호출 전에 이미 커스텀 inline 원소·CustomTextMark를
    // MARKDOWN_DOCUMENT_INVALID로 거절했다는 전제 위에서 텍스트 런·알려진
    // 마크로 캐스트한다(core inlineContentToTiptap과 동일 패턴). 이 함수는
    // packages/io/src/index.ts에 재수출되지 않는 내부 전용이라 진입점
    // 게이트를 우회해 호출될 길이 없다.
    const item = rawItem as { text: string; marks?: TextMark[] };
    const marks = (item.marks ?? [])
      .filter((mark) => mark.type !== "underline")
      .map((mark, index) => ({ mark, index }))
      .sort(
        (left, right) =>
          markOrder[left.mark.type] - markOrder[right.mark.type] ||
          left.index - right.index,
      )
      .map(({ mark }) => mark);
    const hasCode = marks.some((mark) => mark.type === "code");
    const wrappingMarks = marks.filter((mark) => mark.type !== "code");
    const nodes =
      hasCode && !item.text.includes("\n")
        ? [{ type: "inlineCode", value: item.text }]
        : textNodes(item.text, inTableCell);

    return [...wrappingMarks]
      .reverse()
      .reduce<MarkdownOutputNode[]>(
        (wrapped, mark) => wrapNodes(wrapped, mark),
        nodes,
      );
  });

// 인접한 같은 mark 노드를 합친다(Issue #395). 합치지 않으면 strike·code가
// `~~a~~~~b~~`처럼 나란히 나가 재가져오기에서 구분자가 글자로 샌다.
// 그 뒤 인접 평문 text도 합친다(Issue #399). lossy에서 mark 없이 통과한 런이
// 평문 text 둘로 남으면 `\`+글자 보정이 앞 노드 끝을 놓친다. 순서가 중요하다.
// mergeAdjacentInline이 자식을 이어 붙인 뒤에야 text끼리 만난다.
export const inlineNodes = (
  content: InlineContent,
  inTableCell: boolean,
): MarkdownOutputNode[] =>
  mergeAdjacentText(mergeAdjacentInline(runNodes(content, inTableCell)));
