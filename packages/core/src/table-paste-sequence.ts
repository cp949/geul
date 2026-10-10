import type { ClipboardContent, ClipboardContentBlock } from "@cp949/geul-io";
import {
  type Block,
  type IdFactory,
  type InlineContent,
  isKnownBlockType,
  isTextRunItem,
  type Result,
  type TableBlock,
} from "@cp949/geul-model";
import type { Node as ProseMirrorNode, Schema } from "@tiptap/pm/model";
import { blockToTiptapJson } from "./model-to-tiptap.js";
import { pasteInto as pasteGridInto } from "./table-grid-paste.js";
import { DEFAULT_COLUMN_WIDTH } from "./table-grid.js";
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

// TabularData를 pasteGridInto로 채운 TableBlock을 만든다 — 표 밖 최상위
// 시퀀스(buildSequenceNode)와 블록 children(clipboardBlockToModel) 양쪽이
// 공유하는 조립이다(pasteTabularData의 표 밖 분기와 같은 순서: 골격 생성 후
// anchor (0,0)부터 채운다).
const buildFilledTableBlock = (
  block: Extract<ClipboardContentBlock, { type: "table" }>,
  createId: IdFactory,
): Result<TableBlock, TableCommandError> => {
  const emptyTable = buildPasteTableSkeleton(
    { rows: block.data.rows.length, columns: block.data.columnCount },
    createId,
  );
  return pasteGridInto(emptyTable, { row: 0, column: 0 }, block.data, createId);
};

// 클립보드 시퀀스가 담는 비표 블록이다. model의 비표 블록 전부다.
export type ClipboardNonTableBlock = Exclude<
  ClipboardContentBlock,
  { type: "table" }
>;

// model이 모르는 type의 거절 메시지다. ClipboardContentBlock 타입은 model의
// 14종만 담지만 공개 API라 런타임에는 임의 type 문자열이 들어올 수 있다.
// 검증(validateOutOfTableContent)이 먼저 같은 거절을 하고 조립은 방어선이다.
export const unsupportedBlockMessage = (type: string): string =>
  `Unsupported clipboard block type: ${type}`;

// codeBlock.content가 마크 없는 평문 런이라는 파서 계약을 core가 읽는 방식이다.
// 런의 text를 이어 붙인 소스를 돌려준다. 커스텀 inline 원소가 있으면 null이다.
// 런의 마크는 codeBlock에 실을 수 없어 무시한다(model-to-tiptap의
// inlineContentToTiptapPlain과 같다).
export const clipboardCodeBlockSource = (
  content: InlineContent,
): string | null => {
  let source = "";
  for (const item of content) {
    if (!isTextRunItem(item)) return null;
    source += item.text;
  }
  return source;
};

export const codeBlockContentMessage =
  "CodeBlock content must be plain text runs";

// 클립보드 비표 블록 하나를 children 없는 model 블록으로 바꾼다. 필드는
// 그대로 옮기고 id만 바꾼다. 검증(model 프로브)과 조립이 같은 변환을 써서
// 검증한 모양이 그대로 인코딩된다.
// codeBlock content는 소스 런 하나로 접는다. model의 codeBlock 정규형(런 1개
// 이하, 마크 없음, 빈 런 없음)이다. 여러 런과 런 마크를 받던 기존 계약을
// 지킨다. 커스텀 inline 원소가 든 codeBlock은 호출자가 먼저 거른다.
export const clipboardBlockToShallowModel = (
  block: ClipboardNonTableBlock,
  id: string,
): Block => {
  const shallow: Record<string, unknown> = { ...block, id };
  delete shallow.children;
  if (block.type === "codeBlock") {
    const source = clipboardCodeBlockSource(block.content) ?? "";
    shallow.content = source.length === 0 ? [] : [{ text: source }];
  }
  return shallow as Block;
};

