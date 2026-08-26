import type { ClipboardContent, ClipboardContentBlock } from "@cp949/geul-io";
import type { IdFactory, Result, TableBlock } from "@cp949/geul-model";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { inlineContentToTiptap } from "./model-to-tiptap.js";
import {
  DEFAULT_COLUMN_WIDTH,
  pasteInto as pasteGridInto,
} from "./table-grid.js";
import { tableBlockToTiptapNode } from "./table-model-codec.js";
import type { TableCommandError } from "./table-commands.js";

// 표 밖 붙여넣기 전용 골격: 열과 행만 만들고 셀은 만들지 않는다.
// pasteInto가 anchor (0,0)에서 모든 행·열을 덮어쓰므로 여기서 만든 셀은
// 하나도 살아남지 못한다 — buildInitialTable(table-commands.ts)을 쓰면
// 100x100 붙여넣기에서 버려질 셀 10,000개를 만들고 id도 그만큼 더 뽑는다.
// 셀 없는 중간 상태는 pasteInto가 결과를 validateTableGrid로 검증하므로
// 밖으로 새지 않는다.
export const buildPasteTableSkeleton = (
  size: { rows: number; columns: number },
  createId: IdFactory,
): TableBlock => ({
  id: createId(),
  type: "table",
  columns: Array.from({ length: size.columns }, () => ({
    id: createId(),
    width: DEFAULT_COLUMN_WIDTH,
  })),
  rows: Array.from({ length: size.rows }, () => ({
    id: createId(),
    cells: [],
  })),
  headerRows: 0,
  headerColumns: 0,
});

// 클립보드 시퀀스의 블록 하나를 노드로 바꾼다. 문단/heading은 인라인
// 콘텐츠만 옮기고, 표는 buildPasteTableSkeleton+pasteGridInto로 채운
// TableBlock을 인코딩한다 — pasteTabularData(table-commands.ts)의 표 밖
// 분기와 같은 조립 순서다.
const buildSequenceNode = (
  schema: Schema,
  block: ClipboardContentBlock,
  createId: IdFactory,
): Result<
  { node: ProseMirrorNode; table: TableBlock | null },
  TableCommandError
> => {
  if (block.type === "paragraph") {
    // blockId 없이 만든다 — BlockIdExtension.appendTransaction이 같은
    // dispatch 안에서 사후 배정한다(buildOutOfTableSequence 호출자의 필러
    // 문단 처리와 같은 확립된 패턴).
    const node = schema.nodeFromJSON({
      type: "paragraph",
      content: inlineContentToTiptap(block.content),
    });
    return { ok: true, value: { node, table: null } };
  }

  if (block.type === "heading") {
    const node = schema.nodeFromJSON({
      type: "heading",
      attrs: { level: block.level },
      content: inlineContentToTiptap(block.content),
    });
    return { ok: true, value: { node, table: null } };
  }

  const emptyTable = buildPasteTableSkeleton(
    { rows: block.data.rows.length, columns: block.data.columnCount },
    createId,
  );
  const filled = pasteGridInto(
    emptyTable,
    { row: 0, column: 0 },
    block.data,
    createId,
  );
  if (!filled.ok) return filled;

  return {
    ok: true,
    value: {
      node: tableBlockToTiptapNode(schema, filled.value),
      table: filled.value,
    },
  };
};

export type OutOfTableSequence = {
  nodes: ProseMirrorNode[];
  firstTable: {
    data: TableBlock;
    node: ProseMirrorNode;
    offset: number;
  } | null;
};

// 표 밖 붙여넣기 시퀀스 조립: 클립보드가 준 블록(문단+표+문단 등)을 순서대로
// 노드로 바꾸고, 캐럿 이동에 쓸 첫 표의 위치(offset)를 함께 추적한다. 실패
// 가능한 계산(pasteGridInto)을 전부 여기서 끝내고, 트랜잭션 구성·dispatch는
// 호출자(pasteClipboardContent)의 책임으로 남긴다 — 원자성 판단
// (deleteSelection 여부, scrollIntoView)이 편집기 상태에 의존해 이 모듈의
// "블록을 노드로 바꾼다"는 순수 조립 책임과 다른 층위이기 때문이다.
export const buildOutOfTableSequence = (
  schema: Schema,
  content: ClipboardContent,
  createId: IdFactory,
): Result<OutOfTableSequence, TableCommandError> => {
  let firstTable: OutOfTableSequence["firstTable"] = null;
  let runningOffset = 0;
  const nodes: ProseMirrorNode[] = [];

  for (const block of content) {
    const built = buildSequenceNode(schema, block, createId);
    if (!built.ok) return built;
    if (firstTable === null && built.value.table !== null) {
      firstTable = {
        data: built.value.table,
        node: built.value.node,
        offset: runningOffset,
      };
    }
    nodes.push(built.value.node);
    runningOffset += built.value.node.nodeSize;
  }

  return { ok: true, value: { nodes, firstTable } };
};
