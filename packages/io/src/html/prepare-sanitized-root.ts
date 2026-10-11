// HTML 문자열을 sanitize된 루트로 준비한다. 문서 import(importHtml)와 클립보드
// 표 파서(parseClipboardTable)가 같은 순서를 쓰도록 한 곳에 모은다. 두 경로의
// 차이는 sanitize schema 하나다. 경고·context·id·표 seam은 호출자가 정한다.
// U+0000은 다루지 않는다. parse5가 지우는 결과 그대로 읽는다. 원문 위반을
// 봐야 하는 호출자(importHtml)가 넘기기 전에 치환한다.
//
// 순서가 의미를 가진다.
// - 깊이-캡 절단(Issue #130)은 sanitize 이전(parseHtmlFragment 내부)에 일어난다.
//   raw 트리와 sanitize 트리가 같은(절단된) 트리를 본다.
// - 공백 접기는 sanitize·링크 정리·벗기기 뒤다. 접기는 sanitize된 트리만 읽고
//   고친다(G-CNV-002). 접힌 트리가 호출자의 표 판정 입력이다.
import { sanitize, type Schema } from "hast-util-sanitize";

import {
  collapseSourceWhitespace,
  hasGeulIdentityAttribute,
} from "./collapse-source-whitespace.js";
import { sanitizeLinks } from "./hast-properties.js";
import {
  type HtmlElementNode,
  type HtmlRoot,
  unwrapBlockBearingColorTags,
} from "./inline-content.js";
import { asRoot, parseHtmlFragment } from "./parse-html.js";

export type SanitizedRoot = {
  // sanitize 이전 트리다. sanitize는 입력을 바꾸지 않으므로 경고 수집기가 읽는다.
  // 결과 문서 생성에는 쓰지 않는다(ADR-0003).
  unsafeRoot: HtmlRoot;
  safeRoot: HtmlRoot;
  // 깊이-캡이 트리를 잘랐는지다. 경고로 바꾸는 일은 호출자 몫이다.
  truncated: boolean;
  // 블록을 품어 벗겨진 font·mark다. 벗기는 순서대로 담는다. 속성 손실 경고는
  // 호출자가 만든다(Issue #356 RD-006).
  unwrappedColorTags: HtmlElementNode[];
};

// 파서가 루트를 만들지 못하면 undefined다. 호출자가 자기 오류로 바꾼다.
export const prepareSanitizedRoot = (
  source: string,
  schema: Schema,
): SanitizedRoot | undefined => {
  const parsed = parseHtmlFragment(source);
  if (parsed === undefined) return undefined;
  const { root: unsafeRoot, truncated } = parsed;

  const safeRoot = asRoot(sanitize(unsafeRoot, schema));
  if (safeRoot === undefined) return undefined;

  // 살려두면 core의 LinkPolicyExtension.filterTransaction이 붙여넣기
  // 트랜잭션을 통째로 버린다.
  sanitizeLinks(safeRoot.children);
  // 블록을 품은 font·mark를 벗기면 sanitize가 남긴 color·style이 사라진다.
  const unwrappedColorTags: HtmlElementNode[] = [];
  unwrapBlockBearingColorTags(safeRoot.children, (node) => {
    unwrappedColorTags.push(node);
  });
  // 외부 HTML의 소스 공백은 브라우저 규칙대로 접는다(Issue #320). 우리
  // export가 낸 조각(data-geul-block-id·data-geul-cell-id)이 하나라도 있으면
  // 접지 않는다 — export는 공백을 그대로 내므로 접으면 왕복이 깨진다. 깊이-캡으로
  // 절단된 입력도 접지 않는다 — 절단 텍스트의 "\n"은 br·블록 경계 구분자라
  // 소스 개행과 구분할 수 없고, 접으면 보이는 text와 block 경계가 사라진다.
  if (!truncated && !hasGeulIdentityAttribute(safeRoot)) {
    collapseSourceWhitespace(safeRoot);
  }
  return { unsafeRoot, safeRoot, truncated, unwrappedColorTags };
};
