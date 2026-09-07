// document-import(importHtml) 전용 sanitize schema를 담는다. clipboard와
// 공유하는 htmlSanitizeSchema(sanitize-schema.ts)를 얕은 복사해 details/
// summary/img/figure/figcaption/video/audio 등 document-import 전용 태그·
// 속성만 이 파일에서 추가로 허용한다.
import {
  htmlAllowedAttributes,
  htmlAllowedTagNames,
  htmlSanitizeSchema,
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
];

// 목록 import가 의미로 소비하는 속성을 sanitizer의 document-import 전용
// schema에 추가한다. raw HAST를 다시 읽지 않고 li ID와 ol start도 sanitized
// HAST에서만 읽기 위한 경계다. 공유 schema 객체는 clipboard 소비자가 함께
// 쓰므로 변경하지 않고 이 importer에서만 얕은 복사한다.
export const htmlImportSanitizeSchema = {
  ...htmlSanitizeSchema,
  // details/summary는 document-import 전용이다(RD-005-DELTA-01) — 공유
  // htmlAllowedTagNames(clipboard와 공유)에는 올리지 않는다. tagNames를
  // override하는 첫 사례라 li/ol의 attributes-only override와 다르다.
  // img/figure/figcaption/video/audio(RD-001-DELTA-02)도 같은 이유로
  // document-import 전용이다 — 공유 목록에 올리면 clipboardAllowedTagNames
  // (= [...htmlAllowedTagNames])가 그대로 상속해 clipboard 붙여넣기
  // sanitize도 이 태그를 보존하게 되는데, clipboard-table-parser.ts는
  // isMediaNode를 전달하지 않아 이 태그를 전혀 인식하지 못하고 figure/img가
  // pending 텍스트로 뭉개지는 의도치 않은 동작 변화가 생긴다(RD-001-
  // DELTA-02.md "결정" — hast-util-sanitize의 tagNames 판정이 strip보다
  // 항상 우선이라 clipboardStrippedTagNames에 추가해도 막지 못함을 실측
  // 확인했다).
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
    ...htmlAllowedAttributes,
    // 뒤 세 속성(TextBlockProps, RD-004 DELTA-02)은 li(bulletListItem/
    // numberedListItem/checkListItem)·summary(toggleListItem)가 공유하는
    // 블록 레벨 색상·정렬 매핑이다 — 위 htmlAllowedAttributes의
    // p/h1~h6/blockquote와 같은 이름 규칙.
    li: [
      "dataGeulBlockId",
      "dataGeulChecked",
      "dataGeulTextColor",
      "dataGeulBackgroundColor",
      "dataGeulTextAlignment",
    ],
    ol: ["start"],
    details: [
      "dataGeulBlockId",
      "dataGeulToggleable",
      "dataGeulCollapsed",
      "open",
    ],
    summary: [
      "dataGeulBlockId",
      "dataGeulTextColor",
      "dataGeulBackgroundColor",
      "dataGeulTextAlignment",
    ],
    // file, 또는 showPreview:false로 강등된 image/video/audio가 bare 시각
    // 태그일 때 data-geul-*를 직접 갖는다(RD-001-DELTA-01 export 계약) — 기존
    // href는 공유 목록(htmlAllowedAttributes.a)에 이미 있어 스프레드로
    // 유지된다.
    a: [...(htmlAllowedAttributes.a ?? []), ...mediaDataAttributeNames],
    img: ["src", "alt", ...mediaDataAttributeNames],
    video: ["src", "controls", ...mediaDataAttributeNames],
    audio: ["src", "controls", ...mediaDataAttributeNames],
    figure: [...mediaDataAttributeNames],
    // div는 이미 children wrapper·목록류 마커를 갖는다(공유 목록) — url
    // 없는 빈 미디어 블록(<div data-geul-block-id data-geul-media-type>)도
    // 같은 태그를 재사용하므로 media 속성만 추가한다(dataGeulBlockId는
    // 이미 있어 제외).
    div: [
      ...(htmlAllowedAttributes.div ?? []),
      ...mediaDataAttributeNames.filter((name) => name !== "dataGeulBlockId"),
    ],
  },
};
