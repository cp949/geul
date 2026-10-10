// importHtml 변환기가 공유하는 경고 context다. 변환기가 글자를 실제로 정제하는
// 지점에서 UNSAFE_CODE_POINT_REMOVED를 낸다(RD-001).
// - 수집기(import-warnings.ts)는 raw 트리에서 sanitize 손실만 모은다.
// - 글자를 지우는 쪽은 변환기의 sanitizeInlineText·sanitizeCodeBlockSource다.
//   그래서 변환기가 읽는 자리에서 같은 함수로 판정한다. 예측 로직이 없다.
// - 판정 값은 공백 접기 뒤의 텍스트 노드 값이다.
// - 같은 텍스트 노드는 한 번만 검사한다.
// - 경고 순서는 수집기 경고 다음에 변환기 경고다.
//
// 속성 보존 경고도 변환기가 낸다(RD-001).
// - 변환기가 쓴 속성을 그 노드에 표시한다(preserved.mark).
// - 변환 뒤 sanitized 트리를 한 번 돌며 표시되지 않은 감사 대상 속성만 경고한다
//   (preserved.audit).
// - 표시는 노드 단위다. 한 노드의 표시가 다른 노드의 경고를 지우지 않는다.
// - 표시 키는 노드의 properties 객체다. 세그먼트 분할(block-segmenter.ts)이
//   blockquote·callout·목록 자손을 새 요소로 복제하는데, 복제본은 원본과
//   properties 객체를 공유한다. 복제본에 건 표시가 원본 트리 감사에 보인다.
//   parse·sanitize가 요소마다 새 properties를 만들고 복제는 segmenter만 하므로,
//   서로 다른 원본 노드가 한 객체를 공유하는 경로는 없다.
// - 감사 대상 판정은 isAuditedAttribute(import-html-sanitize-schema.ts)다.
import { sanitizeCodeBlockSource, sanitizeInlineText } from "@cp949/geul-model";

import { isAuditedAttribute } from "./import-html-sanitize-schema.js";
import type { HtmlImportWarning } from "./import-warnings.js";
import type {
  HtmlElementNode,
  HtmlNode,
  HtmlRoot,
  HtmlTextNode,
} from "./inline-content.js";

const CODE_POINT_REMOVED_MESSAGE =
  "Unsafe code point (C0 control, DEL, or unpaired surrogate) was removed from text";

// 최상위 loose 텍스트에는 감싸는 태그가 없으므로 "text"를 element로 쓴다.
const TOP_LEVEL_TEXT_ELEMENT = "text";

export type CodePointReporter = {
  // 인라인 글자로 읽는 텍스트 노드 하나를 검사한다.
  inlineText: (node: HtmlTextNode) => void;
  // 노드 목록 안 텍스트 노드를 모두 인라인 글자로 검사한다(caption).
  inlineTextIn: (nodes: readonly HtmlNode[]) => void;
  // 노드 목록 안 텍스트 노드를 모두 codeBlock 소스로 검사한다(pre).
  codeTextIn: (nodes: readonly HtmlNode[]) => void;
};

export type PreservedAttributes = {
  // 변환기가 node에서 읽어 결과에 반영한 속성을 표시한다. 노드에 없는
  // 속성을 표시해도 무해하다(감사는 노드가 실제로 가진 속성만 본다).
  mark: (node: HtmlElementNode, ...attributes: string[]) => void;
  // 변환 뒤 root를 한 번 돌며 표시되지 않은 감사 대상 속성을 경고한다. 변환기
  // 경고라 수집기 경고와 다른 변환기 경고 뒤에 붙는다.
  audit: (root: HtmlRoot) => void;
};

export type HtmlImportContext = {
  warnings: HtmlImportWarning[];
  codePoints: CodePointReporter;
  preserved: PreservedAttributes;
};

// root는 sanitize와 공백 접기를 마친 트리다. 텍스트 노드의 부모 태그를 이 트리에서
// 읽으므로 sanitize가 벗긴 요소(caption 등)는 부모로 나오지 않는다.
export const createImportContext = (
  root: HtmlRoot,
  warnings: HtmlImportWarning[],
): HtmlImportContext => {
  const parentTags = new WeakMap<HtmlNode, string>();
  const indexParents = (nodes: readonly HtmlNode[], tagName: string): void => {
    for (const node of nodes) {
      parentTags.set(node, tagName);
      if (node.type === "element") indexParents(node.children, node.tagName);
    }
  };
  indexParents(root.children, TOP_LEVEL_TEXT_ELEMENT);

  const checked = new WeakSet<HtmlTextNode>();
  const check = (
    node: HtmlTextNode,
    sanitizeText: (value: string) => string,
  ): void => {
    if (checked.has(node)) return;
    checked.add(node);
    if (sanitizeText(node.value) === node.value) return;
    warnings.push({
      kind: "UNSAFE_CODE_POINT_REMOVED",
      element: parentTags.get(node) ?? TOP_LEVEL_TEXT_ELEMENT,
      message: CODE_POINT_REMOVED_MESSAGE,
    });
  };
  const checkIn = (
    nodes: readonly HtmlNode[],
    sanitizeText: (value: string) => string,
  ): void => {
    for (const node of nodes) {
      if (node.type === "text") check(node, sanitizeText);
      else if (node.type === "element") checkIn(node.children, sanitizeText);
    }
  };

  const preserved = new WeakMap<object, Set<string>>();

  return {
    warnings,
    codePoints: {
      inlineText: (node) => check(node, sanitizeInlineText),
      inlineTextIn: (nodes) => checkIn(nodes, sanitizeInlineText),
      codeTextIn: (nodes) => checkIn(nodes, sanitizeCodeBlockSource),
    },
    preserved: {
      mark: (node, ...attributes) => {
        const marked = preserved.get(node.properties) ?? new Set<string>();
        for (const attribute of attributes) marked.add(attribute);
        preserved.set(node.properties, marked);
      },
      audit: (auditRoot) => {
        const visit = (nodes: readonly HtmlNode[]): void => {
          for (const node of nodes) {
            if (node.type !== "element") continue;
            for (const attribute of Object.keys(node.properties)) {
              if (!isAuditedAttribute(node.tagName, attribute)) continue;
              if (preserved.get(node.properties)?.has(attribute) === true)
                continue;
              warnings.push({
                kind: "UNSAFE_ATTRIBUTE_REMOVED",
                element: node.tagName,
                attribute,
                message: `Unsupported ${attribute} attribute was removed from ${node.tagName}`,
              });
            }
            visit(node.children);
          }
        };
        visit(auditRoot.children);
      },
    },
  };
};
