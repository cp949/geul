// 인접한 평문 mdast `text` 노드를 하나로 합친다(Issue #399).
//
// 필요한 이유:
// - lossy 내보내기는 underline·textColor·backgroundColor 런을 mark 없이 통과시킨다.
// - 그 런의 `text` 노드가 앞뒤 평문 `text` 노드와 나란히 남는다. 예: `\`, `a`, `**(**`.
// - `gfm-text-backslash.ts`의 핸들러는 노드 하나씩 본다. 앞 노드 `\`의 `info.after`는 뒤 노드의 첫 글자 `a`다.
// - `a`는 구분자가 아니라서 보정을 건너뛴다.
// - 그 뒤 라이브러리가 구분자 앞 노드 `a`를 `&#x61;`로 바꾼다. `\&#x61;`가 나가 재가져오기에서 글자가 깨진다.
// - 한 노드 `\a`로 합치면 핸들러가 `\\a`로 보정한다.
//
// 왜 `merge-adjacent-inline.ts`와 분리했는가:
// - #395 계약이 평문 text를 합치지 않는 것이다. `markdown-adjacent-run-merge.test.ts`가 그 계약을 단언한다.
// - 임시 실험에서 그 함수에 text 병합을 넣자 이 테스트 7건이 깨졌다.
//
// 병합 대상:
// - `type === "text"`인 인접 두 노드뿐이다. 값을 이어 붙인다.
// - 자식에도 재귀로 적용한다.
// - `break`·`html`(`<br>`)·`inlineCode` 등 다른 종류가 사이에 끼면 합치지 않는다. 노드가 이어지지 않는다.
//
// 함정:
// - `mergeAdjacentInline` 뒤에 적용한다. `strong[text a]` + `strong[text b]`는
//   자식을 이어 붙인 뒤에야 `text`끼리 만난다. 순서가 반대이면 `strong[text a, text b]`로 남는다.
// - 입력 노드를 변경하지 않는다. inlineNodes의 호출자가 같은 배열을 다시 쓸 수 있다.

type InlineNode<T> = {
  type: string;
  value?: string;
  children?: T[];
};

/**
 * 인접한 평문 `text` 노드를 합친 새 배열을 돌려준다. 자식에도 재귀로 적용한다.
 */
export const mergeAdjacentText = <T extends InlineNode<T>>(
  nodes: readonly T[],
): T[] => {
  const merged: T[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (
      previous !== undefined &&
      previous.type === "text" &&
      node.type === "text"
    ) {
      merged[merged.length - 1] = {
        ...previous,
        value: (previous.value ?? "") + (node.value ?? ""),
      };
    } else {
      merged.push(node);
    }
  }
  return merged.map((node) =>
    node.children === undefined
      ? node
      : { ...node, children: mergeAdjacentText(node.children) },
  );
};
