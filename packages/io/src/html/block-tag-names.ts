// 변환기가 블록으로 읽는 태그 이름 표를 소유하는 leaf module이다
// (Issue #369). 분할 정책(import-html-segment-policy.ts)·미디어 판정
// (import-html-media.ts)과 raw 경고 수집기(import-warnings.ts)가 같은 표를
// 읽는다. 수집기가 목록을 따로 두면 변환기가 블록으로 읽는 태그가 늘 때
// 거짓 SAFE_BLOCK_DOWNGRADED 경고가 난다(G-CNV-002).
//
// sanitize 허용 목록에서 파생하지 않는다. 수집기가 sanitize 구현에 결합된다
// (ADR-0003).
//
// import-warnings.ts를 직접·간접으로 import하지 않는다. import-html-media.ts와
// import-html-segment-policy.ts가 import-warnings.ts에 닿으므로 이 module에서
// 거슬러 올라가면 순환이다(ADR-0011). 값은 block-segmenter.ts에서만 import하고
// 나머지는 타입만 import한다.
import type { HeadingBlock } from "@cp949/geul-model";

import {
  LIST_TAG_NAMES,
  NESTED_BOUNDARY_TAG_NAMES,
  PARAGRAPH_TAG_NAME,
} from "./block-segmenter.js";

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

export const DIVIDER_TAG_NAME = "hr";
export const CODE_BLOCK_TAG_NAME = "pre";
export const TABLE_TAG_NAME = "table";
// toggleListItem의 HTML 표현이다(RD-005-DELTA-01).
export const TOGGLE_TAG_NAME = "details";
// 미디어 블록의 bare 시각 태그다(RD-001-DELTA-02).
export const MEDIA_VISUAL_TAG_NAMES: ReadonlySet<string> = new Set([
  "img",
  "video",
  "audio",
]);
// figure는 미디어 wrapper와 codeBlock wrapper 두 의미를 겸한다. figcaption은
// 둘의 caption이다.
export const MEDIA_WRAPPER_TAG_NAME = "figure";
export const CAPTION_WRAPPER_TAG_NAME = "figcaption";

// 변환기가 블록으로 읽는 태그 이름이다. table·details·figure의 자식(td,
// summary, img 등)은 따로 등록하지 않는다 — 이 태그들은 수집기의
// isBlockBoundaryTag에 없어 안쪽으로 내려가면 최상위 판정이 꺼진다.
// summary는 분할 정책의 중첩 경계지만 넣지 않는다. 단독 <summary>는 details
// 밖이라 블록으로 읽히지 않고 문단으로 강등되므로 경고 대상이다.
// own-format <a>는 이 표에 없다. <a>는 일반 링크의 보편적 캐리어라 태그명으로
// 넣으면 마커 없는 임의 링크의 강등 경고까지 사라진다. 마커 노드 판정은
// media-type-marker.ts가 한다.
export const IMPORT_BLOCK_TAG_NAMES: ReadonlySet<string> = new Set([
  PARAGRAPH_TAG_NAME,
  ...headingLevelByTagName.keys(),
  DIVIDER_TAG_NAME,
  CODE_BLOCK_TAG_NAME,
  ...NESTED_BOUNDARY_TAG_NAMES,
  ...LIST_TAG_NAMES,
  TABLE_TAG_NAME,
  TOGGLE_TAG_NAME,
  ...MEDIA_VISUAL_TAG_NAMES,
  MEDIA_WRAPPER_TAG_NAME,
  CAPTION_WRAPPER_TAG_NAME,
]);
