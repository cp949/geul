/**
 * markdown 인라인 런 왕복 테스트가 공유하는 helper다.
 * `markdown-attention-char-reference.test.ts`(#394)와
 * `markdown-strike-flanking.test.ts`(#397)가 같은 본문을 각자 선언했던 것을
 * 여기로 올렸다(G-TST-002).
 * - 문단 하나 또는 표 셀 하나에 content를 둔 문서를 만든다.
 * - 글자 content를 가진 호스트 블록(문단·제목·목록 항목·quote·callout·표 셀) 하나에
 *   content를 둔 문서를 만든다(`hostDocument`). 호스트 블록 id는 항상 "host"다.
 * - strict·lossy 내보내기 문자열과, 재가져온 첫 블록의 글자 런을 돌려준다.
 * - 손실 목록(`lossesOf`)·손실 kind 목록(`kindsOf`)·strict 거절 손실
 *   (`strictRejectedLosses`)을 callout 고유 손실을 뺀 채 돌려준다.
 * - 재가져온 content의 글자를 이어 붙이고(`joinedText`), mark가 달린 런만 뽑는다(`markedRuns`).
 */
import type {
  Block,
  Document,
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";
import { expect } from "vitest";

import {
  analyzeMarkdownLoss,
  exportMarkdown,
  importMarkdown,
  type MarkdownLoss,
} from "../src/index.js";
import {
  buildDocument,
  calloutBlock,
  headingBlock,
  paragraphBlock,
  quoteBlock,
} from "./fixtures/quote-divider-document.js";

/**
 * mark 목록을 가진 글자 런 하나를 만든다.
 */
export const run = (text: string, marks: TextMark[]): InlineContentItem => ({
  text,
  marks,
});

/**
 * content를 담은 paragraph 하나짜리 문서를 만든다.
 */
export const paragraphDocument = (content: InlineContent): Document => {
  const block: Block = { ...paragraphBlock("host", ""), content };
  return buildDocument([block]);
};

/**
 * content를 가질 수 있는 호스트 블록 종류다. 표 셀은 표 블록 안의 셀 하나다.
 */
export type Host =
  | "paragraph"
  | "heading"
  | "bulletListItem"
  | "checkListItem"
  | "quote"
  | "callout"
  | "tableCell";

/**
 * 호스트 종류에 content를 얹은 문서를 만든다. 호스트 블록 id는 항상 "host"다.
 * 표 셀은 열 1개·행 1개 표의 유일한 셀에 content를 둔다(rowId "row", cellId "cell").
 * heading의 level은 기본 1이고 `headingLevel`로 바꾼다.
 */
export const hostDocument = (
  host: Host,
  content: InlineContent,
  headingLevel: 1 | 2 | 3 | 4 | 5 | 6 = 1,
): Document => {
  const block: Block = (() => {
    switch (host) {
      case "paragraph":
        return { ...paragraphBlock("host", ""), content };
      case "heading":
        return { ...headingBlock("host", headingLevel, ""), content };
      case "bulletListItem":
        return { id: "host", type: "bulletListItem", content };
      case "checkListItem":
        return { id: "host", type: "checkListItem", checked: false, content };
      case "quote":
        return { ...quoteBlock("host", ""), content };
      case "callout":
        return { ...calloutBlock("host", ""), content };
      case "tableCell":
        return tableCellDocument(content).blocks[0] as Block;
    }
  })();
  return buildDocument([block]);
};

/**
 * 열 1개·행 1개 표의 유일한 셀에 content를 둔 문서를 만든다.
 */
export const tableCellDocument = (content: InlineContent): Document =>
  buildDocument([
    {
      id: "host",
      type: "table",
      columns: [{ id: "col", width: 160 }],
      rows: [
        {
          id: "row",
          cells: [
            {
              id: "cell",
              columnId: "col",
              rowSpan: 1,
              columnSpan: 1,
              content,
            },
          ],
        },
      ],
      headerRows: 1,
      headerColumns: 0,
    },
  ]);

/**
 * strict 내보내기를 실행해 markdown 문자열을 돌려준다. 실패하면 던진다.
 */
export const strictMarkdown = (document: Document): string => {
  const result = exportMarkdown(document, { mode: "strict" });
  if (!result.ok) throw new Error(`strict 내보내기 실패: ${result.error.code}`);
  return result.value;
};

/**
 * lossy 내보내기를 실행해 markdown 문자열을 돌려준다. 실패하면 던진다.
 * underline·textColor·backgroundColor는 lossy에서 mark 없이 통과한다.
 */
export const lossyMarkdown = (document: Document): string => {
  const result = exportMarkdown(document, { mode: "lossy" });
  if (!result.ok) throw new Error(`lossy 내보내기 실패: ${result.error.code}`);
  return result.value.markdown;
};

/**
 * markdown을 재가져와 첫 블록의 글자 런을 돌려준다. 표이면 첫 셀의 글자 런이다.
 * 실패하면 던진다.
 * 반환형은 `unknown`이다. 호출자가 `toEqual`로만 비교하고, 블록 종류마다 content
 * 형이 달라 좁은 반환형을 주면 단언을 더해야 한다.
 */
export const importedRuns = (markdown: string): unknown => {
  const result = importMarkdown(markdown);
  if (!result.ok) throw new Error(`재가져오기 실패: ${result.error.code}`);
  const block = result.value.document.blocks[0];
  if (block === undefined) throw new Error("재가져온 블록이 없다");
  if ("rows" in block) return block.rows[0]?.cells[0]?.content;
  return "content" in block ? block.content : undefined;
};

/**
 * callout은 content와 무관하게 항상 CALLOUT_STATE_LOST를 낸다.
 * 인라인 런 손실만 보는 테스트는 그 kind를 걸러 낸다.
 */
export const withoutCalloutLoss = (
  losses: readonly MarkdownLoss[],
): MarkdownLoss[] =>
  losses.filter((loss) => loss.kind !== "CALLOUT_STATE_LOST");

/**
 * 문서의 손실 중 callout 고유 손실을 뺀 것만 돌려준다. 내보내기 게이트를 거치지 않는다.
 */
export const lossesOf = (document: Document): MarkdownLoss[] =>
  withoutCalloutLoss(analyzeMarkdownLoss(document));

/**
 * 문서의 손실 kind 목록만 뽑는다(callout 고유 손실 제외).
 */
export const kindsOf = (document: Document): string[] =>
  lossesOf(document).map((loss) => loss.kind);

/**
 * strict 내보내기를 실행해 거절 결과의 손실 목록(callout 고유 손실 제외)을 돌려준다.
 * 성공하면 null이다.
 */
export const strictRejectedLosses = (
  document: Document,
): MarkdownLoss[] | null => {
  const result = exportMarkdown(document, { mode: "strict" });
  if (result.ok) return null;
  expect(result.error.code).toBe("MARKDOWN_LOSS_NOT_ALLOWED");
  return "losses" in result.error
    ? withoutCalloutLoss(result.error.losses)
    : [];
};

/**
 * 재가져온 content의 글자를 이어 붙인다. 글자 런 경계는 보지 않는다.
 */
export const joinedText = (runs: unknown): string =>
  (runs as InlineContent)
    .map((item) => ("text" in item ? item.text : ""))
    .join("");

/**
 * 재가져온 content에서 mark가 달린 런의 글자와 mark 종류만 뽑는다.
 */
export const markedRuns = (runs: unknown): Array<[string, string[]]> =>
  (runs as InlineContent).flatMap((item): Array<[string, string[]]> =>
    "text" in item && (item.marks ?? []).length > 0
      ? [[item.text, (item.marks ?? []).map((mark) => mark.type)]]
      : [],
  );
