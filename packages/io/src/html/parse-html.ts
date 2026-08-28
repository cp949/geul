import { fromParse5 } from "hast-util-from-parse5";
import { parseFragment } from "parse5";
import type { DefaultTreeAdapterMap } from "parse5";

import type { HtmlRoot } from "./inline-content.js";
import { clipboardStrippedTagNames } from "./sanitize-schema.js";

// HTML 트리 깊이 캡(Issue #130). 모델 중첩 축의 MAX_NESTING_DEPTH(64)와는
// 별개의 상수다 — 64를 재사용하면 65~2000단대의 "깊지만 파싱은 안전한"
// 입력이 조기 절단돼 평탄화 산출이 회귀한다. 값 256은 실측 크래시
// 지점(스택 상태에 따라 약 1,800~3,000단)의 약 1/10 마진이다. 캡 이후
// 남는 재귀(fromParse5 변환, sanitize, 경고 수집, block-segmenter walk)는
// 전부 이 상수로 유계가 된다.
export const MAX_HTML_TREE_DEPTH = 256;

type Parse5Fragment = DefaultTreeAdapterMap["documentFragment"];
type Parse5Child = DefaultTreeAdapterMap["childNode"];

export type ParsedHtmlFragment = {
  root: HtmlRoot;
  // 깊이 캡이 서브트리를 절단했는지. 문서 import 경로는 이 사실을
  // DEEP_TREE_FLATTENED 경고로 바꾸고, clipboard 경로는 경고 채널이 없어
  // 무시한다.
  truncated: boolean;
};

// 절단 텍스트 수집에서 통째로 건너뛰는 태그. 두 sanitize 경로 strip 목록의
// 합집합(clipboardStrippedTagNames = 문서 strip + title)을 쓴다 — 절단이
// 없었다면 sanitize가 어느 경로에서든 버렸을 원문(script 소스, style 규칙
// 등)을 절단 텍스트가 보이는 텍스트로 되살리면 안 된다. template 콘텐츠는
// 원래 렌더링되지 않는 inert 조각이라 같은 이유로 걷지 않는다(목록에
// template이 이미 있다).
const flattenSkippedTagNames = new Set(clipboardStrippedTagNames);

// element(template 포함)만 자식을 가진다. Element.nodeName은 string이라
// 리터럴 판별이 안 되므로 childNodes 존재로 좁힌다.
const isParse5Element = (
  node: Parse5Child,
): node is DefaultTreeAdapterMap["element"] => "childNodes" in node;

// 블록 경계로 취급해 앞뒤에 개행 구분자를 넣는 태그. 완전한 CSS display
// 목록이 아니라 "인접 텍스트가 붙으면 의미가 바뀌는" 흔한 블록 컨테이너의
// 실용 집합이다 — 여기 없는 태그(span, strong 등)는 인라인으로 취급돼
// 텍스트가 이어 붙는다. 절단 텍스트는 어차피 단일 텍스트 노드가 되므로
// 구분자 유무만 의미가 있고, 연속 경계가 만드는 중복 개행은 아래 수집기가
// 하나로 접는다.
const flattenBlockBoundaryTagNames = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "caption",
  "dd",
  "details",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

// 블록 경계 요소의 자식들을 모두 처리한 "뒤"에도 경계를 표시해야 하므로
// post-visit 마커를 스택에 함께 쌓는다(명시적 스택 순회 유지 — 재귀면
// 절단 대상(임의 깊이 서브트리)에서 도로 스택이 넘친다).
const blockBoundaryMarker = Symbol("block-boundary");

// 캡 깊이에 도달한 노드의 서브트리에서 보이는 텍스트만 문서 순서대로
// 모은다. br은 inlineContentFromNodes와 같은 계약으로 개행이 되고, 블록
// 경계 태그(flattenBlockBoundaryTagNames)의 앞뒤에는 개행 구분자가 들어가
// 서로 다른 블록의 텍스트가 한 단어처럼 붙지 않는다(G-CNV-002 — 보이는
// text와 block 경계 보존). 구분자는 실제 콘텐츠 사이에서만 실체화된다 —
// 결과가 개행으로 시작·끝나지 않고, 연속 경계·br 인접이 만들 중복 개행은
// 하나로 접는다(br 자신이 연속으로 만든 개행은 콘텐츠라 접지 않는다).
const collectFlattenedText = (node: Parse5Child): string => {
  const parts: string[] = [];
  let pendingBoundary = false;

  const pushContent = (value: string): void => {
    if (value.length === 0) return;
    if (
      pendingBoundary &&
      parts.length > 0 &&
      parts[parts.length - 1]?.endsWith("\n") !== true &&
      !value.startsWith("\n")
    ) {
      parts.push("\n");
    }
    pendingBoundary = false;
    parts.push(value);
  };

  const stack: (Parse5Child | typeof blockBoundaryMarker)[] = [node];
  for (
    let current = stack.pop();
    current !== undefined;
    current = stack.pop()
  ) {
    if (current === blockBoundaryMarker) {
      pendingBoundary = true;
      continue;
    }
    if (!isParse5Element(current)) {
      if (current.nodeName === "#text") pushContent(current.value);
      continue;
    }
    if (flattenSkippedTagNames.has(current.tagName)) continue;
    if (current.tagName === "br") {
      pushContent("\n");
      continue;
    }
    const isBlockBoundary = flattenBlockBoundaryTagNames.has(current.tagName);
    if (isBlockBoundary) {
      pendingBoundary = true;
      stack.push(blockBoundaryMarker);
    }
    for (let index = current.childNodes.length - 1; index >= 0; index -= 1) {
      const child = current.childNodes[index];
      if (child !== undefined) stack.push(child);
    }
  }
  return parts.join("");
};

