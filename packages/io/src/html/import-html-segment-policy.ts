// document-import 경로가 block-segmenter.ts에 넘기는 BlockSegmentPolicy를
// 담당한다: heading 태그명 → level 매핑(headingLevelByTagName)과, 문단/
// 헤딩/구분선/표/인용/코드블록/미디어 경계를 판정하는 importBlockSegmentPolicy
// 정책 객체(RD-001~RD-005의 판정 태그 집합을 한곳에 모은다).
import type { HeadingBlock } from "@cp949/geul-model";

import {
  type BlockSegmentPolicy,
  isParagraphTag,
  isTransparentListTag,
  NESTED_BOUNDARY_TAG_NAMES,
} from "./block-segmenter.js";
import { isMediaNode } from "./import-html-media.js";

// heading 태그명 → model HeadingBlock["level"]. h1~h6 전부가 heading이다
// (DELTA-06, Issue #38 — model이 level 1~6을 허용하고 sanitize도 h4~h6를
// 살린다). 정규식 + Number() + 캐스트 대신 표를 쓰는 이유: 표의 값 타입이
// 곧 model 계약이라 세그먼트의 level이 캐스트 없이 HeadingBlock["level"]로
// 좁혀지고(segmentBlocks<Level>), 범위 검증을 io에 중복하지 않는다
// (G-CNV-001 — 최종 검증은 parseDocument). Record 대신 Map인 이유는
// "constructor" 같은 프로토타입 키가 태그명으로 들어와도 값을 돌려주지
// 않게 하기 위해서다. findChildrenWrapper의 자기 콘텐츠 판정도 이 표를
// 공유해 두 자리의 heading 태그 집합이 어긋나지 않는다.
export const headingLevelByTagName = new Map<string, HeadingBlock["level"]>([
  ["h1", 1],
  ["h2", 2],
  ["h3", 3],
  ["h4", 4],
  ["h5", 5],
  ["h6", 6],
]);

// documentFromRoot의 재귀 경계 판정(문단/헤딩/구분선/표 시퀀스로 쪼개기)은
// clipboard-table-parser.ts의 blockSequenceFromNodes와 block-segmenter.ts를
// 공유한다(아키텍처 리뷰 2차 후보 G) — p/h1~h3/table만 보던 예전 documentFromRoot
// 는 최상위 노드만 훑는 평면 루프라 div/li/blockquote/ul/ol처럼 중첩 가능한
// 경계를 인식하지 못했다(Issue #113과 같은 종류의 병합). heading 다운그레이드
// 정책은 이제 없다 — import·clipboard 둘 다 h1~h6 전부 heading으로 쓴다
// (DELTA-08, Issue #38 슬라이스 3). 공유는 문단 경계 태그 집합만이다(그릴링 결정).
// hr은 콘텐츠 없는 세그먼트로 받아 divider 블록으로 옮긴다(spec §7.1) —
// clipboard 정책은 isDividerTag를 넘기지 않아 hr 처리가 갈라진다.
// blockquote도 같은 방식으로 세그먼트로 받아 quote 블록으로 옮긴다
// (DELTA-06a, D6 분할 규칙은 splitQuoteChildren) — clipboard 정책은
// isQuoteTag를 넘기지 않아 blockquote가 문단 경계로 남는다.
export const importBlockSegmentPolicy: BlockSegmentPolicy<
  HeadingBlock["level"],
  true
> = {
  isSimpleBoundary: isParagraphTag,
  headingLevelFromTagName: (tagName) => headingLevelByTagName.get(tagName),
  isNestedBoundary: (tagName) => NESTED_BOUNDARY_TAG_NAMES.has(tagName),
  isTransparent: isTransparentListTag,
  isTableNode: (node) => node.tagName === "table",
  isDividerTag: (tagName) => tagName === "hr",
  isQuoteTag: (tagName) => tagName === "blockquote",
  isCodeBlockTag: (tagName) => tagName === "pre",
  isMediaNode,
};
