/**
 * quote·divider 블록을 담은 Document를 짧게 만드는 fixture 빌더다.
 * 미지원 블록 임시 거절 테스트(unsupported-block-export.test.ts)와 quote·divider
 * 실제 매핑이 들어오는 후속 DELTA(06·06a·07·07a)의 테스트가 같은 블록 모양을
 * 공유한다 — 블록 리터럴을 각 테스트 파일에 흩어 두면 id·type 규약이 어긋나기
 * 쉽다. 단순 리터럴 빌더라 별도 계약 테스트는 두지 않는다.
 */
import type {
  Block,
  DividerBlock,
  Document,
  QuoteBlock,
} from "@cp949/geul-model";

/**
 * 텍스트 한 조각을 content로 갖는 quote 블록을 만든다.
 * children을 주면 그대로 붙여 계층 시나리오(quote 아래 블록)를 짧게 표현한다.
 */
export const quoteBlock = (
  id: string,
  text: string,
  children?: Block[],
): QuoteBlock =>
  children === undefined
    ? { id, type: "quote", content: [{ text }] }
    : { id, type: "quote", content: [{ text }], children };

/**
 * content도 children도 없는 divider 리프 블록을 만든다.
 */
export const dividerBlock = (id: string): DividerBlock => ({
  id,
  type: "divider",
});

/**
 * 블록 배열을 formatVersion 1·revision 0의 Document로 감싼다.
 * 테스트는 블록 배열만 조립하고 문서 껍데기는 여기에 맡긴다.
 */
export const buildDocument = (blocks: Block[]): Document => ({
  formatVersion: 1,
  revision: 0,
  blocks,
});