// parse5 트리를 hast로 변환하기 **전에** 깊이를 캡한다(Issue #130). parse5의
// 트리 구성은 대체로 반복형이지만 뒤이은 fromParse5 변환부터는 재귀라 캡
// 없이 넘기면 약 1,800단대(JIT 상태에 따라 변동)에서 RangeError가 난다 —
// 그래서 캡은 hast가 아니라 parse5 트리에 건다. 캡 깊이에 도달한 자식 있는
// 노드는 서브트리의 보이는 텍스트를 모은 단일 텍스트 노드로 치환한다
// (텍스트가 비면 노드 제거). 치환/제거로 결과 트리 깊이는 항상 캡 이하다.
// 순회도 치환 대상 탐색도 전부 명시적 스택이다. parseFragment 자신이
// 트리를 만들지 못하고 던지는 입력군(아래 parseHtmlFragment의 경계 catch
// 참조)은 이 캡의 보존 대상이 아니다.
const capParse5TreeDepth = (fragment: Parse5Fragment): boolean => {
  let truncated = false;
  const stack: { nodes: Parse5Child[]; depth: number }[] = [
    { nodes: fragment.childNodes, depth: 1 },
  ];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { nodes, depth } = frame;
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      if (node === undefined || !isParse5Element(node)) continue;
      // template 콘텐츠는 childNodes가 아니라 content 조각에 담긴다 —
      // fromParse5가 content로 재귀하므로 여기도 함께 세어야 캡 우회가
      // 없다.
      const childLists: Parse5Child[][] = [];
      if (node.childNodes.length > 0) childLists.push(node.childNodes);
      if ("content" in node && node.content.childNodes.length > 0) {
        childLists.push(node.content.childNodes);
      }
      if (childLists.length === 0) continue;

      if (depth < MAX_HTML_TREE_DEPTH) {
        for (const list of childLists) {
          stack.push({ nodes: list, depth: depth + 1 });
        }
        continue;
      }

      truncated = true;
      const text = collectFlattenedText(node);
      if (text.length === 0) {
        nodes.splice(index, 1);
        index -= 1;
        continue;
      }
      nodes[index] = {
        nodeName: "#text",
        value: text,
        parentNode: node.parentNode,
      };
    }
  }
  return truncated;
};

// 문서 import 경로와 클립보드 경로가 같은 파서 구성을 쓴다. 각자 파서
// 체인을 만들면 설정이 조용히 갈라져 같은 HTML이 두 경로에서 다르게
// 파싱된다. 구성은 rehype-parse(hast-util-from-html)의 fragment 파싱과
// 동일하되(scriptingEnabled: false 포함) 두 가지가 다르다(결정 6, Issue
// #130): 변환 전에 위 깊이-캡을 적용하고, source position은 만들지
// 않는다(HTML 경로에 position 소비자가 없다).
export const parseHtmlFragment = (
  html: string,
): ParsedHtmlFragment | undefined => {
  // 의도된 경계 catch — 캡 "이전"인 파서 라이브러리 내부 재귀는 캡이
  // 원리적으로 못 막는다(실측: parse5 parseFragment의 EOF template 정리,
  // eofInTemplate ↔ onEof 상호 재귀 — 닫히지 않은 중첩 template이 열린
  // 개수만큼 프레임을 쌓아 약 10,000단부터 결정적 RangeError). 파서가
  // 트리를 만들지 못한 입력은 평탄화 보존 대상이 아니라 "파서 실패"다 —
  // undefined를 반환하면 두 소비자(importHtml·parseClipboardTable)가
  // 각자의 구조화된 오류(HTML_PARSE_FAILED / NOT_TABULAR)로 바꾸므로,
  // 이 구간의 최후 방어선이 공유 seam 한 곳에 중앙화된다(G-CNV-001).
  try {
    const fragment = parseFragment(html, { scriptingEnabled: false });
    const truncated = capParse5TreeDepth(fragment);
    const root = asRoot(fromParse5(fragment));
    return root === undefined ? undefined : { root, truncated };
  } catch {
    return undefined;
  }
};

// fromParse5·sanitize() 결과의 타입은 우리 HtmlRoot보다 넓다 — root 노드
// 모양을 확인한 뒤에만 좁힌다.
export const asRoot = (node: unknown): HtmlRoot | undefined => {
  if (
    typeof node !== "object" ||
    node === null ||
    !("type" in node) ||
    node.type !== "root" ||
    !("children" in node) ||
    !Array.isArray(node.children)
  ) {
    return undefined;
  }
  return node as HtmlRoot;
};
