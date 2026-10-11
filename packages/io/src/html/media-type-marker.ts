// `data-geul-media-type` 마커 값 표와 읽기 함수를 소유하는 leaf module이다
// (Issue #369). 변환기(mediaTypeFromNode)와 raw 경고 수집기
// (isOwnMediaAnchorElement)가 같은 표를 읽는다. 표를 따로 두면 한쪽에만 값이
// 생겼을 때 거짓 경고가 난다.
//
// import-warnings.ts를 직접·간접으로 import하지 않는다. import-html-media.ts가
// import-warnings.ts를 import하므로 이 module에서 거슬러 올라가면 순환이다
// (ADR-0011). hast-properties.ts와 타입만 import한다.
import type {
  AudioBlock,
  FileBlock,
  IframeBlock,
  ImageBlock,
  VideoBlock,
} from "@cp949/geul-model";

import { propertyString } from "./hast-properties.js";
import type { HtmlElementNode } from "./inline-content.js";

export const MEDIA_MARKER_TYPES = [
  "file",
  "image",
  "video",
  "audio",
  "iframe",
] as const;

export type MediaMarkerType = (typeof MEDIA_MARKER_TYPES)[number];

type MediaBlockType =
  | FileBlock["type"]
  | ImageBlock["type"]
  | VideoBlock["type"]
  | AudioBlock["type"]
  | IframeBlock["type"];

// 표가 model의 미디어 블록 type과 양방향으로 같음을 컴파일 시점에 강제한다.
// 블록 type이 늘거나 표에서 빠지면 `never`가 되어 아래 할당이 실패한다.
export type MediaMarkerTypesMatchModel = [MediaBlockType] extends [
  MediaMarkerType,
]
  ? [MediaMarkerType] extends [MediaBlockType]
    ? true
    : never
  : never;
const mediaMarkerTypesMatchModel: MediaMarkerTypesMatchModel = true;
void mediaMarkerTypesMatchModel;

const isMediaMarkerType = (raw: string): raw is MediaMarkerType =>
  (MEDIA_MARKER_TYPES as readonly string[]).includes(raw);

// 표에 있는 마커 값이면 그 값을, 아니면 undefined를 돌려준다. 태그 이름은
// 보지 않는다. img·video·audio 태그 이름 우선 규칙은 변환기가 갖는다.
export const mediaMarkerTypeOf = (
  node: HtmlElementNode,
): MediaMarkerType | undefined => {
  const raw = propertyString(node, "dataGeulMediaType");
  return raw !== undefined && isMediaMarkerType(raw) ? raw : undefined;
};
