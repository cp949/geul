// 표 셀 안 `code` 런의 `\|` 판정과 lossy 출력 변환이다(Issue #402).
// 판정과 변환을 이 파일 한 곳이 소유한다. loss-analysis.ts와 export-markdown.ts는
// 각자 판정을 복제하지 않고 여기 함수를 부른다.
//
// 판정 단위:
// - 모델 런이 아니라 내보낼 때 실제로 합쳐진 mdast `inlineCode` 노드다.
// - 인접한 `code` 런은 inline-run-nodes.ts의 inlineNodes가 값을 이어 붙여 노드 하나로 만든다.
// - underline·색은 내보낼 때 mark가 버려져 갈라진 `code` 런도 한 노드로 합쳐진다.
// - 합치는 규칙을 모델 쪽에 복제하지 않는다. inlineNodes의 결과 트리를 본다(G-CNV-001).
//
// 대상 모양:
// - 합쳐진 `inlineCode` 값에서 `|` 바로 앞의 연속 백슬래시가 홀수 개인 경우.
//   micromark 표 파서가 `\\`를 짝으로 읽어 남은 `|`를 열 구분자로 본다. 열이 갈라진다.
//   mdast-util-gfm-table@2.0.0은 코드 안 `|`를 `\|`로 이스케이프해 같은 글자를 만든다.
//
// 대상이 아닌 모양:
// - 짝수 개(0 포함) 백슬래시 뒤 `|`. 합친 값이 짝수여도 같다. 왕복이 같다.
// - `|`가 뒤따르지 않는 백슬래시.
// - `code` 런이 `\`로 끝나고 다음 런이 평문 `|`로 시작하는 경계. 코드 스팬이 닫혀 깨지지 않는다.
// - 감싸는 mark가 달라 합쳐지지 않는 인접 `code` 런. 코드 스팬이 각자 닫힌다.
// - 평문 `\|`. 이미 왕복한다.
// - 표 밖 `code` 런. 호출자가 이 함수를 부르지 않는다. 파이프를 이스케이프하지 않는다.
import { type InlineContent, isTextRunItem } from "@cp949/geul-model";

import { inlineNodes, type MarkdownOutputNode } from "./inline-run-nodes.js";

// `|` 바로 앞의 연속 백슬래시 중 홀수 개인 것이 하나라도 있는지 본다.
// 정규식 `/(\\+)\|/g`는 백슬래시가 긴 값에서 시작 위치마다 런을 다시 훑어 제곱 시간이 든다.
// 한 번 훑는 선형 스캔으로 센다.
const hasOddBackslashBeforePipe = (text: string): boolean => {
  let backslashes = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "\\") {
      backslashes += 1;
      continue;
    }
    if (char === "|" && backslashes % 2 === 1) return true;
    backslashes = 0;
  }
  return false;
};

const isTargetNode = (node: MarkdownOutputNode): boolean =>
  node.type === "inlineCode" && hasOddBackslashBeforePipe(node.value ?? "");

// 싼 사전검사다. `code` 마크가 달린 글자 런에 `|`가 없으면 트리를 만들지 않는다.
const mayHaveCodePipe = (content: InlineContent): boolean =>
  content.some(
    (item) =>
      isTextRunItem(item) &&
      item.text.includes("|") &&
      (item.marks ?? []).some((mark) => mark.type === "code"),
  );

const treeHasTarget = (nodes: readonly MarkdownOutputNode[]): boolean =>
  nodes.some(
    (node) => isTargetNode(node) || treeHasTarget(node.children ?? []),
  );

/**
 * 표 셀 content가 열을 가르는 `inlineCode` 노드로 내보내지는지 돌려준다.
 * 판정은 내보낼 때 합쳐진 노드 트리 기준이다.
 */
export const hasCodeTablePipeLoss = (content: InlineContent): boolean =>
  mayHaveCodePipe(content) && treeHasTarget(inlineNodes(content, true));

/**
 * lossy 출력용으로 노드 트리의 대상 `inlineCode`를 같은 값의 `text` 노드로 바꾼 새 트리를
 * 돌려준다. 입력은 바꾸지 않는다. 바뀐 것이 없으면 입력 배열을 그대로 돌려준다(참조가 같다).
 * 호출자가 인접 `text`를 다시 합쳐야 한다.
 */
export const stripCodeTablePipeNodes = (
  nodes: MarkdownOutputNode[],
): MarkdownOutputNode[] => {
  let changed = false;
  const stripped = nodes.map((node): MarkdownOutputNode => {
    if (isTargetNode(node)) {
      changed = true;
      return { type: "text", value: node.value ?? "" };
    }
    if (node.children === undefined) return node;
    const children = stripCodeTablePipeNodes(node.children);
    if (children === node.children) return node;
    changed = true;
    return { ...node, children };
  });
  return changed ? stripped : nodes;
};
