import {
  type Block,
  isListItemBlockType,
  type ListItemBlock,
} from "@cp949/geul-model";

// html/export-html.ts와 markdown/export-markdown.ts의 blockNodes가 각각
// 재구현하던 "연속된 같은 종류 목록 항목 형제를 묶고, 명시적 startNumber를
// 만나면 새 컨테이너를 시작하는" 경계 판정을 여기 하나로 모은다(아키텍처
// 리뷰 6차 후보 L2). 두 소비자는 변수명(items, nextIndex)까지 같은 루프를
// 그대로 복제하고 있었다 — 다른 부분은 묶인 항목으로 <ul>/<ol>을 만드는지
// mdast list를 만드는지뿐이다.
//
// 이 모듈은 "묶기 판정"만 하고 "목록 아닌 블록을 어떻게 그릴지"는 다루지
// 않는다(그릴링 결정: makeListNode만 주입). 비목록 블록은 원본 그대로
// 통과시켜 각 호출자가 자기 blockNode()로 변환하게 한다 — block-segmenter.ts
// 가 "판정만 하고 해석은 호출자 몫으로 남긴다" 선례를 따른다.
export type ListItemRunGroupingResult<T> =
  { kind: "block"; block: Block } | { kind: "list"; node: T };

export const groupListItemRuns = <T>(
  blocks: Block[],
  makeListNode: (items: ListItemBlock[]) => T,
): ListItemRunGroupingResult<T>[] => {
  const results: ListItemRunGroupingResult<T>[] = [];
  for (let index = 0; index < blocks.length;) {
    const first = blocks[index];
    if (first === undefined || !isListItemBlockType(first.type)) {
      if (first !== undefined) results.push({ kind: "block", block: first });
      index += 1;
      continue;
    }

    const items: ListItemBlock[] = [first as ListItemBlock];
    let nextIndex = index + 1;
    while (nextIndex < blocks.length) {
      const next = blocks[nextIndex];
      if (next?.type !== first.type) break;
      if (next.type === "numberedListItem" && next.startNumber !== undefined) {
        break;
      }
      items.push(next);
      nextIndex += 1;
    }
    results.push({ kind: "list", node: makeListNode(items) });
    index = nextIndex;
  }
  return results;
};
