// document-import(importHtml) sanitize schema를 담는다. 공유
// htmlSanitizeSchema(sanitize-schema.ts)를 얕은 복사해 details/summary/img/
// figure/figcaption/video/audio 등 importHtml 변환기가 읽는 태그·속성을
// 이 파일에서 추가로 허용한다. 클립보드 schema(clipboard-sanitize-schema.ts)도
// 이 schema를 바탕으로 한다 — 표 옆 블록을 같은 변환기로 읽어서다.
import {
  htmlAllowedAttributes,
  htmlAllowedTagNames,
  htmlSanitizeSchema,
  sanitizeAllowedAttributes,
  styleReadAttributes,
} from "./sanitize-schema.js";

// 4종 미디어 블록(file/image/video/audio, spec §7.1)이 공유하는 data-geul-*
// 속성 전체(RD-001-DELTA-01 export 계약과 동일 집합) — 어느 태그가 어느
// 서브셋만 실제로 쓰는지는 export 쪽 타입 제약(mediaDataAttributes)이 이미
// 지키므로 여기서는 태그마다 7개 전부를 공통 허용한다(표 셀·목록 마커
// allowlist의 기존 관례와 동일 — sanitize는 존재 여부만 검사하고 타입별
// 제약은 parseDocument가 최종 판정).
const mediaDataAttributeNames = [
  "dataGeulBlockId",
  "dataGeulMediaType",
  "dataGeulName",
  "dataGeulBackgroundColor",
  "dataGeulShowPreview",
  "dataGeulPreviewWidth",
  "dataGeulTextAlignment",
  // iframe(CUS-001~004)만 쓰는 2개(RD-003 DELTA-01) — src는 export가
  // 이미 dataGeulSrc로 방출 중이라(RD-001-DELTA-01) 이 allowlist에 없으면
  // re-import 시 sanitize가 조용히 제거한다. 접근성 title은 4종과 공유하는
  // dataGeulName을 그대로 재사용한다(별도 속성 없음, spec §2 "name = 접근성
  // title").
  "dataGeulSrc",
  "dataGeulAspectRatio",
];

