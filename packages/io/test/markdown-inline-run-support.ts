/**
 * markdown 인라인 런 왕복 테스트가 공유하는 helper다.
 * `markdown-attention-char-reference.test.ts`(#394)와
 * `markdown-strike-flanking.test.ts`(#397)가 같은 본문을 각자 선언했던 것을
 * 여기로 올렸다(G-TST-002).
 * - 문단 하나 또는 표 셀 하나에 content를 둔 문서를 만든다.
 * - strict·lossy 내보내기 문자열과, 재가져온 첫 블록의 글자 런을 돌려준다.
 */
import type {
  Block,
  Document,
  InlineContent,
  InlineContentItem,
  TextMark,
} from "@cp949/geul-model";

import { exportMarkdown, importMarkdown } from "../src/index.js";
import {
  buildDocument,
  paragraphBlock,
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
