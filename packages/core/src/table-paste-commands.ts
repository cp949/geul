import {
  type ClipboardContent,
  type ClipboardContentBlock,
  type TabularData,
  validateTabularData,
  withParagraphsMergedIntoCells,
} from "@cp949/geul-io";
import {
  type IdFactory,
  type InlineContent,
  type Result,
  validateTableSize,
} from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import type { Node as ProseMirrorNode, ResolvedPos } from "@tiptap/pm/model";
import { isInTable, selectedRect } from "@tiptap/pm/tables";
import { finalizeAndDispatch } from "./dispatch.js";
import { inlineContentViolation } from "./model-to-tiptap.js";
import {
  applyTableGridOperation,
  cellIdAtAnchor,
  setCaretInCell,
  type TableCommandError,
} from "./table-commands.js";
import { pasteInto as pasteGridInto } from "./table-grid.js";
import { buildOutOfTableSequence } from "./table-paste-sequence.js";

// $pos가 표 노드 안에 있는지 — 조상 depth를 거슬러 올라가며 검사한다.
// isInTable은 $head만 보므로 선택의 양 끝을 각각 판정하는 데 쓴다.
const positionInsideTable = (position: ResolvedPos): boolean => {
  for (let depth = position.depth; depth > 0; depth -= 1) {
    if (position.node(depth).type.name === "table") return true;
  }
  return false;
};

// 선택 삭제 후 캐럿(to)이 새 표를 끼울 최상위 위치: 캐럿의 최상위 조상
// 바로 뒤(중첩 삽입 의미 확장은 슬라이스 10(D13) 소관 — 이 슬라이스는 기존
// 최상위 삽입 의미를 그대로 유지한다). resolve 기반 구현: `to`가 이미
// 최상위 경계(depth 0 — 문서 시작·끝, 또는 최상위 형제 사이)면 그 위치
// 자신이다 — 첫 블록 앞 GapCursor(to === 0)가 문서 맨 앞이 되는 것도 이
// 분기다. `to`가 어떤 최상위 블록 안(임의 깊이)에 있으면 그 최상위 조상
// 바로 뒤(`after(1)`)다 — 컨테이너 내부에 중첩된 캐럿이어도 조상 전체를
// 건너뛴다. blockId에 의존하지 않으므로 AllSelection 삭제가 남긴 필러
// 문단(BlockIdExtension은 appendTransaction에서야 id를 부여한다) 뒤에도
// 정상 삽입된다.
const tableInsertPosition = (doc: ProseMirrorNode, to: number): number => {
  const clamped = Math.max(0, Math.min(to, doc.content.size));
  const $to = doc.resolve(clamped);
  return $to.depth === 0 ? $to.pos : $to.after(1);
};

// pasteTabularData/pasteClipboardContent 공용 검증이다 — 둘 다 공개 API라
// 클립보드 파서를 거치지 않은 TabularData도 직접 들어온다. 뮤테이션 전에
// 구조(직사각형 커버리지)와 셀 인라인 텍스트를 모두 검증해야 잘못된
// 데이터가 문서를 깨뜨리지 않는다(G-EDT-001).
// NaN·비정수 columnCount는 `< 1` 비교를 통과해 하류 산술(new Array 등)에서
// RangeError로 터진다 — 크기 가드가 정수성까지 함께 판정한다.
const validateTabularDataForPaste = (
  data: TabularData,
): Result<undefined, TableCommandError> => {
  if (
    !Number.isInteger(data.columnCount) ||
    data.rows.length < 1 ||
    data.columnCount < 1
  ) {
    return { ok: false, error: { code: "INVALID_TABLE_SIZE" } };
  }

  // 위반 종류(TOO_MANY_COLUMNS/TOO_MANY_CELLS) 판정 권위는 model에 있다 —
  // 두 상수가 언젠가 갈라져도 core가 곱셈만으로 재구현해 열-수 상한을
  // 놓치지 않도록 model.validateTableSize에 위임한다.
  if (
    validateTableSize({
      columnCount: data.columnCount,
      rowCount: data.rows.length,
    })
  ) {
    return { ok: false, error: { code: "CELL_LIMIT_EXCEEDED" } };
  }

  const validated = validateTabularData(data);
  if (!validated.ok) {
    return {
      ok: false,
      error: {
        code: "TABULAR_DATA_INVALID",
        message:
          validated.error.code === "CLIPBOARD_TABLE_INVALID"
            ? validated.error.message
            : "Tabular data is not tabular",
      },
    };
  }

  for (const [rowIndex, row] of data.rows.entries()) {
    for (const [cellIndex, cellEntry] of row.cells.entries()) {
      const violation = inlineContentViolation(cellEntry.content);
      if (violation !== null) {
        return {
          ok: false,
          error: {
            code: "TABULAR_DATA_INVALID",
            message: `Cell content at row ${rowIndex}, cell ${cellIndex} ${violation}`,
          },
        };
      }
    }
  }

  return { ok: true, value: undefined };
};