// 목록 import가 의미로 소비하는 속성을 sanitizer의 document-import 전용
// schema에 추가한다. raw HAST를 다시 읽지 않고 li ID와 ol start도 sanitized
// HAST에서만 읽기 위한 경계다. 공유 schema 객체는 경고 기준과 함께 쓰므로
// 변경하지 않고 이 importer에서만 얕은 복사한다.
export const htmlImportSanitizeSchema = {
  ...htmlSanitizeSchema,
  // details/summary는 공유 htmlAllowedTagNames에 올리지 않는다
  // (RD-005-DELTA-01). tagNames를 override하는 첫 사례라 li/ol의
  // attributes-only override와 다르다. img/figure/figcaption/video/audio
  // (RD-001-DELTA-02)도 같다. 공유 목록은 경고 기준 schema
  // (htmlSanitizeSchema)가 쓴다.
  tagNames: [
    ...htmlAllowedTagNames,
    "details",
    "summary",
    "img",
    "figure",
    "figcaption",
    "video",
    "audio",
  ],
  attributes: {
    ...sanitizeAllowedAttributes,
    // 뒤 세 속성(TextBlockProps, RD-004 DELTA-02)은 li(bulletListItem/
    // numberedListItem/checkListItem)·summary(toggleListItem)가 공유하는
    // 블록 레벨 색상·정렬 매핑이다 — 위 htmlAllowedAttributes의
    // p/h1~h6/blockquote와 같은 이름 규칙.
    // style은 색을 블록 속성으로, 서식을 안쪽 마크로 읽으려고 남긴다(Issue
    // #334). 읽기 전용이라 경고 기준(htmlAllowedAttributes)에는 없다.
    li: [
      "dataGeulBlockId",
      "dataGeulChecked",
      "dataGeulTextColor",
      "dataGeulBackgroundColor",
      "dataGeulTextAlignment",
      ...(styleReadAttributes.li ?? []),
    ],
    ol: ["start"],
    details: [
      "dataGeulBlockId",
      "dataGeulToggleable",
      "dataGeulCollapsed",
      "open",
    ],
    // summary·figcaption의 style은 색을 블록 속성으로, 서식을 안쪽 마크로
    // 읽으려고 남긴다(Issue #342). 읽기 전용이라 경고 기준에는 없다.
    summary: [
      "dataGeulBlockId",
      "dataGeulTextColor",
      "dataGeulBackgroundColor",
      "dataGeulTextAlignment",
      "style",
    ],
    figcaption: ["style"],
    // file, 또는 showPreview:false로 강등된 image/video/audio가 bare 시각
    // 태그일 때 data-geul-*를 직접 갖는다(RD-001-DELTA-01 export 계약) — 기존
    // href는 공유 목록(htmlAllowedAttributes.a)에 이미 있어 스프레드로
    // 유지된다.
    a: [...(sanitizeAllowedAttributes.a ?? []), ...mediaDataAttributeNames],
    img: ["src", "alt", ...mediaDataAttributeNames],
    video: ["src", "controls", ...mediaDataAttributeNames],
    audio: ["src", "controls", ...mediaDataAttributeNames],
    figure: [...mediaDataAttributeNames],
    // div는 이미 children wrapper·목록류 마커를 갖는다(공유 목록) — url
    // 없는 빈 미디어 블록(<div data-geul-block-id data-geul-media-type>)도
    // 같은 태그를 재사용하므로 media 속성만 추가한다(dataGeulBlockId는
    // 이미 있어 제외). style은 공유 읽기 전용 속성(styleReadAttributes)으로
    // 이미 들어 있다 — 소스 공백 접기가 white-space 모드를 읽고(Issue #321),
    // 문단 div가 색·서식을 읽는다(Issue #334). raw 경고는 공유 허용 목록
    // (style 없음)으로 판정하므로 이전처럼 style 제거를 보고한다.
    div: [
      ...(sanitizeAllowedAttributes.div ?? []),
      ...mediaDataAttributeNames.filter((name) => name !== "dataGeulBlockId"),
    ],
  },
};

const importAttributes: Record<string, string[]> =
  htmlImportSanitizeSchema.attributes;

// style과 bgColor는 읽어도 제거를 보고하는 정책이라 수집기가 계속 판정한다
// (RD-001 결정). 감사 대상이 아니다.
const REPORTED_EVEN_WHEN_READ_ATTRIBUTES = new Set(["style", "bgColor"]);

// codeBlock 메타다. 경고 기준에 있지만 codeBlock 분기만 읽는다. 표 셀 pre,
// pre 밖 code, codeBlock 안에서 버려지는 pre·code에서는 사라진다. 그래서 감사
// 대상이다(Issue #356 RD-006).
const CODE_BLOCK_META_ATTRIBUTES: Record<string, readonly string[]> = {
  pre: ["dataGeulBlockId", "dataLanguage", "className", "dataGeulCodeWrap"],
  code: ["dataLanguage", "className"],
};

// 변환 뒤 감사 대상인 속성인지 판정한다(RD-001). 기준:
// - 이 schema가 남긴다.
// - 경고 기준(htmlAllowedAttributes)에는 없다. 단 codeBlock 메타(위)는 감사
//   대상이다.
// - 읽어도 보고하는 속성(위)이 아니다.
// 수집기(import-warnings.ts)는 이 속성을 건너뛰고, 변환기가 보존했다고 표시하지
// 않은 것만 변환 뒤 감사가 경고한다. 두 쪽이 같은 함수를 쓰므로 이 속성의
// 경고는 정확히 한 곳에서만 나온다.
export const isAuditedAttribute = (
  tagName: string,
  attribute: string,
): boolean =>
  (CODE_BLOCK_META_ATTRIBUTES[tagName] ?? []).includes(attribute) ||
  (!REPORTED_EVEN_WHEN_READ_ATTRIBUTES.has(attribute) &&
    (importAttributes[tagName] ?? []).includes(attribute) &&
    !(
      htmlAllowedAttributes[tagName] ??
      htmlAllowedAttributes["*"] ??
      []
    ).includes(attribute));