// 클립보드 비표 블록 트리를 model 블록 트리로 바꾼다(Issue #356 RD-005).
// id는 호출자가 준 값이다. children id는 createId로 새로 발급한다. 부모 id를
// 자식보다 먼저 발급한다(문서 순서). 파서의 임시 id를 문서에 넣지 않는다.
// children의 표는 buildFilledTableBlock으로 채운다.
// 검증이 먼저 거른 입력이 오지만 model이 모르는 type과 커스텀 inline 원소가 든
// codeBlock은 다시 거절한다. 인코딩이 예외를 던지는 입력이라서다.
const clipboardBlockToModel = (
  block: ClipboardNonTableBlock,
  id: string,
  createId: IdFactory,
): Result<Block, TableCommandError> => {
  if (!isKnownBlockType(block.type)) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: unsupportedBlockMessage(block.type),
      },
    };
  }
  if (
    block.type === "codeBlock" &&
    clipboardCodeBlockSource(block.content) === null
  ) {
    return {
      ok: false,
      error: {
        code: "CLIPBOARD_CONTENT_INVALID",
        message: codeBlockContentMessage,
      },
    };
  }

  const shallow = clipboardBlockToShallowModel(block, id);
  if (!("children" in block) || (block.children ?? []).length === 0) {
    return { ok: true, value: shallow };
  }

  const children: Block[] = [];
  for (const child of block.children ?? []) {
    const built =
      child.type === "table"
        ? buildFilledTableBlock(child, createId)
        : clipboardBlockToModel(child, createId(), createId);
    if (!built.ok) return built;
    children.push(built.value);
  }
  return { ok: true, value: { ...shallow, children } as Block };
};

// 사후 배정 블록에 잠깐 넣는 자리표시 id다. 인코딩 직후 blockId를 null로
// 바꿔 문서에 남지 않는다.
const POST_ASSIGNED_ID = "clipboard-post-assigned";

// 클립보드 시퀀스의 블록 하나를 노드로 바꾼다.
// - 표: buildFilledTableBlock으로 채운 TableBlock을 인코딩한다. container로
//   감싸지 않는다. pasteTabularData(table-commands.ts)의 표 밖 분기와 같은
//   조립 순서다.
// - 그 밖의 블록: model 블록 트리로 바꿔 model-to-tiptap.ts의
//   blockToTiptapJson으로 인코딩한다. 일반 html 붙여넣기(paste-plan.ts의
//   modelToTiptap)와 같은 인코딩이라 textAlignment, codeBlock wrap·caption 같은
//   필드를 같은 방식으로 싣는다(Issue #356 RD-005).
// 최상위 문단·heading 컨테이너는 blockId를 비워 둔다.
// BlockIdExtension.appendTransaction이 같은 dispatch 안에서 사후 배정한다
// (Issue #315의 blockContainer 감싸기와 함께 정한 관례). 그래서 이 둘은
// createId를 소비하지 않는다. children이 있으면 children id는 발급한다.
// table은 firstTable로 앞서 반환한다. 다른 블록 children 안에 중첩된 표는
// 이 추적 대상이 아니다(최상위 시퀀스의 첫 표만 추적하는 기존 범위).
const buildSequenceNode = (
  schema: Schema,
  block: ClipboardContentBlock,
  createId: IdFactory,
): Result<
  { node: ProseMirrorNode; table: TableBlock | null },
  TableCommandError
> => {
  if (block.type === "table") {
    const filled = buildFilledTableBlock(block, createId);
    if (!filled.ok) return filled;
    return {
      ok: true,
      value: {
        node: tableBlockToTiptapNode(schema, filled.value),
        table: filled.value,
      },
    };
  }

  const postAssigned = block.type === "paragraph" || block.type === "heading";
  const model = clipboardBlockToModel(
    block,
    postAssigned ? POST_ASSIGNED_ID : createId(),
    createId,
  );
  if (!model.ok) return model;
  const json = blockToTiptapJson(model.value);
  const node = schema.nodeFromJSON(
    postAssigned ? { ...json, attrs: { ...json.attrs, blockId: null } } : json,
  );
  return { ok: true, value: { node, table: null } };
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