// 표 밖 삽입 조립+마무리: 클립보드 시퀀스(문단+표+문단 등, 표 하나짜리
// 시퀀스도 포함)를 노드로 조립하고 트랜잭션(선택 삭제 판단→삽입 위치
// 계산→노드 삽입→캐럿 이동→dispatch)까지 마무리한다. pasteTabularData(표
// 하나짜리 시퀀스로 감싸 호출)와 pasteClipboardContent(문단이 섞인
// 시퀀스)가 공유한다(4차 아키텍처 리뷰 카드 T) — content 검증은 호출부
// 책임으로 남긴다, buildOutOfTableSequence와 같은 계약이다.
const pasteOutOfTable = (
  editor: Editor,
  content: ClipboardContent,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const state = editor.state;
  const sequence = buildOutOfTableSequence(editor.schema, content, createId);
  if (!sequence.ok) return sequence;
  const { nodes, firstTable } = sequence.value;

  if (firstTable === null) {
    // parseClipboardTable은 표를 하나도 못 찾으면 이 시퀀스를 만들지
    // 않는다 — 여기 도달하는 유일한 길은 파서를 거치지 않고 직접 구성한
    // 순수 문단 ClipboardContent다. 반환할 blockId가 없으므로 거절한다.
    return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
  }

  // 붙여넣기는 선택을 대체한다 — 선택 삭제와 삽입, 캐럿 이동을 한
  // 트랜잭션에 담아 undo 1회로 함께 복원되게 한다. 삭제로 두 문단이
  // 병합되면 병합된 블록(캐럿 위치)이 삽입 기준이 된다.
  //
  // 단, 끝점이 표 안에 있는 범위(표를 부분적으로 걸친 선택)는 지우지
  // 않는다: 그런 범위를 deleteSelection으로 지우면 ReplaceStep이 스키마
  // 필러로 cellId 없는 셀을 만들어 모델과 에디터가 영구 desync된다.
  // 표를 통째로 포함하는 선택은 노드 단위로 깔끔하게 지워지므로 끝점
  // 검사만으로 충분하다.
  let transaction = state.tr;
  if (
    !state.selection.empty &&
    !positionInsideTable(state.selection.$from) &&
    !positionInsideTable(state.selection.$to)
  ) {
    transaction = transaction.deleteSelection();
  }

  const insertPosition = tableInsertPosition(
    transaction.doc,
    transaction.selection.to,
  );
  transaction = transaction.insert(insertPosition, nodes);

  // 표 안 분기의 selectCellId와 대칭 — 시퀀스의 첫 표 좌상단 셀 안으로
  // 캐럿을 옮긴다. firstTable.offset은 그 표 앞에 삽입된 노드들의 누적
  // 크기다(표가 시퀀스 첫 원소면 0 — 표 하나짜리 호출도 이 공식을 그대로
  // 만족한다).
  const firstCellId = cellIdAtAnchor(firstTable.data, { row: 0, column: 0 });
  transaction = setCaretInCell(
    transaction,
    firstTable.node,
    insertPosition + firstTable.offset + 1,
    firstCellId,
  );

  const dispatched = finalizeAndDispatch(editor, transaction);
  if (!dispatched.ok) return dispatched;

  return { ok: true, value: { blockId: firstTable.data.id } };
};

export const pasteTabularData = (
  editor: Editor,
  data: TabularData,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const state = editor.state;

  const validated = validateTabularDataForPaste(data);
  if (!validated.ok) return validated;

  // 표 안이면 selectedRect의 좌상단을 anchor로 삼아 pasteInto로 덮어쓰고,
  // 표 밖이면 현재 최상위 블록 뒤에 pasteInto로 채운 새 표를 끼운다. 두
  // 경로 모두 격자 레벨 연산(TableGrid.pasteInto)을 공유한다.
  if (isInTable(state)) {
    const rect = selectedRect(state);
    const tableBlockId = rect.table.attrs.blockId;
    if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
      return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
    }
    const anchor = { row: rect.top, column: rect.left };

    const result = applyTableGridOperation(
      editor,
      tableBlockId,
      (table) => pasteGridInto(table, anchor, data, createId),
      { selectCellId: (table) => cellIdAtAnchor(table, anchor) },
    );
    return result.ok ? { ok: true, value: { blockId: tableBlockId } } : result;
  }

  // 표 밖 분기는 표 하나짜리 시퀀스로 감싸 pasteOutOfTable에 위임한다 —
  // pasteClipboardContent의 표 밖 분기(문단이 섞인 시퀀스)와 조립·트랜잭션
  // 마무리를 공유한다(4차 아키텍처 리뷰 카드 T).
  return pasteOutOfTable(editor, [{ type: "table", data }], createId);
};

