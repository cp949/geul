// 인접한 같은 종류의 인라인 mdast 노드를 하나로 합친다(Issue #395).
//
// 필요한 이유:
// - runNodes는 글자 런마다 mark 노드를 따로 감싼다. 병합은 그 결과에 inlineNodes가 적용한다.
// - 같은 mark를 가진 인접 런은 `delete` 두 개, `inlineCode` 두 개로 나란히 남는다.
// - strike와 code는 라이브러리가 구분자를 문자 참조로 바꿔 주지 않는다.
// - 그대로 직렬화하면 `~~a~~~~b~~`, `` `a``b` ``가 나가 재가져오기에서 구분자가 글자로 샌다.
// - strong·emphasis는 라이브러리가 `__`·`_`로 바꿔 줘서 왕복이 맞다. 같은 규칙으로 합쳐도 출력이 같다.
//
// 병합 대상:
// - strong, emphasis, delete는 자식을 이어 붙인다.
// - link는 url이 같을 때만 자식을 이어 붙인다. url이 다르면 의미가 다르다.
// - inlineCode는 값을 이어 붙인다.
// - 평문 text는 합치지 않는다. 직렬화 결과가 같아 문제를 일으키지 않는다.
//
// 함정:
// - 이어 붙인 뒤에 자식을 다시 합쳐야 한다.
//   `strong[delete a]` + `strong[delete b]`는 자식을 이은 뒤에야 `delete`끼리 만난다.
// - 입력 노드를 변경하지 않는다. inlineNodes의 호출자가 같은 배열을 다시 쓸 수 있다.

type InlineNode<T> = {
  type: string;
  value?: string;
  url?: string;
  children?: T[];
};

const CHILD_MERGE_TYPES: ReadonlySet<string> = new Set([
  "strong",
  "emphasis",
  "delete",
  "link",
]);

/**
 * 두 노드를 한 노드로 합칠 수 있는지 판정한다.
 */
const canMerge = <T extends InlineNode<T>>(left: T, right: T): boolean => {
  if (left.type !== right.type) return false;
  if (left.type === "inlineCode") return true;
  if (!CHILD_MERGE_TYPES.has(left.type)) return false;
  return left.type !== "link" || left.url === right.url;
};

/**
 * 두 노드를 새 노드 하나로 합친다. 입력은 바꾸지 않는다.
 */
const mergeTwo = <T extends InlineNode<T>>(left: T, right: T): T => {
  if (left.type === "inlineCode") {
    return { ...left, value: (left.value ?? "") + (right.value ?? "") };
  }
  return {
    ...left,
    children: [...(left.children ?? []), ...(right.children ?? [])],
  };
};

/**
 * 인접한 같은 종류 노드를 합친 새 배열을 돌려준다. 자식에도 재귀로 적용한다.
 */
export const mergeAdjacentInline = <T extends InlineNode<T>>(
  nodes: readonly T[],
): T[] => {
  const merged: T[] = [];
  for (const node of nodes) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && canMerge(previous, node)) {
      merged[merged.length - 1] = mergeTwo(previous, node);
    } else {
      merged.push(node);
    }
  }
  return merged.map((node) =>
    node.children === undefined
      ? node
      : { ...node, children: mergeAdjacentInline(node.children) },
  );
};
