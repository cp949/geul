import type { Transaction } from "@tiptap/pm/state";

// 블록 범위 [from, to)를 지운다. 범위가 부모 blockGroup의 내용 전체이면
// 범위만 지워서는 "block+"를 위반하는 빈 그룹이 남는다. PM이 그 자리를 기본
// 노드로 다시 채워 새 blockId가 붙은 유령 블록이 나타나므로, 이 경우
// blockGroup 노드 자체를 지운다.
//
// 호출 규칙:
// - from은 첫 블록의 시작, to는 마지막 블록의 끝이다. 같은 부모의 연속
//   형제여야 한다.
// - 위치는 tr.doc 기준이다. 앞선 step 뒤라면 호출부가 mapping으로 옮긴다.
// - 부모가 blockGroup이 아니면(최상위 doc) 확대하지 않는다. 최상위가 통째로
//   비는 삭제를 막는 일은 호출부 가드가 맡는다.
export const deleteBlockRange = (
  tr: Transaction,
  from: number,
  to: number,
): Transaction => {
  const $from = tr.doc.resolve(from);
  const coversWholeGroup =
    $from.parent.type.name === "blockGroup" &&
    from === $from.start() &&
    to === $from.end();
  return coversWholeGroup
    ? tr.delete($from.before(), $from.after())
    : tr.delete(from, to);
};
