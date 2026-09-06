import type { TableColumn } from "@cp949/geul-model";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";

// Issue #125 D6·D7 — duplicateBlock이 하위 트리(표라면 column/row/cell id까지)를
// 재귀적으로 복제하며 새 id를 부여한다. node 자신의 새 blockId는 호출부가
// 정한다(루트는 mutation 전 미리 뽑아둔 id, 재귀 호출은 takeId()로 매번 새로
// 뽑는다) — takeId 소비 순서 자체는 계약이 아니고 유일성만 보장하면 된다.
//
// table 분기: column은 attrs.columns(JSON 배열)에 저장되고 row/cell은 실제
// PM 자식 노드다(table-extension.ts) — 셋 다 원본과 겹치지 않는 새 id로
// 바꾸고, cell.columnId는 옛 column id가 아니라 새로 발급한 column id를
// 가리키도록 remap한다(참조 무결성, D7).
//
// blockContainer 분기: childCount<2는 자식이 없다는 뜻(콘텐츠 노드
// 하나뿐, blockGroup 없음) — attrs.blockId만 새로 부여하고 content는 그대로
// clone한다(기존 leaf 복제와 동일 동작, 회귀 없음). childCount>=2면 두 번째
// 자식이 blockGroup이다 — 그 자식들(blockContainer 또는 table) 각각을 이
// 함수로 재귀 호출해 새 id를 부여한다.
//
// divider 같은 leaf 노드(blockContainer도 table도 아님)는 마지막 분기로
// 떨어져 attrs.blockId만 새로 부여한다 — 기존 divider 복제 동작과 동일하다.
export const cloneBlockSubtreeWithFreshIds = (
  node: ProseMirrorNode,
  blockId: string,
  takeId: () => string,
): ProseMirrorNode => {
  if (node.type.name === "table") {
    const oldColumns = (node.attrs.columns ?? []) as TableColumn[];
    const columnIdMap = new Map<string, string>();
    const newColumns = oldColumns.map((column) => {
      const newColumnId = takeId();
      columnIdMap.set(column.id, newColumnId);
      return { ...column, id: newColumnId };
    });
    const newRows: ProseMirrorNode[] = [];
    node.forEach((rowNode) => {
      const newCells: ProseMirrorNode[] = [];
      rowNode.forEach((cellNode) => {
        const oldColumnId =
          typeof cellNode.attrs.columnId === "string"
            ? cellNode.attrs.columnId
            : null;
        const newColumnId =
          oldColumnId === null
            ? cellNode.attrs.columnId
            : (columnIdMap.get(oldColumnId) ?? oldColumnId);
        newCells.push(
          cellNode.type.create(
            { ...cellNode.attrs, cellId: takeId(), columnId: newColumnId },
            cellNode.content,
            cellNode.marks,
          ),
        );
      });
      newRows.push(
        rowNode.type.create(
          { ...rowNode.attrs, rowId: takeId() },
          Fragment.from(newCells),
        ),
      );
    });
    return node.type.create(
      { ...node.attrs, blockId, columns: newColumns },
      Fragment.from(newRows),
    );
  }

  if (node.type.name !== "blockContainer" || node.childCount < 2) {
    return node.type.create(
      { ...node.attrs, blockId },
      node.content,
      node.marks,
    );
  }

  const contentNode = node.child(0);
  const groupNode = node.child(1);
  const newGroupChildren: ProseMirrorNode[] = [];
  groupNode.forEach((child) => {
    newGroupChildren.push(
      cloneBlockSubtreeWithFreshIds(child, takeId(), takeId),
    );
  });
  const newGroup = groupNode.type.create(
    groupNode.attrs,
    Fragment.from(newGroupChildren),
  );
  return node.type.create(
    { ...node.attrs, blockId },
    Fragment.from([contentNode, newGroup]),
    node.marks,
  );
};