// 클립보드가 준 시퀀스(문단+표+문단 등)를 붙인다. parseClipboardTable이
// 표가 fragment의 유일한 실질 콘텐츠일 때 반환하는 단일 표 시퀀스는
// pasteTabularData에 그대로 위임해 기존 표 안/밖 계약(TBL-012~014)을
// 한 글자도 바꾸지 않는다 — 새 경로는 문단이 섞인 시퀀스에서만 탄다.
export const pasteClipboardContent = (
  editor: Editor,
  content: ClipboardContent,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => {
  const onlyBlock = content.length === 1 ? content[0] : undefined;
  if (onlyBlock?.type === "table") {
    return pasteTabularData(editor, onlyBlock.data, createId);
  }
  if (content.length === 0) {
    return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
  }

  // 뮤테이션 전에 시퀀스 전체를 검증한다(G-EDT-001) — 표 부분은
  // pasteTabularData와 같은 구조·서식·셀 한도 검증, 문단과 제목은 편집 가능
  // 콘텐츠 계약만 적용한다.
  for (const block of content) {
    if (block.type === "paragraph" || block.type === "heading") {
      const violation = inlineContentViolation(block.content);
      if (violation !== null) {
        const blockTypeLabel =
          block.type === "heading" ? "Heading" : "Paragraph";
        return {
          ok: false,
          error: {
            code: "CLIPBOARD_CONTENT_INVALID",
            message: `${blockTypeLabel} content ${violation}`,
          },
        };
      }
      continue;
    }
    const validated = validateTabularDataForPaste(block.data);
    if (!validated.ok) return validated;
  }

  const state = editor.state;

  if (isInTable(state)) {
    // 표 블록이 둘 이상인 경우 다중 표를 명시적으로 거절한다 — 표 안
    // 분기에서는 문단을 별도 블록으로 끼울 수 없으므로 다중 표를 지원할 수
    // 없다. TBL-012(성능 계약)는 표 크기 한도이지 "표 1개" 제품 계약이 아니다.
    const tableCount = content.filter((entry) => entry.type === "table").length;
    if (tableCount > 1) {
      return {
        ok: false,
        error: {
          code: "CLIPBOARD_CONTENT_INVALID",
          message: "Cannot paste multiple tables inside an existing table cell",
        },
      };
    }

    const tableIndex = content.findIndex((entry) => entry.type === "table");
    const tableBlock = content[tableIndex];
    if (tableIndex === -1 || tableBlock?.type !== "table") {
      return { ok: false, error: { code: "PASTE_TARGET_NOT_FOUND" } };
    }

    // 문단과 heading 둘 다 셀에 병합될 자격이 있다(표는 블록 자식을 가질
    // 수 없어 heading의 level도 문단과 동일하게 텍스트만 남긴다, DELTA-04
    // Issue #72) — 이름을 paragraphContent에서 넓혀 그 사실을 반영한다.
    const mergeableInlineContent = (
      blocks: readonly ClipboardContentBlock[],
    ): InlineContent[] =>
      blocks
        .filter(
          (
            entry,
          ): entry is Extract<
            ClipboardContentBlock,
            { type: "paragraph" | "heading" }
          > => entry.type === "paragraph" || entry.type === "heading",
        )
        .map((entry) => [...entry.content]);

    return pasteTabularData(
      editor,
      withParagraphsMergedIntoCells(
        tableBlock.data,
        mergeableInlineContent(content.slice(0, tableIndex)),
        mergeableInlineContent(content.slice(tableIndex + 1)),
      ),
      createId,
    );
  }

  // 표 밖: 조립과 트랜잭션 마무리(선택 삭제 판단→삽입→캐럿 이동→dispatch)는
  // pasteTabularData의 표 밖 분기와 pasteOutOfTable을 공유한다(4차
  // 아키텍처 리뷰 카드 T).
  return pasteOutOfTable(editor, content, createId);
};
