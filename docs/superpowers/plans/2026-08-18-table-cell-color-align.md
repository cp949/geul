# R1 슬라이스 9b: 셀 단위 색상·정렬 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 표 셀 단위 글자색·배경색 적용(`TBL-007` 나머지)과 셀 단위 텍스트 정렬(`TBL-008`)을 model/core/react/io 전 계층에 구현한다.

**Architecture:** `TableCellTarget`(core)에 `{kind:"cells", cellIds}`를 추가해 행/열/셀 3가지 대상을 하나의 색상·정렬 명령 경로로 통일한다. `EditorController.getTableCellSelection()`을 "지금 선택된 기준 셀 id 목록 + 병합/분할 후보 여부"로 재구성해 React가 셀 선택(CellSelection, 트리플클릭 포함)에서만 서식 UI를 띄우고 일반 타이핑 중엔 띄우지 않게 한다. React는 `TableSelectionToolbar`에 새 "서식" 진입점을 달아 `TableCellFormatMenu`(신규)를 연다. 셀 정렬은 model에 `align?: "left"|"center"|"right"` 필드를 추가하는 저장 포맷 확장이라 model→core(코덱·명령·렌더)→io(HTML/GFM+손실)→react 순으로 진행한다.

**Tech Stack:** TypeScript, Zod(model 검증), Tiptap 3 + `@tiptap/pm/tables`(core), React 19 + Tailwind(react), unified/remark-gfm·rehype(io), Vitest, Playwright.

**Spec:** `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md` (5.3, 6.2, 6.3, 7.2, 8.3, 8.4, 11, 12.2절 — 이번 슬라이스에서 이미 갱신·사용자 승인 완료)

## Global Constraints

- 회귀 테스트를 먼저 추가해 RED를 확인한 뒤 최소 구현으로 GREEN을 만든다(AGENTS.md).
- 기존 테스트를 지우거나 약화하지 않는다 — 동작이 바뀌는 곳은 "기존 assertion을 새 정답으로 교체"이지 삭제가 아니다.
- 테스트 제목은 한글, API 식별자·오류 코드·타입명은 원문(영문) 유지.
- 색 검증 권위는 model의 `isCanonicalCellColor`, 정렬 검증 권위는 model의 신규 `isCanonicalCellAlign`이다 — io/core는 이 함수를 재사용하고 독자 정규식을 다시 만들지 않는다(PIT-0002).
- 표 동작·직렬화는 저장 배열이 아니라 열 id·span으로 투영한 논리 격자를 권위로 쓴다(PIT-0004) — 새 코드도 이 원칙을 따른다.
- PM 노드/위치 참조를 클로저 밖으로 내보내지 않는다 — 원시값(문자열 id, 숫자)만 넘긴다(PIT-0008, `pnpm --filter @cp949/geul-core typecheck`를 유닛 테스트와 별도로 반드시 실행할 것 — vitest는 esbuild라 타입 오류를 못 잡는다).
- 키보드로 닫는 UI(Escape)는 jsdom 유닛 테스트만으로 확정하지 않는다 — 새 "닫기" e2e는 `--repeat-each=20 --workers=5`로 반복 실행해 병렬 레이스를 확인한다(PIT-0009).
- `position: fixed` 오버레이는 렌더 직후 `useLayoutEffect`로 실제 크기를 재서 뷰포트 안으로 클램프한다 — jsdom은 모든 rect가 0이라 이 결함을 못 잡으므로 위치 확인은 Playwright로 한다(PIT-0011).
- core의 공개 `.d.ts`에 `@tiptap/*`/`prosemirror-*` 타입을 노출하지 않는다. `pnpm check:boundaries`로 public core declarations 개수를 확인한다(현재 4 — 이번 슬라이스는 새 공개 타입을 추가하지 않으므로 4를 유지할 것으로 예상되지만, 각 core 작업 태스크 끝에서 실제로 실행해 확인한다).
- **core/react 테스트는 `@cp949/geul-model`의 `dist`를 참조한다.** model `src`를 고치면 `pnpm --filter @cp949/geul-model build`를 먼저 돌려야 core/react 테스트에 반영된다.
- commit은 각 태스크 끝에서 로컬 커밋만 한다. merge/push/PR은 이 계획의 범위 밖이다.
- 커밋 메시지는 한글로 작성하고 `Co-Authored-By`/생성 표시 라인을 넣지 않는다(사용자 글로벌 지침).

---

## File Structure

| 파일 | 역할 |
| --- | --- |
| `packages/core/src/table-grid.ts` | `TableCellTarget`에 `cells` kind 추가, `resolveTargetCellIds` 공용 헬퍼, `setCellColor` 리팩터, 신규 `setCellAlign` |
| `packages/core/src/editor-controller.ts` | `TableCellSelection`을 `{tableBlockId, cellIds, mergeable, splitCellId}`로 재구성, `commands.setTableCellAlign` 추가 |
| `packages/core/src/errors.ts` | `EditorError`에 `INVALID_ALIGN` 추가 |
| `packages/core/src/table-commands.ts` | `setTableCellAlign` PM 트랜잭션 래퍼 추가 |
| `packages/core/src/table-model-codec.ts` | PM ↔ model 코덱에 `align` attr 인코드/디코드 추가 |
| `packages/core/src/table-extension.ts` | `TableCellExtension`에 `align` attr(`data-be-align` + 인라인 `text-align` style) 추가 |
| `packages/model/src/types.ts` | `TableBlock` 셀에 `align?: "left"\|"center"\|"right"` 추가 |
| `packages/model/src/cell-align.ts` | 신규 — `isCanonicalCellAlign` (cell-color.ts와 대칭) |
| `packages/model/src/schema.ts` | zod에 `align` optional 추가, `validateColors` 옆에 `validateAlign` 추가 |
| `packages/model/src/index.ts` | `isCanonicalCellAlign` export |
| `packages/react/src/table-selection-toolbar.tsx` | 새 선택 모양 소비, "서식" 진입점 추가 |
| `packages/react/src/table-cell-format-menu.tsx` | 신규 — 셀 색상·정렬 팔레트 메뉴(`TableHandleMenu`와 같은 클램프 패턴, 코드는 독립) |
| `packages/io/src/html/export-html.ts` / `import-html.ts` | 셀 `data-be-align` 매핑 |
| `packages/io/src/markdown/import-markdown.ts` | GFM 열 정렬 → 열의 모든 셀에 매핑(기존 discard+경고 제거) |
| `packages/io/src/markdown/export-markdown.ts` | 열 안 정렬 일치 시 GFM 열 정렬 기록 |
| `packages/io/src/markdown/loss-analysis.ts` | `COLUMN_ALIGN` 손실 kind 추가 |

---

## Task 1: core — `TableCellTarget`에 `cells` kind 추가, `setCellColor`가 셀 id 목록을 대상으로 받는다

**Files:**
- Modify: `packages/core/src/table-grid.ts`
- Test: `packages/core/test/table-grid.test.ts`

**Interfaces:**
- Produces: `TableCellTarget = {kind:"row";index:number} | {kind:"column";index:number} | {kind:"cells";cellIds:readonly string[]}` (기존 union 확장, export 유지). `setCellColor(table, target, property, color)` 시그니처는 그대로, `target.kind === "cells"`를 받아들인다.
- Consumes: 없음(model의 `isCanonicalCellColor`는 이미 사용 중).

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`packages/core/test/table-grid.test.ts`의 `describe("행 또는 열 단위로 셀 색상을 설정한다", ...)` 블록 **다음**(1063번째 줄, `});` 직후)에 새 `describe`를 추가한다:

```ts
describe("셀 id 목록 단위로 색상을 설정한다", () => {
  it("지정한 셀 id 전부에 배경색을 넣는다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: ["a", "d"] },
      "backgroundColor",
      "#AABBCC",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.backgroundColor).toBe("#AABBCC");
    expect(result.value.rows[0]?.cells[1]?.backgroundColor).toBeUndefined();
    expect(result.value.rows[1]?.cells[0]?.backgroundColor).toBeUndefined();
    expect(result.value.rows[1]?.cells[1]?.backgroundColor).toBe("#AABBCC");
  });

  it("존재하지 않는 셀 id는 CELL_NOT_FOUND로 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: ["a", "missing"] },
      "textColor",
      "#112233",
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "CELL_NOT_FOUND", cellId: "missing" },
    });
    expect(t.rows[0]?.cells[0]?.textColor).toBeUndefined();
  });

  it("빈 셀 id 목록은 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: [] },
      "textColor",
      "#112233",
    );

    expect(result).toEqual({ ok: true, value: t });
  });

  it("셀 id로 지정해도 이미 같은 색이면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1", { textColor: "#112233" })]]);

    const result = setCellColor(
      t,
      { kind: "cells", cellIds: ["a"] },
      "textColor",
      "#112233",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-core test -- table-grid.test.ts`
Expected: FAIL — `{kind:"cells", ...}`가 현재 `target.index`(undefined)로 떨어져 `INDEX_OUT_OF_RANGE`를 반환하므로 위 4개 테스트 모두 기대값과 다르게 실패한다.

- [ ] **Step 3: `resolveTargetCellIds`를 추가하고 `setCellColor`가 이를 쓰도록 리팩터한다**

`packages/core/src/table-grid.ts`에서 `export type TableCellTarget = ... ` 정의를 다음으로 바꾼다:

```ts
export type TableCellTarget =
  | { kind: "row"; index: number }
  | { kind: "column"; index: number }
  | { kind: "cells"; cellIds: readonly string[] };
```

바로 아래 `type CellColorProperty = ...`와 `withCellColor` 사이에 헬퍼를 추가한다:

```ts
// 행/열/셀 id 목록 3가지 대상 전부를 "칠할 기준 셀 id 집합"으로 좁힌다.
// 행/열은 논리 격자 투영으로(PIT-0004 — 병합 셀이 대상 행/열을 덮으면
// 함께 포함), 셀 id 목록은 실제 존재하는 id인지만 확인한다.
const resolveTargetCellIds = (
  table: TableBlock,
  target: TableCellTarget,
): Result<Set<string>, TableGridError> => {
  if (target.kind === "cells") {
    const allCellIds = new Set(
      table.rows.flatMap((row) => row.cells.map((cellEntry) => cellEntry.id)),
    );
    const targetCellIds = new Set<string>();
    for (const cellId of target.cellIds) {
      if (!allCellIds.has(cellId)) {
        return { ok: false, error: { code: "CELL_NOT_FOUND", cellId } };
      }
      targetCellIds.add(cellId);
    }
    return { ok: true, value: targetCellIds };
  }

  const limit =
    target.kind === "row" ? table.rows.length : table.columns.length;
  if (
    !Number.isInteger(target.index) ||
    target.index < 0 ||
    target.index >= limit
  ) {
    return indexOutOfRange;
  }

  const projected = projectTableGrid(table);
  if (!projected.ok) return projected;
  const grid = projected.value;

  const targetCellIds = new Set<string>();
  const span = target.kind === "row" ? grid.columnCount : grid.rowCount;
  for (let index = 0; index < span; index += 1) {
    const occupant =
      target.kind === "row"
        ? grid.cellAt(target.index, index)
        : grid.cellAt(index, target.index);
    if (occupant !== undefined) targetCellIds.add(occupant.cellId);
  }
  return { ok: true, value: targetCellIds };
};
```

그다음 기존 `setCellColor` 본문의 대상 계산 부분을 이 헬퍼 호출로 교체한다. 아래는 함수 전체(교체본):

```ts
export const setCellColor = (
  table: TableBlock,
  target: TableCellTarget,
  property: CellColorProperty,
  color: string | null,
): Result<TableBlock, TableGridError> => {
  if (color !== null && !isCanonicalCellColor(color)) {
    return { ok: false, error: { code: "INVALID_COLOR", color } };
  }

  const resolved = resolveTargetCellIds(table, target);
  if (!resolved.ok) return resolved;
  const targetCellIds = resolved.value;

  let changed = false;
  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cellEntry) => {
      if (!targetCellIds.has(cellEntry.id)) return cellEntry;
      if ((cellEntry[property] ?? null) === color) return cellEntry;
      changed = true;
      return withCellColor(cellEntry, property, color);
    }),
  }));

  if (!changed) return { ok: true, value: table };
  return { ok: true, value: { ...table, rows } };
};
```

(기존 함수의 인덱스 범위 검사·격자 투영·대상 계산 부분을 통째로 `resolveTargetCellIds` 호출 한 줄로 대체하는 것 — 나머지 색칠 루프는 그대로다.)

- [ ] **Step 4: 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-core test -- table-grid.test.ts`
Expected: PASS (새 테스트 4개 + 기존 테스트 전부)

Run: `pnpm --filter @cp949/geul-core typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/core/src/table-grid.ts packages/core/test/table-grid.test.ts
git commit -m "feat(core): 표 셀 색상 대상에 명시적 셀 id 목록을 추가한다"
```

---

## Task 2: core — `getTableCellSelection()`을 "선택된 기준 셀 id 목록"으로 재구성한다

**Files:**
- Modify: `packages/core/src/editor-controller.ts`
- Test: `packages/core/test/editor-controller-table.test.ts`

**Interfaces:**
- Produces: `TableCellSelection = {tableBlockId:string; cellIds:string[]; mergeable:boolean; splitCellId:string|null}` (기존 `{kind:"merge"|"split", ...}` union을 대체하는 breaking 타입 변경 — react 소비자는 Task 3에서 함께 고친다).
- Consumes: `@tiptap/pm/tables`의 `CellSelection`/`selectedRect`/`isInTable`(이미 import돼 있음), `@tiptap/pm/state`의 `EditorState`(타입만, 신규 import).

- [ ] **Step 1: 기존 테스트를 새 선택 모양에 맞춰 고치고, 새 동작을 검증하는 테스트를 추가한다**

`packages/core/test/editor-controller-table.test.ts`에서 아래 4곳을 정확히 교체한다(주변 코드는 그대로).

(a) 329번째 줄 근처 — `toEqual` 인자를 바꾼다:

```ts
    it("셀 범위를 드래그 선택하면 getTableCellSelection이 선택된 셀 id 전부를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);

      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds,
        mergeable: true,
        splitCellId: null,
      });
    });
```

(b) 396번째 줄 근처(제목은 그대로, 기대값만 교체):

```ts
    it("병합된 셀에 캐럿을 두면 getTableCellSelection이 splitCellId를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      const cellPos = findCellContentPosition(tiptap, topLeft);
      if (cellPos === null) throw new Error("병합된 셀 fixture 준비 실패");
      tiptap.commands.setTextSelection(cellPos);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        mergeable: false,
        splitCellId: topLeft,
      });
    });
```

(c) 483번째 줄 근처 — 제목과 기대값을 모두 새 동작으로 바꾼다(이전엔 `null`이었지만, 이제는 서식 대상으로 인정한다 — 사용자 승인 결정):

```ts
    it("병합되지 않은 셀 하나만 감싸는 CellSelection도 서식 대상으로 보고한다(병합/분할 후보는 아니다)", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft] = cellIds;
      if (topLeft === undefined) throw new Error("셀 fixture 준비 실패");

      selectSingleCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        mergeable: false,
        splitCellId: null,
      });
    });
```

(d) 494번째 줄 근처(제목은 그대로, 기대값만 교체):

```ts
    it("병합된 셀 하나만 감싸는 CellSelection은 splitCellId를 보고한다", () => {
      const { editor, tableBlockId, cellIds } = editorWithTwoByTwoTable();
      const { tiptap } = mountTiptapEditor(editor);
      const [topLeft, , , bottomRight] = cellIds;
      if (topLeft === undefined || bottomRight === undefined) {
        throw new Error("셀 fixture 준비 실패");
      }
      selectCellRange(tiptap, topLeft, bottomRight);
      editor.commands.mergeTableCells(tableBlockId);

      selectSingleCell(tiptap, topLeft);

      expect(editor.getTableCellSelection()).toEqual({
        tableBlockId,
        cellIds: [topLeft],
        mergeable: false,
        splitCellId: topLeft,
      });
    });
```

(다른 테스트 — `mergeTableCells`/`splitTableCell`/`NOT_RECTANGULAR` 관련 — 는 `getTableCellSelection()`을 쓰지 않으므로 손대지 않는다.)

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-core test -- editor-controller-table.test.ts`
Expected: FAIL — 4개 테스트 모두 현재 `{kind:"merge"|"split", ...}` 모양과 기대값이 달라 실패한다.

- [ ] **Step 3: `getTableCellSelection()`을 재구현한다**

`packages/core/src/editor-controller.ts`에서:

1. `@tiptap/pm/state` import를 `EditorState` 타입을 포함하도록 바꾼다(4번째 줄 근처):

```ts
import { type EditorState, TextSelection } from "@tiptap/pm/state";
```

2. 154~184번째 줄(`TableCellSelection` 타입 선언 위 주석부터 `coversMultipleCells` 함수 끝까지)을 통째로 아래로 교체한다:

```ts
// CellSelection이 덮는 서로 다른 기준 셀들을 primitive 값(cellId)만으로
// 나열한다. mergeable은 기준 셀이 2개 이상일 때, splitCellId는 선택이 이미
// 병합된 셀 하나만 덮을 때 그 cellId다. 삼중클릭이 만드는 병합되지 않은
// 단일 셀 CellSelection은 mergeable=false, splitCellId=null이지만
// cellIds는 채워진다 — 서식(색상·정렬)은 여전히 대상이다(spec 7.2).
export type TableCellSelection = {
  tableBlockId: string;
  cellIds: string[];
  mergeable: boolean;
  splitCellId: string | null;
};

// selectedRect가 덮는 좌표들을 훑어 서로 다른 기준 셀의 id만 순서대로
// 모은다. TableMap.map은 좌표마다 그 좌표를 채우는 셀의 시작 위치를 담으므로,
// 병합 셀은 자신이 덮는 모든 좌표에서 같은 값이 반복된다 — 처음 등장하는
// 오프셋에서만 push한다. PM 노드 참조가 아닌 원시값만 클로저 밖으로 낸다
// (PIT-0008).
const collectCellSelection = (
  state: EditorState,
  rect: ReturnType<typeof selectedRect>,
): { cellIds: string[]; singleMergedCellId: string | null } => {
  const seenOffsets = new Set<number>();
  const cellIds: string[] = [];
  let firstCellMerged = false;
  for (let row = rect.top; row < rect.bottom; row += 1) {
    for (let column = rect.left; column < rect.right; column += 1) {
      const offset = rect.map.map[row * rect.map.width + column];
      if (offset === undefined || seenOffsets.has(offset)) continue;
      seenOffsets.add(offset);
      const cellNode = state.doc.nodeAt(rect.tableStart + offset);
      const cellId = cellNode?.attrs.cellId;
      if (typeof cellId !== "string" || cellId.length === 0) continue;
      cellIds.push(cellId);
      if (cellIds.length === 1) {
        const rowSpan = (cellNode?.attrs.rowspan as number | undefined) ?? 1;
        const colSpan = (cellNode?.attrs.colspan as number | undefined) ?? 1;
        firstCellMerged = rowSpan > 1 || colSpan > 1;
      }
    }
  }
  const singleMergedCellId =
    cellIds.length === 1 && firstCellMerged ? (cellIds[0] ?? null) : null;
  return { cellIds, singleMergedCellId };
};
```

3. `getTableCellSelection()` 메서드 본문(889~926번째 줄 근처, `CellSelection`/`isInTable`/`selectedRect` 사용 지점)을 아래로 교체한다:

```ts
    getTableCellSelection() {
      if (destroyed) return null;
      const state = tiptapEditor.state;
      if (!isInTable(state)) return null;

      const rect = selectedRect(state);
      const tableBlockId = rect.table.attrs.blockId;
      if (typeof tableBlockId !== "string" || tableBlockId.length === 0) {
        return null;
      }

      if (state.selection instanceof CellSelection) {
        const { cellIds, singleMergedCellId } = collectCellSelection(
          state,
          rect,
        );
        if (cellIds.length === 0) return null;
        return {
          tableBlockId,
          cellIds,
          mergeable: cellIds.length > 1,
          splitCellId: singleMergedCellId,
        };
      }

      // 캐럿이 이미 병합된 셀 안에 있으면(선택 없이도) 분할과 서식(색상·
      // 정렬) 컨트롤을 노출한다. 병합되지 않은 셀 안의 캐럿(일반 입력 중)은
      // null — 표에 타이핑하는 내내 툴바가 떠 있지 않게 한다(spec 7.2).
      const cellPosition =
        rect.tableStart +
        (rect.map.map[rect.top * rect.map.width + rect.left] ?? -1);
      const cellNode =
        cellPosition < rect.tableStart ? null : state.doc.nodeAt(cellPosition);
      if (cellNode === null || cellNode === undefined) return null;
      const rowSpan = cellNode.attrs.rowspan as number;
      const colSpan = cellNode.attrs.colspan as number;
      if (rowSpan <= 1 && colSpan <= 1) return null;
      const cellId = cellNode.attrs.cellId;
      if (typeof cellId !== "string" || cellId.length === 0) return null;
      return {
        tableBlockId,
        cellIds: [cellId],
        mergeable: false,
        splitCellId: cellId,
      };
    },
```

- [ ] **Step 4: 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-core test`
Expected: PASS 전체(`editor-controller-table.test.ts` 포함)

Run: `pnpm --filter @cp949/geul-core typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/core/src/editor-controller.ts packages/core/test/editor-controller-table.test.ts
git commit -m "feat(core): getTableCellSelection이 선택된 셀 id 목록을 보고한다"
```

---

## Task 3: react — `TableSelectionToolbar`가 새 선택 모양을 소비하고 셀 색상 메뉴를 연다 (9b-1 UI)

**Files:**
- Modify: `packages/react/src/table-selection-toolbar.tsx`
- Create: `packages/react/src/table-cell-format-menu.tsx`
- Test: `packages/react/test/table-selection-toolbar.test.tsx` (대폭 수정)
- Test: `packages/react/test/table-cell-format-menu.test.tsx` (신규)

**Interfaces:**
- Consumes: `editor.getTableCellSelection(): TableCellSelection|null`(Task 2), `editor.commands.setTableCellTextColor/setTableCellBackgroundColor(tableBlockId, target, color)`(기존, `target`은 이제 `{kind:"cells",cellIds}`도 받는다 — Task 1).
- Produces: `TableCellFormatMenu` 컴포넌트(`packages/react/src/table-cell-format-menu.tsx`, index.ts 미공개 export — `TableHandleMenu`/`TableSelectionToolbar`와 같은 이유).

- [ ] **Step 1: 실패하는 테스트로 새 컴포넌트 계약을 고정한다**

`packages/react/test/table-selection-toolbar.test.tsx`를 전체 교체한다:

```tsx
// @vitest-environment jsdom

import type { EditorController, TableCellSelection } from "@cp949/geul-core";
import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

import { EditorContent, EditorProvider } from "../src/index.js";
import { TableSelectionToolbar } from "../src/table-selection-toolbar.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";
const formatLabel = "Cell formatting";

type FakeControllerOptions = {
  getTableCellSelection?: () => TableCellSelection | null;
  mergeTableCells?: EditorController["commands"]["mergeTableCells"];
  splitTableCell?: EditorController["commands"]["splitTableCell"];
  setTableCellTextColor?: EditorController["commands"]["setTableCellTextColor"];
  setTableCellBackgroundColor?: EditorController["commands"]["setTableCellBackgroundColor"];
};

const fakeController = ({
  getTableCellSelection = () => null,
  mergeTableCells = () => ({ ok: true, value: undefined }),
  splitTableCell = () => ({ ok: true, value: undefined }),
  setTableCellTextColor = () => ({ ok: true, value: undefined }),
  setTableCellBackgroundColor = () => ({ ok: true, value: undefined }),
}: FakeControllerOptions = {}) => ({
  mount: vi.fn((element: HTMLElement) => {
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    const table = document.createElement("table");
    table.setAttribute("data-be-block-id", "table-1");
    const row = document.createElement("tr");
    row.setAttribute("data-be-row-id", "row-1");
    const cell1 = document.createElement("td");
    cell1.setAttribute("data-be-cell-id", "cell-1");
    cell1.setAttribute("data-be-column-id", "col-1");
    const cell2 = document.createElement("td");
    cell2.setAttribute("data-be-cell-id", "cell-2");
    cell2.setAttribute("data-be-column-id", "col-2");
    row.append(cell1, cell2);
    table.append(row);
    editable.append(table);
    element.append(editable);
  }),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(() => null),
  getCaretBlockContext: vi.fn(() => null),
  getSelectionBlockType: vi.fn(() => null),
  getTableCellSelection: vi.fn(getTableCellSelection),
  replaceDocument: vi.fn(),
  commands: {
    setText: vi.fn(),
    insertParagraphAfter: vi.fn(() => ({ ok: true, value: { blockId: "x" } })),
    setBlockType: vi.fn(() => ({ ok: true, value: undefined })),
    moveBlockBefore: vi.fn(() => ({ ok: true, value: undefined })),
    duplicateBlock: vi.fn(() => ({ ok: true, value: { blockId: "x" } })),
    deleteBlock: vi.fn(() => ({ ok: true, value: undefined })),
    toggleBold: vi.fn(() => ({ ok: true, value: undefined })),
    toggleItalic: vi.fn(() => ({ ok: true, value: undefined })),
    toggleUnderline: vi.fn(() => ({ ok: true, value: undefined })),
    toggleStrike: vi.fn(() => ({ ok: true, value: undefined })),
    toggleCode: vi.fn(() => ({ ok: true, value: undefined })),
    setLink: vi.fn(),
    unsetLink: vi.fn(),
    insertTable: vi.fn(() => ({ ok: true, value: { blockId: "table-1" } })),
    insertTableRow: vi.fn(),
    insertTableColumn: vi.fn(),
    moveTableRow: vi.fn(),
    moveTableColumn: vi.fn(),
    resizeTableColumn: vi.fn(),
    mergeTableCells: vi.fn(mergeTableCells),
    splitTableCell: vi.fn(splitTableCell),
    toggleTableHeaderRow: vi.fn(() => ({ ok: true, value: undefined })),
    toggleTableHeaderColumn: vi.fn(() => ({ ok: true, value: undefined })),
    deleteTableRow: vi.fn(() => ({ ok: true, value: undefined })),
    deleteTableColumn: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellTextColor: vi.fn(setTableCellTextColor),
    setTableCellBackgroundColor: vi.fn(setTableCellBackgroundColor),
    setTableCellAlign: vi.fn(() => ({ ok: true, value: undefined })),
    undo: vi.fn(),
    redo: vi.fn(),
  },
});

const stubRect = (
  element: Element,
  rect: { left: number; top: number; width: number; height: number },
) => {
  element.getBoundingClientRect = () =>
    ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    }) as DOMRect;
};

const withProvider = (
  controller: ReturnType<typeof fakeController>,
  children: React.ReactNode,
) => (
  <EditorProvider editor={controller as unknown as EditorController}>
    {children}
  </EditorProvider>
);

const renderTable = (controller: ReturnType<typeof fakeController>) => {
  const view = render(
    withProvider(
      controller,
      <>
        <TableSelectionToolbar />
        <EditorContent />
      </>,
    ),
  );
  const editable = screen.getByRole("textbox", { name: "Editor" });
  const table = editable.querySelector("table");
  const cell1 = editable.querySelector('[data-be-cell-id="cell-1"]');
  const cell2 = editable.querySelector('[data-be-cell-id="cell-2"]');
  if (table === null || cell1 === null || cell2 === null) {
    throw new Error("Table fixture was not rendered");
  }
  stubRect(cell1, { left: 100, top: 100, width: 100, height: 30 });
  stubRect(cell2, { left: 200, top: 100, width: 100, height: 30 });
  return { view, table, cell1, cell2 };
};

const triggerSelectionChange = () => {
  act(() => {
    document.dispatchEvent(new Event("selectionchange"));
  });
};

describe("셀 범위를 선택하면 병합·서식 툴바를 표시한다", () => {
  it("cellIds가 2개 이상(mergeable)이면 Merge cells와 Cell formatting 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1", "cell-2"],
        mergeable: true,
        splitCellId: null,
      }),
    });
    const { view, cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: mergeLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    view.unmount();
  });

  it("Merge cells 클릭 시 mergeTableCells(tableBlockId)를 호출한다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1", "cell-2"],
        mergeable: true,
        splitCellId: null,
      }),
    });
    const { view, cell1, cell2 } = renderTable(controller);
    cell1.classList.add("selectedCell");
    cell2.classList.add("selectedCell");
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: mergeLabel }));

    expect(controller.commands.mergeTableCells).toHaveBeenCalledWith("table-1");
    view.unmount();
  });

  it("selectedCell 데코레이션이 없으면(경계 계산 불가) 아무 툴바도 표시하지 않는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1", "cell-2"],
        mergeable: true,
        splitCellId: null,
      }),
    });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    view.unmount();
  });

  it("표 셀 선택이 없으면 아무 툴바도 표시하지 않는다", () => {
    const controller = fakeController({ getTableCellSelection: () => null });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: formatLabel })).toBeNull();
    view.unmount();
  });

  it("트리플클릭한 병합되지 않은 셀 하나(mergeable=false, splitCellId=null)도 Cell formatting 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: null,
      }),
    });
    const { view, cell1 } = renderTable(controller);
    cell1.classList.add("selectedCell");

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    expect(screen.queryByRole("button", { name: mergeLabel })).toBeNull();
    expect(screen.queryByRole("button", { name: splitLabel })).toBeNull();
    view.unmount();
  });
});

describe("병합된 셀에 캐럿을 두면 분할·서식 툴바를 표시한다", () => {
  it("splitCellId가 있으면 Split cell과 Cell formatting 버튼을 보여준다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);

    triggerSelectionChange();

    expect(screen.getByRole("button", { name: splitLabel })).not.toBeNull();
    expect(screen.getByRole("button", { name: formatLabel })).not.toBeNull();
    view.unmount();
  });

  it("Split cell 클릭 시 splitTableCell(tableBlockId, cellId)를 호출한다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: splitLabel }));

    expect(controller.commands.splitTableCell).toHaveBeenCalledWith(
      "table-1",
      "cell-1",
    );
    view.unmount();
  });
});

describe("Cell formatting 버튼으로 색상 메뉴를 연다", () => {
  it("클릭하면 Text color/Background color 팔레트가 뜬다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();

    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();
    view.unmount();
  });

  it("색상 스와치 클릭 시 setTableCellTextColor(tableBlockId, {kind:\"cells\",cellIds}, color)를 호출하고 메뉴를 닫는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Red" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      "#D93025",
    );
    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    view.unmount();
  });

  it("Escape로 서식 메뉴를 닫는다", () => {
    const controller = fakeController({
      getTableCellSelection: () => ({
        tableBlockId: "table-1",
        cellIds: ["cell-1"],
        mergeable: false,
        splitCellId: "cell-1",
      }),
    });
    const { view } = renderTable(controller);
    triggerSelectionChange();
    fireEvent.click(screen.getByRole("button", { name: formatLabel }));
    expect(
      screen.getByRole("menu", { name: "Cell formatting" }),
    ).not.toBeNull();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    expect(screen.queryByRole("menu", { name: "Cell formatting" })).toBeNull();
    view.unmount();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-react test -- table-selection-toolbar.test.tsx`
Expected: FAIL — `TableSelectionToolbar`가 아직 `kind:"merge"|"split"` 모양을 기대하고, `formatLabel` 버튼도 없다. (`table-cell-format-menu.js` import 대상이 아직 없어도 이 파일은 `table-cell-format-menu`를 직접 import하지 않으므로 컴파일 자체는 된다 — `TableSelectionToolbar`가 내부에서 import한다.)

- [ ] **Step 3: `TableCellFormatMenu`를 만들고 `TableSelectionToolbar`를 재구현한다**

`packages/react/src/table-cell-format-menu.tsx`(신규):

```tsx
import { useLayoutEffect, useRef, useState } from "react";

import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useEditor } from "./use-editor.js";

const menuItemClassName =
  "geul:cursor-pointer geul:rounded geul:border-0 geul:bg-transparent geul:px-2 geul:py-1.5 geul:text-left geul:hover:bg-[var(--be-color-accent-muted,#e8f0fe)] geul:text-[color:var(--be-color-text,#202124)]";
const swatchClassName =
  "geul:h-5 geul:w-5 geul:cursor-pointer geul:rounded geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:p-0";
const sectionLabelClassName =
  "geul:my-1 geul:mx-2 geul:text-[0.75rem] geul:text-[color:var(--be-color-text-muted,#5f6368)]";

const MENU_VIEWPORT_MARGIN = 8;

export type TableCellFormatMenuProps = {
  tableBlockId: string;
  cellIds: string[];
  left: number;
  top: number;
  onClose: () => void;
};

/**
 * TableSelectionToolbar의 "Cell formatting" 버튼으로 여는 메뉴 — 선택된
 * 셀 목록(cellIds)에 글자색·배경색을 적용한다. 좌표 클램프는
 * TableHandleMenu와 같은 이유로 같은 방식을 쓴다(PIT-0011) — 서로 다른
 * 진입점(핸들 vs 셀 선택)이라 로직은 각자 갖는다.
 */
export const TableCellFormatMenu = ({
  tableBlockId,
  cellIds,
  left,
  top,
  onClose,
}: TableCellFormatMenuProps) => {
  const editor = useEditor();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState({ left, top });
  const target = { kind: "cells", cellIds } as const;

  useLayoutEffect(() => {
    const node = menuRef.current;
    const view = node?.ownerDocument.defaultView ?? null;
    if (node === null || view === null) return;
    const rect = node.getBoundingClientRect();
    const maxLeft = Math.max(
      MENU_VIEWPORT_MARGIN,
      view.innerWidth - rect.width - MENU_VIEWPORT_MARGIN,
    );
    const maxTop = Math.max(
      MENU_VIEWPORT_MARGIN,
      view.innerHeight - rect.height - MENU_VIEWPORT_MARGIN,
    );
    setPosition({
      left: Math.min(Math.max(left, MENU_VIEWPORT_MARGIN), maxLeft),
      top: Math.min(Math.max(top, MENU_VIEWPORT_MARGIN), maxTop),
    });
  }, [left, top]);

  const runAndClose = (run: () => void) => {
    run();
    onClose();
  };

  const applyColor = (
    property: "text" | "background",
    color: string | null,
  ) =>
    runAndClose(() => {
      if (property === "text") {
        editor.commands.setTableCellTextColor(tableBlockId, target, color);
        return;
      }
      editor.commands.setTableCellBackgroundColor(tableBlockId, target, color);
    });

  const renderPalette = (
    property: "text" | "background",
    label: string,
    colors: TableCellColor[],
  ) => (
    <>
      <p className={sectionLabelClassName}>{label}</p>
      <div className="geul:flex geul:flex-wrap geul:gap-1 geul:px-2 geul:pb-1">
        {colors.map((color) => (
          <button
            aria-label={`${label} ${color.name}`}
            className={swatchClassName}
            key={color.value}
            onClick={() => applyColor(property, color.value)}
            onMouseDown={(event) => event.preventDefault()}
            role="menuitem"
            style={
              property === "background"
                ? { backgroundColor: color.value }
                : { backgroundColor: "transparent", color: color.value }
            }
            type="button"
          >
            {property === "text" ? "A" : ""}
          </button>
        ))}
        <button
          aria-label={`${label} None`}
          className={swatchClassName}
          onClick={() => applyColor(property, null)}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          ×
        </button>
      </div>
    </>
  );

  return (
    <div
      aria-label="Cell formatting"
      className="geul:fixed geul:z-10 geul:flex geul:max-h-[calc(100vh-1rem)] geul:w-48 geul:flex-col geul:gap-0.5 geul:overflow-y-auto geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
      data-be-cell-format-menu=""
      ref={menuRef}
      role="menu"
      style={{ left: position.left, top: position.top }}
    >
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
    </div>
  );
};
```

`packages/react/src/table-selection-toolbar.tsx` 전체 교체:

```tsx
import { Palette, TableCellsMerge, TableCellsSplit } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { IconButton } from "./icon-button.js";
import { iconProps } from "./icon-props.js";
import { TableCellFormatMenu } from "./table-cell-format-menu.js";
import { useEditor, useEditorMount } from "./use-editor.js";

const mergeLabel = "Merge cells";
const splitLabel = "Split cell";
const formatLabel = "Cell formatting";

const mergeIcon = <TableCellsMerge {...iconProps} />;
const splitIcon = <TableCellsSplit {...iconProps} />;
const formatIcon = <Palette {...iconProps} />;

const buttonClassName =
  "geul:h-7 geul:min-w-7 geul:rounded geul:border-0 geul:bg-transparent geul:px-1.5 geul:py-1 geul:text-[color:var(--be-color-text,#202124)] geul:cursor-pointer";

// 서식 메뉴를 토큰 위치에서 약간 아래로 띄운다 — 정확한 도킹 위치는
// PIT-0011 클램프가 뷰포트 안으로 다시 접어 넣으므로 대략치면 충분하다.
const CELL_FORMAT_MENU_OFFSET = 32;

type ToolbarState = {
  tableBlockId: string;
  cellIds: string[];
  mergeable: boolean;
  splitCellId: string | null;
  left: number;
  top: number;
};

const findTable = (
  element: HTMLElement,
  tableBlockId: string,
): HTMLElement | null =>
  Array.from(
    element.querySelectorAll<HTMLElement>("table[data-be-block-id]"),
  ).find(
    (candidate) => candidate.getAttribute("data-be-block-id") === tableBlockId,
  ) ?? null;

const findCellElement = (
  table: HTMLElement,
  cellId: string,
): HTMLElement | undefined =>
  Array.from(table.querySelectorAll<HTMLElement>("[data-be-cell-id]")).find(
    (candidate) => candidate.getAttribute("data-be-cell-id") === cellId,
  );

// tableEditing 플러그인이 CellSelection에 속한 각 기준 셀 노드에 데코레이션으로
// selectedCell 클래스를 붙인다(@tiptap/pm/tables 저수준 API, spec 6.1). 셀이
// 1개든 여러 개든 이 클래스로 화면 경계를 읽는다 — React는 별도 격자 계산을
// 하지 않는다(spec 6.2). 캐럿이 병합 셀 안에 있을 때(CellSelection이 아닐 때)는
// 이 데코레이션이 없으므로 cellIds[0]의 셀 요소를 직접 찾는다.
const cellSelectionBounds = (
  table: HTMLElement,
  cellIds: string[],
): { left: number; top: number } | null => {
  const decorated = Array.from(
    table.querySelectorAll<HTMLElement>(".selectedCell"),
  );
  if (decorated.length > 0) {
    const rects = decorated.map((cell) => cell.getBoundingClientRect());
    const left = Math.min(...rects.map((rect) => rect.left));
    const right = Math.max(...rects.map((rect) => rect.right));
    const top = Math.min(...rects.map((rect) => rect.top));
    return { left: (left + right) / 2, top };
  }
  const soleCellId = cellIds.length === 1 ? cellIds[0] : undefined;
  if (soleCellId === undefined) return null;
  const cellElement = findCellElement(table, soleCellId);
  if (cellElement === undefined) return null;
  const rect = cellElement.getBoundingClientRect();
  return { left: rect.left + rect.width / 2, top: rect.top };
};

/**
 * 표 안 셀 선택(CellSelection, 트리플클릭한 단일 셀 포함)과 병합 셀 캐럿에
 * 뜨는 툴바. 선택이 서로 다른 기준 셀 2개 이상을 덮으면 병합을, 이미 병합된
 * 셀 하나를 덮으면(또는 그 셀 안에 캐럿이 있으면) 분할을 노출한다. 어느
 * 경우든 Cell formatting 버튼으로 색상·정렬 메뉴를 연다(spec 7.2).
 * SlashMenu가 TableHandles와 함께 자동 마운트한다(공개 export 없음).
 */
export const TableSelectionToolbar = () => {
  const editor = useEditor();
  const { element } = useEditorMount();
  const [toolbarState, setToolbarState] = useState<ToolbarState | null>(null);
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const selectionKeyRef = useRef<string | null>(null);

  useEffect(() => {
    const updateFromSelection = () => {
      const closeAll = () => {
        setToolbarState(null);
        selectionKeyRef.current = null;
        setFormatMenuOpen(false);
      };

      if (element === null) return closeAll();
      const selection = editor.getTableCellSelection();
      if (selection === null) return closeAll();
      const table = findTable(element, selection.tableBlockId);
      if (table === null) return closeAll();
      const bounds = cellSelectionBounds(table, selection.cellIds);
      if (bounds === null) return closeAll();

      const selectionKey = `${selection.tableBlockId} ${selection.cellIds.join(" ")}`;
      if (selectionKeyRef.current !== selectionKey) {
        selectionKeyRef.current = selectionKey;
        setFormatMenuOpen(false);
      }
      setToolbarState({
        tableBlockId: selection.tableBlockId,
        cellIds: selection.cellIds,
        mergeable: selection.mergeable,
        splitCellId: selection.splitCellId,
        left: bounds.left,
        top: bounds.top,
      });
    };

    const ownerDocument = element?.ownerDocument;
    const ownerWindow = ownerDocument?.defaultView;
    ownerDocument?.addEventListener("selectionchange", updateFromSelection);
    ownerDocument?.addEventListener("mouseup", updateFromSelection);
    ownerDocument?.addEventListener("keyup", updateFromSelection);
    ownerWindow?.addEventListener("scroll", updateFromSelection, true);
    ownerWindow?.addEventListener("resize", updateFromSelection);
    updateFromSelection();
    return () => {
      ownerDocument?.removeEventListener(
        "selectionchange",
        updateFromSelection,
      );
      ownerDocument?.removeEventListener("mouseup", updateFromSelection);
      ownerDocument?.removeEventListener("keyup", updateFromSelection);
      ownerWindow?.removeEventListener("scroll", updateFromSelection, true);
      ownerWindow?.removeEventListener("resize", updateFromSelection);
    };
  }, [editor, element]);

  // 서식 메뉴는 바깥 pointerdown과 Escape로 닫는다(PIT-0009: 키보드로
  // 닫는 UI는 병렬 e2e로 검증한다 — table-handles.tsx의 closeMenu와 같은 패턴).
  useEffect(() => {
    if (!formatMenuOpen || element === null) return;
    const ownerDocument = element.ownerDocument;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest("[data-be-cell-format-menu]") !== null ||
        target.closest("[data-be-cell-format-trigger]") !== null
      ) {
        return;
      }
      setFormatMenuOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setFormatMenuOpen(false);
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown);
    ownerDocument.addEventListener("keydown", handleKeyDown);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown);
      ownerDocument.removeEventListener("keydown", handleKeyDown);
    };
  }, [formatMenuOpen, element]);

  if (toolbarState === null) return null;

  return (
    <>
      <div
        aria-label="Table selection"
        className="geul:fixed geul:z-10 geul:flex geul:gap-0.5 geul:rounded-md geul:border geul:border-[color:var(--be-color-border,#dadce0)] geul:bg-[var(--be-color-surface,#fff)] geul:p-1 geul:shadow-[0_1px_4px_rgba(0,0,0,0.15)] geul:[transform:translate(-50%,calc(-100%-0.5rem))]"
        role="toolbar"
        style={{ left: toolbarState.left, top: toolbarState.top }}
      >
        {toolbarState.mergeable && (
          <IconButton
            className={buttonClassName}
            icon={mergeIcon}
            label={mergeLabel}
            onClick={() => {
              editor.commands.mergeTableCells(toolbarState.tableBlockId);
            }}
            onMouseDown={(event) => event.preventDefault()}
          />
        )}
        {toolbarState.splitCellId !== null && (
          <IconButton
            className={buttonClassName}
            icon={splitIcon}
            label={splitLabel}
            onClick={() => {
              const { tableBlockId, splitCellId } = toolbarState;
              if (splitCellId === null) return;
              editor.commands.splitTableCell(tableBlockId, splitCellId);
            }}
            onMouseDown={(event) => event.preventDefault()}
          />
        )}
        <IconButton
          className={buttonClassName}
          data-be-cell-format-trigger=""
          icon={formatIcon}
          label={formatLabel}
          onClick={() => setFormatMenuOpen((open) => !open)}
          onMouseDown={(event) => event.preventDefault()}
        />
      </div>
      {formatMenuOpen && (
        <TableCellFormatMenu
          cellIds={toolbarState.cellIds}
          left={toolbarState.left}
          onClose={() => setFormatMenuOpen(false)}
          tableBlockId={toolbarState.tableBlockId}
          top={toolbarState.top + CELL_FORMAT_MENU_OFFSET}
        />
      )}
    </>
  );
};
```

- [ ] **Step 4: 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-react test -- table-selection-toolbar.test.tsx table-cell-format-menu.test.tsx`
Expected: `table-cell-format-menu.test.tsx`가 아직 없으므로 PASS(0 test)로 보고되거나 무시된다 — 다음 스텝에서 만든다.

- [ ] **Step 5: `TableCellFormatMenu` 자체의 회귀 테스트를 추가한다**

`packages/react/test/table-cell-format-menu.test.tsx`(신규):

```tsx
// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { EditorController } from "@cp949/geul-core";
import { EditorProvider } from "../src/index.js";
import { TableCellFormatMenu } from "../src/table-cell-format-menu.js";

const fakeController = () => ({
  mount: vi.fn(),
  unmount: vi.fn(),
  destroy: vi.fn(),
  getDocument: vi.fn(),
  getSelectionMarks: vi.fn(() => [] as string[]),
  getSelectionLink: vi.fn(() => null),
  getCaretBlockContext: vi.fn(() => null),
  getSelectionBlockType: vi.fn(() => null),
  getTableCellSelection: vi.fn(() => null),
  replaceDocument: vi.fn(),
  commands: {
    setTableCellTextColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellBackgroundColor: vi.fn(() => ({ ok: true, value: undefined })),
  } as unknown as EditorController["commands"],
});

describe("셀 서식 메뉴", () => {
  it("Text color 스와치 클릭 시 대상 셀 id 목록에 색을 적용하고 닫는다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    render(
      <EditorProvider editor={controller as unknown as EditorController}>
        <TableCellFormatMenu
          cellIds={["cell-1", "cell-2"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />
      </EditorProvider>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Text color Blue" }));

    expect(controller.commands.setTableCellTextColor).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1", "cell-2"] },
      "#1A73E8",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Background color None 클릭 시 null로 지운다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    render(
      <EditorProvider editor={controller as unknown as EditorController}>
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />
      </EditorProvider>,
    );

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Background color None" }),
    );

    expect(
      controller.commands.setTableCellBackgroundColor,
    ).toHaveBeenCalledWith("table-1", { kind: "cells", cellIds: ["cell-1"] }, null);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 6: 전체 react 테스트를 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-react test`
Expected: PASS 전체

Run: `pnpm --filter @cp949/geul-react typecheck`
Expected: FAIL(예상) — `editor.commands.setTableCellAlign`이 아직 `EditorController`에 없어 `table-cell-format-menu.tsx`는 이 메서드를 쓰지 않으므로 사실 PASS해야 한다. `TableSelectionToolbar`/`TableCellFormatMenu`는 Task 3 시점엔 색상 명령만 쓰므로 PASS가 정상이다. FAIL이면 어느 코드가 아직 없는 `commands.setTableCellAlign`을 참조하는지 확인한다(있다면 Task 7 이후로 옮긴다).

- [ ] **Step 7: 커밋한다**

```bash
git add packages/react/src/table-selection-toolbar.tsx packages/react/src/table-cell-format-menu.tsx packages/react/test/table-selection-toolbar.test.tsx packages/react/test/table-cell-format-menu.test.tsx
git commit -m "feat(react): 셀 선택 툴바에 서식 메뉴(글자색·배경색)를 추가한다"
```

---

## Task 4: e2e — 셀 색상 적용 (9b-1 완료 확인)

**Files:**
- Modify: `e2e/table-format.spec.ts` (기존 9a e2e가 있는 파일 — 없으면 `e2e/` 디렉터리에서 표 관련 spec 파일명을 먼저 확인하고 그 파일에 추가한다)

**Interfaces:**
- Consumes: 데모 앱의 표 삽입 UI(슬래시 메뉴 "Insert table"), `[data-be-cell-format-menu]`, `[data-be-cell-format-trigger]`, `role=toolbar[aria-label="Table selection"]`.

- [ ] **Step 1: 기존 e2e 표 서식 스펙 파일을 찾아 구조를 확인한다**

Run: `grep -n "test(\|test.describe(" e2e/table-format.spec.ts`

이 목록과 9a 색상 e2e(`배경색 적용·undo`)의 셀렉터·헬퍼 함수(표 삽입, 표 안 텍스트 입력, 드래그 셀 선택 헬퍼가 있는지)를 파악한다. 헬퍼가 없으면 아래 테스트 안에 인라인으로 만든다.

- [ ] **Step 2: 실패하는 e2e를 추가한다**

같은 파일에 추가한다(정확한 셀렉터는 Step 1에서 확인한 기존 패턴을 따른다 — 아래는 최소 골격):

```ts
test("셀 하나를 트리플클릭으로 선택해 배경색을 적용하고 undo로 되돌린다", async ({
  page,
}) => {
  await insertTable(page, { rows: 2, columns: 2 });
  const cell = page.locator("table td").first();
  await cell.click({ clickCount: 3 });

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page
    .getByRole("menuitem", { name: "Background color Yellow" })
    .click();

  await expect(cell).toHaveCSS("background-color", "rgb(254, 247, 224)");

  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(cell).not.toHaveCSS("background-color", "rgb(254, 247, 224)");
});

test("여러 셀을 드래그 선택해 글자색을 함께 적용한다", async ({ page }) => {
  await insertTable(page, { rows: 2, columns: 2 });
  const cells = page.locator("table td");
  const first = cells.nth(0);
  const last = cells.nth(1);

  await first.hover();
  await page.mouse.down();
  await last.hover();
  await page.mouse.up();

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Text color Red" }).click();

  await expect(first).toHaveCSS("color", "rgb(217, 48, 37)");
  await expect(last).toHaveCSS("color", "rgb(217, 48, 37)");
});
```

(`insertTable` 헬퍼가 기존 파일에 없으면 Step 1에서 확인한 기존 "표 삽입" 패턴 — 보통 슬래시 메뉴 트리거 텍스트 입력 후 "Insert table" 클릭 — 을 그대로 함수로 뽑아 쓴다.)

- [ ] **Step 3: 실패를 확인한다**

Run: `pnpm test:e2e --project=chromium -g "트리플클릭|드래그 선택해 글자색"`
Expected: FAIL 또는 타임아웃(UI가 이미 Task 3에서 구현됐다면 이 시점엔 PASS할 수도 있다 — 그렇다면 Step 1~2가 검증용으로 유효하다는 뜻이니 다음 스텝으로 넘어간다. 순수 TDD RED가 필요하면 Task 3 완료 후 이 스텝은 확인 성격이 강하다).

- [ ] **Step 4: 필요하면 헬퍼/셀렉터를 보정하고 통과시킨다**

구현은 이미 Task 3에서 끝났으므로 이 태스크는 주로 e2e 셀렉터 보정이다. 실패 원인이 UI 결함이면 Task 3로 돌아가 고친다(RED를 만든 새 코드 없이 새 결함이면 `superpowers:systematic-debugging`).

Run: `pnpm test:e2e --project=chromium -g "트리플클릭|드래그 선택해 글자색"`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add e2e/table-format.spec.ts
git commit -m "test(e2e): 셀 단위 색상 적용 시나리오를 추가한다"
```

---

## Task 5: model — `TableBlock` 셀에 `align` 필드를 추가한다

**Files:**
- Modify: `packages/model/src/types.ts`, `packages/model/src/schema.ts`, `packages/model/src/index.ts`
- Create: `packages/model/src/cell-align.ts`
- Test: `packages/model/test/cell-align.test.ts` (신규), `packages/model/test/document.test.ts` (추가)

**Interfaces:**
- Produces: `isCanonicalCellAlign(value: string): value is "left"|"center"|"right"` (index.ts에서 export). `TableBlock["rows"][number]["cells"][number]["align"]?: "left"|"center"|"right"`.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`packages/model/test/cell-align.test.ts`(신규, `cell-color.test.ts`와 대칭 구조):

```ts
/**
 * 셀 정렬 값의 정규 형식(isCanonicalCellAlign) 계약.
 */
import { describe, expect, it } from "vitest";

import { isCanonicalCellAlign } from "../src/index.js";

describe("셀 정렬 정규 형식", () => {
  it("left/center/right를 허용한다", () => {
    expect(isCanonicalCellAlign("left")).toBe(true);
    expect(isCanonicalCellAlign("center")).toBe(true);
    expect(isCanonicalCellAlign("right")).toBe(true);
  });

  it("허용 목록 밖 값을 거부한다", () => {
    expect(isCanonicalCellAlign("justify")).toBe(false);
    expect(isCanonicalCellAlign("Left")).toBe(false);
    expect(isCanonicalCellAlign("")).toBe(false);
  });
});
```

`packages/model/test/document.test.ts`의 "표의 잘못된 크기 값과 색상 값을 거부한다" 테스트(513번째 줄 근처) **바로 뒤**에 새 `it`을 추가한다:

```ts
  it("정렬 값이 허용 목록 밖이면 거부한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
      columns: [{ id: "column-1", width: 160 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
              align: "justify",
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    expect(
      parseDocument({ formatVersion: 1, revision: 0, blocks: [table] }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "DOCUMENT_INVALID",
        path: ["blocks", 0, "rows", 0, "cells", 0, "align"],
      },
    });
  });

  it("정렬 값을 지정하지 않은 셀은 그대로 통과한다", () => {
    const table = {
      id: "table-1",
      type: "table" as const,
      columns: [{ id: "column-1", width: 160 }],
      rows: [
        {
          id: "row-1",
          cells: [
            {
              id: "cell-1",
              columnId: "column-1",
              rowSpan: 1,
              columnSpan: 1,
              content: [],
              align: "center" as const,
            },
          ],
        },
      ],
      headerRows: 0 as const,
      headerColumns: 0 as const,
    };

    const result = parseDocument({
      formatVersion: 1,
      revision: 0,
      blocks: [table],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsedTable = result.value.blocks[0];
    if (parsedTable?.type !== "table") throw new Error("Expected a table");
    expect(parsedTable.rows[0]?.cells[0]?.align).toBe("center");
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-model test`
Expected: FAIL — `isCanonicalCellAlign`이 없어 `cell-align.test.ts`는 import 자체가 실패하고, `document.test.ts`의 새 두 테스트는 `align` 필드가 zod 스키마에 없어 `parseDocument`가 `align`을 무시하거나 스키마 통과 여부가 기대와 다르게 나온다.

- [ ] **Step 3: model에 `align`을 추가한다**

`packages/model/src/cell-align.ts`(신규):

```ts
/**
 * 표 셀 텍스트 정렬의 정규 형식. 저장 포맷은 "left"|"center"|"right"만
 * 인정한다(justify 없음). 이 판정의 권위는 model에 있고 io/core는 이
 * 함수를 쓴다(PIT-0002).
 */
const CELL_ALIGN_VALUES = ["left", "center", "right"] as const;

export const isCanonicalCellAlign = (
  value: string,
): value is "left" | "center" | "right" =>
  (CELL_ALIGN_VALUES as readonly string[]).includes(value);
```

`packages/model/src/types.ts`의 `TableBlock`에서 `textColor?: string; backgroundColor?: string;` 다음 줄에 추가:

```ts
      textColor?: string;
      backgroundColor?: string;
      align?: "left" | "center" | "right";
```

`packages/model/src/schema.ts`:

1. import 목록에 추가(3번째 줄 근처):

```ts
import { isCanonicalCellAlign } from "./cell-align.js";
import { isCanonicalCellColor } from "./cell-color.js";
```

2. `tableBlockSchema`의 cells 객체에 필드 추가(57~58번째 줄 근처, `backgroundColor: z.string().optional(),` 다음):

```ts
          textColor: z.string().optional(),
          backgroundColor: z.string().optional(),
          align: z.string().optional(),
```

3. `validateColors` 함수 바로 뒤(410~445번째 줄 근처, 함수 끝의 `};` 다음)에 새 함수를 추가한다:

```ts
const validateAlign = (blocks: Block[]): Result<undefined, DocumentError> => {
  for (const [blockIndex, block] of blocks.entries()) {
    if (block.type !== "table") continue;
    for (const [rowIndex, row] of block.rows.entries()) {
      for (const [cellIndex, cell] of row.cells.entries()) {
        if (cell.align === undefined) continue;
        if (!isCanonicalCellAlign(cell.align)) {
          return invalid(
            [
              "blocks",
              blockIndex,
              "rows",
              rowIndex,
              "cells",
              cellIndex,
              "align",
            ],
            "align must be one of left, center, right",
          );
        }
      }
    }
  }
  return { ok: true, value: undefined };
};
```

4. `parseDocument` 안, `const colors = validateColors(document.blocks);` 다음(537~538번째 줄 근처)에 호출을 추가한다:

```ts
  const colors = validateColors(document.blocks);
  if (!colors.ok) return colors;
  const align = validateAlign(document.blocks);
  if (!align.ok) return align;
```

`packages/model/src/index.ts`에 export를 추가한다(`isCanonicalCellColor` export 바로 아래):

```ts
export { isCanonicalCellColor } from "./cell-color.js";
export { isCanonicalCellAlign } from "./cell-align.js";
```

- [ ] **Step 4: model을 빌드하고 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-model build`
Run: `pnpm --filter @cp949/geul-model test`
Expected: PASS 전체

Run: `pnpm --filter @cp949/geul-model typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/model/src/types.ts packages/model/src/schema.ts packages/model/src/index.ts packages/model/src/cell-align.ts packages/model/test/cell-align.test.ts packages/model/test/document.test.ts
git commit -m "feat(model): 표 셀에 align 필드를 추가한다"
```

---

## Task 6: core — `table-grid.ts`에 `setCellAlign`과 `INVALID_ALIGN`을 추가한다

**Files:**
- Modify: `packages/core/src/table-grid.ts`
- Test: `packages/core/test/table-grid.test.ts`

**Interfaces:**
- Consumes: `isCanonicalCellAlign`(model, Task 5), `resolveTargetCellIds`(Task 1, 같은 파일 내부 헬퍼 재사용).
- Produces: `setCellAlign(table, target, align): Result<TableBlock, TableGridError>`. `TableGridError`에 `{code:"INVALID_ALIGN"; align:string}` 추가.

**주의:** model `dist`가 Task 5 이후 것이어야 한다 — `pnpm --filter @cp949/geul-model build`를 먼저 확인한다(9a에서 이 순서를 놓쳐 `isCanonicalCellColor is not a function`으로 걸린 전례가 있다).

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`packages/core/test/table-grid.test.ts` 상단 import에 `setCellAlign`을 추가한다:

```ts
import {
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
  isRectangular,
  mergeCells,
  moveColumn,
  moveRow,
  projectTableGrid,
  resizeColumn,
  setCellAlign,
  setCellColor,
  splitCell,
  type TableGrid,
  toggleHeaderColumn,
  toggleHeaderRow,
  validateColumnWidth,
} from "../src/table-grid.js";
```

`cell` 헬퍼의 `overrides` 타입에 `align`을 추가한다(24~40번째 줄):

```ts
const cell = (
  id: string,
  columnId: string,
  overrides: Partial<
    Pick<
      Cell,
      | "rowSpan"
      | "columnSpan"
      | "content"
      | "textColor"
      | "backgroundColor"
      | "align"
    >
  > = {},
): Cell => ({
  id,
  columnId,
  rowSpan: 1,
  columnSpan: 1,
  content: [],
  ...overrides,
});
```

`describe("셀을 분할한다", ...)` 블록 **앞**(`describe("셀 id 목록 단위로 색상을 설정한다", ...)`의 닫는 `});` 바로 다음)에 새 `describe`를 추가한다:

```ts
describe("행·열·셀 id 목록 단위로 정렬을 설정한다", () => {
  it("대상 행을 덮는 모든 셀에 정렬을 넣는다", () => {
    const t = table(
      ["c1", "c2"],
      [
        [cell("a", "c1"), cell("b", "c2")],
        [cell("c", "c1"), cell("d", "c2")],
      ],
    );

    const result = setCellAlign(t, { kind: "row", index: 0 }, "center");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells.map((c) => c.align)).toEqual([
      "center",
      "center",
    ]);
    expect(result.value.rows[1]?.cells.map((c) => c.align)).toEqual([
      undefined,
      undefined,
    ]);
  });

  it("셀 id 목록을 대상으로 정렬을 넣는다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1"), cell("b", "c2")]],
    );

    const result = setCellAlign(
      t,
      { kind: "cells", cellIds: ["b"] },
      "right",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.align).toBeUndefined();
    expect(result.value.rows[0]?.cells[1]?.align).toBe("right");
  });

  it("정렬이 null이면 속성을 지운다", () => {
    const t = table(["c1"], [[cell("a", "c1", { align: "left" })]]);

    const result = setCellAlign(t, { kind: "column", index: 0 }, null);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]).not.toHaveProperty("align");
  });

  it("허용 목록 밖 정렬 값은 INVALID_ALIGN으로 거절하고 원본을 바꾸지 않는다", () => {
    const t = table(["c1"], [[cell("a", "c1")]]);

    const result = setCellAlign(
      t,
      { kind: "row", index: 0 },
      "justify" as never,
    );

    expect(result).toEqual({
      ok: false,
      error: { code: "INVALID_ALIGN", align: "justify" },
    });
    expect(t.rows[0]?.cells[0]?.align).toBeUndefined();
  });

  it("이미 같은 정렬이면 입력 표를 참조 그대로 반환한다", () => {
    const t = table(["c1"], [[cell("a", "c1", { align: "center" })]]);

    const result = setCellAlign(t, { kind: "row", index: 0 }, "center");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBe(t);
  });

  it("병합 셀이 대상 행을 덮으면 그 셀도 대상이다", () => {
    const t = table(
      ["c1", "c2"],
      [[cell("a", "c1", { rowSpan: 2 }), cell("b", "c2")], [cell("d", "c2")]],
    );

    const result = setCellAlign(t, { kind: "row", index: 1 }, "right");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.rows[0]?.cells[0]?.align).toBe("right");
    expect(result.value.rows[0]?.cells[1]?.align).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-core test -- table-grid.test.ts`
Expected: FAIL — `setCellAlign`이 없어 import 자체가 실패한다.

- [ ] **Step 3: `setCellAlign`을 구현한다**

`packages/core/src/table-grid.ts` 상단 import에 `isCanonicalCellAlign`을 추가한다:

```ts
import {
  isCanonicalCellColor,
  isCanonicalCellAlign,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  validateTableGrid,
} from "@cp949/geul-model";
```

`TableGridError` union에 `INVALID_ALIGN`을 추가한다(32~41번째 줄 근처):

```ts
export type TableGridError =
  | TableGridValidationError
  | { code: "NOT_RECTANGULAR" }
  | { code: "MERGE_BOUNDARY_CROSSED" }
  | { code: "LAST_ROW" }
  | { code: "LAST_COLUMN" }
  | { code: "COLUMN_WIDTH_OUT_OF_RANGE"; width: number }
  | { code: "INDEX_OUT_OF_RANGE" }
  | { code: "CELL_NOT_FOUND"; cellId: string }
  | { code: "INVALID_COLOR"; color: string }
  | { code: "INVALID_ALIGN"; align: string };
```

`setCellColor` 함수 바로 뒤(파일에서 `validateColumnWidth` 앞)에 추가한다:

```ts
type CellAlign = "left" | "center" | "right";

// align 속성도 색 속성과 같은 optional 저장 규약을 따른다(값이 없으면
// 키 자체를 두지 않는다).
const withCellAlign = (
  cellEntry: TableCell,
  align: CellAlign | null,
): TableCell => ({
  id: cellEntry.id,
  columnId: cellEntry.columnId,
  rowSpan: cellEntry.rowSpan,
  columnSpan: cellEntry.columnSpan,
  content: cellEntry.content,
  ...(cellEntry.textColor === undefined ? {} : { textColor: cellEntry.textColor }),
  ...(cellEntry.backgroundColor === undefined
    ? {}
    : { backgroundColor: cellEntry.backgroundColor }),
  ...(align === null ? {} : { align }),
});

export const setCellAlign = (
  table: TableBlock,
  target: TableCellTarget,
  align: CellAlign | null,
): Result<TableBlock, TableGridError> => {
  if (align !== null && !isCanonicalCellAlign(align)) {
    return { ok: false, error: { code: "INVALID_ALIGN", align } };
  }

  const resolved = resolveTargetCellIds(table, target);
  if (!resolved.ok) return resolved;
  const targetCellIds = resolved.value;

  let changed = false;
  const rows = table.rows.map((row) => ({
    ...row,
    cells: row.cells.map((cellEntry) => {
      if (!targetCellIds.has(cellEntry.id)) return cellEntry;
      if ((cellEntry.align ?? null) === align) return cellEntry;
      changed = true;
      return withCellAlign(cellEntry, align);
    }),
  }));

  if (!changed) return { ok: true, value: table };
  return { ok: true, value: { ...table, rows } };
};
```

- [ ] **Step 4: model 빌드와 core 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-model build` (Task 5 이후 반영 확인)
Run: `pnpm --filter @cp949/geul-core test -- table-grid.test.ts`
Expected: PASS

Run: `pnpm --filter @cp949/geul-core typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/core/src/table-grid.ts packages/core/test/table-grid.test.ts
git commit -m "feat(core): TableGrid에 setCellAlign 명령을 추가한다"
```

---

## Task 7: core — PM 코덱·렌더·EditorController에 정렬을 배선한다

**Files:**
- Modify: `packages/core/src/table-model-codec.ts`, `packages/core/src/table-extension.ts`, `packages/core/src/table-commands.ts`, `packages/core/src/editor-controller.ts`, `packages/core/src/errors.ts`
- Test: `packages/core/test/table-model-codec.test.ts`, `packages/core/test/table-extension.test.ts`, `packages/core/test/editor-controller-table-format.test.ts`

**Interfaces:**
- Produces: `EditorController.commands.setTableCellAlign(tableBlockId, target, align): Result<void, EditorError>`. `EditorError`에 `{code:"INVALID_ALIGN"; align:string}` 추가.
- Consumes: `setCellAlign`(Task 6).

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`packages/core/test/table-model-codec.test.ts`에서 기존 `textColor`/`backgroundColor` round-trip 테스트를 찾아(`grep -n "textColor" packages/core/test/table-model-codec.test.ts`) 같은 스타일로 새 `it`을 추가한다:

```ts
it("셀 align이 PM 노드 attrs를 거쳐 그대로 왕복한다", () => {
  const table: TableBlock = {
    id: "table-1",
    type: "table",
    columns: [{ id: "column-1", width: 160 }],
    rows: [
      {
        id: "row-1",
        cells: [
          {
            id: "cell-1",
            columnId: "column-1",
            rowSpan: 1,
            columnSpan: 1,
            content: [],
            align: "center",
          },
        ],
      },
    ],
    headerRows: 0,
    headerColumns: 0,
  };

  const node = tableBlockToTiptapNode(schema, table);
  const decoded = tiptapNodeToTableBlock(node);

  expect(decoded).toEqual({ ok: true, value: table });
});
```

(`schema`를 만드는 방식은 파일 상단의 기존 fixture — 보통 `createTableFixtureEditor` 또는 직접 만든 `Schema` 인스턴스 — 를 그대로 재사용한다. `TableBlock` import가 이미 있는지 확인한다.)

`packages/core/test/table-extension.test.ts`에서 색상 렌더 테스트 옆에(`grep -n "renderHTML\|style" packages/core/test/table-extension.test.ts`) 추가:

```ts
it("align attr을 data-be-align과 인라인 text-align style로 렌더한다", () => {
  const cellType = schema.nodes.tableCell;
  if (cellType === undefined) throw new Error("tableCell node missing");
  const node = cellType.create({ cellId: "cell-1", align: "right" });

  const dom = DOMSerializer.fromSchema(schema).serializeNode(node) as HTMLElement;

  expect(dom.getAttribute("data-be-align")).toBe("right");
  expect(dom.style.textAlign).toBe("right");
});
```

(기존 파일이 `DOMSerializer`/`schema`를 이미 구성해 쓰고 있다면 그 fixture를 재사용한다 — 파일 상단 import를 확인한다.)

`packages/core/test/editor-controller-table-format.test.ts`의 `describe("표 행/열 단위 셀 색상", ...)` 블록 뒤(153번째 줄, `});` 다음)에 새 블록을 추가한다:

```ts
describe("표 셀 정렬", () => {
  it("setTableCellAlign이 대상 행의 셀에 정렬을 저장하고 null로 지운다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const target = { kind: "row", index: 0 } as const;

    editor.commands.setTableCellAlign(tableBlockId, target, "center");
    expect(tableOf(editor).rows[0]?.cells[0]?.align).toBe("center");

    expect(
      editor.commands.setTableCellAlign(tableBlockId, target, null),
    ).toEqual({ ok: true, value: undefined });
    expect(tableOf(editor).rows[0]?.cells[0]).not.toHaveProperty("align");
  });

  it("정렬 적용은 undo 1회로 복원된다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    editor.commands.setTableCellAlign(
      tableBlockId,
      { kind: "row", index: 1 },
      "right",
    );

    expect(editor.commands.undo()).toEqual({ ok: true, value: undefined });
    expect(editor.getDocument().blocks).toEqual(before.blocks);
  });

  it("허용 목록 밖 정렬 값은 INVALID_ALIGN을 반환하고 문서를 바꾸지 않는다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    mountTiptapEditor(editor);
    const before = editor.getDocument();

    expect(
      editor.commands.setTableCellAlign(
        tableBlockId,
        { kind: "row", index: 0 },
        "justify" as never,
      ),
    ).toEqual({
      ok: false,
      error: { code: "INVALID_ALIGN", align: "justify" },
    });
    expect(editor.getDocument()).toEqual(before);
  });
});

describe("표 셀 정렬 렌더링", () => {
  it("셀 정렬을 인라인 text-align 스타일로 렌더한다", () => {
    const { editor, tableBlockId } = editorWithTable(2, 2);
    const { editable } = mountTiptapEditor(editor);

    editor.commands.setTableCellAlign(
      tableBlockId,
      { kind: "row", index: 0 },
      "center",
    );

    const cell = editable.querySelector<HTMLElement>("table td");
    expect(cell?.style.textAlign).toBe("center");
    editor.destroy();
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-core test -- table-model-codec.test.ts table-extension.test.ts editor-controller-table-format.test.ts`
Expected: FAIL — `align`이 코덱/렌더/컨트롤러 어디에도 배선되지 않아 왕복 시 사라지고, `setTableCellAlign`은 아직 없는 메서드다.

- [ ] **Step 3: 코덱·렌더·명령·컨트롤러를 구현한다**

`packages/core/src/table-model-codec.ts`:

1. `tableBlockToTiptapNode`의 셀 생성부(50~61번째 줄 근처)에 `align` attr을 추가한다:

```ts
      return tableCellType.create(
        {
          cellId: cellEntry.id,
          columnId: cellEntry.columnId,
          colspan: cellEntry.columnSpan,
          rowspan: cellEntry.rowSpan,
          colwidth: null,
          textColor: cellEntry.textColor ?? null,
          backgroundColor: cellEntry.backgroundColor ?? null,
          align: cellEntry.align ?? null,
        },
        content,
      );
```

2. `tiptapNodeToTableBlock`의 셀 디코드부(142~154번째 줄 근처)에 추가한다:

```ts
      cells.push({
        id: cellNode.attrs.cellId as string,
        columnId: cellNode.attrs.columnId as string,
        rowSpan: cellNode.attrs.rowspan as number,
        columnSpan: cellNode.attrs.colspan as number,
        content: inlineContentFromNode(cellNode),
        ...(typeof cellNode.attrs.textColor === "string"
          ? { textColor: cellNode.attrs.textColor as string }
          : {}),
        ...(typeof cellNode.attrs.backgroundColor === "string"
          ? { backgroundColor: cellNode.attrs.backgroundColor as string }
          : {}),
        ...(typeof cellNode.attrs.align === "string"
          ? { align: cellNode.attrs.align as "left" | "center" | "right" }
          : {}),
      });
```

`packages/core/src/table-extension.ts`의 `TableCellExtension.addAttributes()`에서 `backgroundColor` 정의 다음(271번째 줄 근처)에 추가한다:

```ts
      backgroundColor: {
        default: null,
        parseHTML: (element) =>
          element.getAttribute("data-be-background-color"),
        renderHTML: (attributes) =>
          typeof attributes.backgroundColor === "string"
            ? { "data-be-background-color": attributes.backgroundColor }
            : {},
      },
      align: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-be-align"),
        renderHTML: (attributes) =>
          typeof attributes.align === "string"
            ? { "data-be-align": attributes.align }
            : {},
      },
```

같은 확장의 `renderHTML({ HTMLAttributes, node })`(275~295번째 줄 근처)를 교체해 `text-align`도 인라인 스타일에 추가한다:

```ts
  renderHTML({ HTMLAttributes, node }) {
    // 색상·정렬은 data-be-* 속성이 저장 계약이고, 화면에는 인라인 스타일로
    // 그린다 — 색은 임의 hex라 CSS 클래스로 표현할 수 없고, 정렬은 색상과
    // 같은 렌더 경로를 공유한다.
    const declarations = [
      typeof node.attrs.textColor === "string"
        ? `color: ${node.attrs.textColor}`
        : null,
      typeof node.attrs.backgroundColor === "string"
        ? `background-color: ${node.attrs.backgroundColor}`
        : null,
      typeof node.attrs.align === "string"
        ? `text-align: ${node.attrs.align}`
        : null,
    ].filter((declaration) => declaration !== null);

    return [
      "td",
      mergeAttributes(
        HTMLAttributes,
        declarations.length === 0 ? {} : { style: declarations.join("; ") },
      ),
      0,
    ];
  },
```

`packages/core/src/table-commands.ts`:

`setTableCellColor` 함수 바로 뒤에 추가한다:

```ts
export const setTableCellAlign = (
  editor: Editor,
  tableBlockId: string,
  target: TableCellTarget,
  align: "left" | "center" | "right" | null,
): Result<void, TableCommandError> =>
  applyTableGridOperation(editor, tableBlockId, (table) =>
    setGridCellAlign(table, target, align),
  );
```

같은 파일 상단 import에 `setCellAlign as setGridCellAlign`을 추가한다:

```ts
import {
  DEFAULT_COLUMN_WIDTH,
  deleteColumn as deleteGridColumn,
  deleteRow as deleteGridRow,
  insertColumn as insertGridColumn,
  insertRow as insertGridRow,
  mergeCells as mergeGridCells,
  moveColumn as moveGridColumn,
  moveRow as moveGridRow,
  projectTableGrid,
  resizeColumn as resizeGridColumn,
  setCellAlign as setGridCellAlign,
  setCellColor as setGridCellColor,
  splitCell as splitGridCell,
  type TableCellTarget,
  type TableGridError,
  toggleHeaderColumn as toggleGridHeaderColumn,
  toggleHeaderRow as toggleGridHeaderRow,
} from "./table-grid.js";
```

`packages/core/src/errors.ts`의 `EditorError` union 끝에 추가한다:

```ts
export type EditorError =
  | { code: "DOCUMENT_INVALID"; message: string }
  | { code: "EDITOR_FEATURE_UNAVAILABLE"; feature: "table" }
  | { code: "BLOCK_NOT_FOUND"; blockId: string }
  | { code: "COMMAND_NOT_APPLICABLE"; command: string }
  | { code: "LINK_HREF_REJECTED"; href: string }
  | { code: "TABLE_NOT_FOUND"; blockId: string }
  | { code: "TABLE_NODE_INVALID"; message: string }
  | { code: "INVALID_TABLE_SIZE" }
  | { code: "INDEX_OUT_OF_RANGE" }
  | { code: "MERGE_BOUNDARY_CROSSED" }
  | { code: "COLUMN_WIDTH_OUT_OF_RANGE"; width: number }
  | { code: "NOT_RECTANGULAR" }
  | { code: "CELL_NOT_FOUND"; cellId: string }
  | { code: "LAST_ROW" }
  | { code: "LAST_COLUMN" }
  | { code: "INVALID_COLOR"; color: string }
  | { code: "INVALID_ALIGN"; align: string };
```

`packages/core/src/editor-controller.ts`:

1. import에 `setTableCellAlign as setTableCellAlignCommand`를 추가한다(21~36번째 줄 근처 `table-commands.js` import 블록):

```ts
import {
  deleteTableColumn as deleteTableColumnCommand,
  deleteTableRow as deleteTableRowCommand,
  insertTableColumn as insertTableColumnCommand,
  insertTable as insertTableCommand,
  insertTableRow as insertTableRowCommand,
  mergeTableCells as mergeTableCellsCommand,
  moveTableColumn as moveTableColumnCommand,
  moveTableRow as moveTableRowCommand,
  resizeTableColumn as resizeTableColumnCommand,
  setTableCellAlign as setTableCellAlignCommand,
  setTableCellColor as setTableCellColorCommand,
  splitTableCell as splitTableCellCommand,
  type TableCommandError,
  toggleTableHeaderColumn as toggleTableHeaderColumnCommand,
  toggleTableHeaderRow as toggleTableHeaderRowCommand,
} from "./table-commands.js";
```

2. `EditorController["commands"]` 인터페이스에 메서드 선언을 추가한다(`setTableCellBackgroundColor` 다음, 140~144번째 줄 근처):

```ts
    setTableCellTextColor(
      tableBlockId: string,
      target: TableCellTarget,
      color: string | null,
    ): Result<void, EditorError>;
    setTableCellBackgroundColor(
      tableBlockId: string,
      target: TableCellTarget,
      color: string | null,
    ): Result<void, EditorError>;
    setTableCellAlign(
      tableBlockId: string,
      target: TableCellTarget,
      align: "left" | "center" | "right" | null,
    ): Result<void, EditorError>;
```

3. `tableErrorFromCode`의 `detail` 파라미터와 `switch`에 `align`을 추가한다(724~762번째 줄 근처). `detail` 타입에 `align: string`을 추가하고:

```ts
  const tableErrorFromCode = (
    code: TableCommandError["code"],
    detail: {
      blockId: string;
      message: string;
      width: number;
      cellId: string;
      color: string;
      align: string;
    },
  ): EditorError => {
    switch (code) {
      case "BLOCK_NOT_FOUND":
        return { code: "BLOCK_NOT_FOUND", blockId: detail.blockId };
      case "TABLE_NOT_FOUND":
        return { code: "TABLE_NOT_FOUND", blockId: detail.blockId };
      case "TABLE_NODE_INVALID":
        return { code: "TABLE_NODE_INVALID", message: detail.message };
      case "INVALID_TABLE_SIZE":
        return { code: "INVALID_TABLE_SIZE" };
      case "INDEX_OUT_OF_RANGE":
        return { code: "INDEX_OUT_OF_RANGE" };
      case "MERGE_BOUNDARY_CROSSED":
        return { code: "MERGE_BOUNDARY_CROSSED" };
      case "COLUMN_WIDTH_OUT_OF_RANGE":
        return { code: "COLUMN_WIDTH_OUT_OF_RANGE", width: detail.width };
      case "NOT_RECTANGULAR":
        return { code: "NOT_RECTANGULAR" };
      case "CELL_NOT_FOUND":
        return { code: "CELL_NOT_FOUND", cellId: detail.cellId };
      case "LAST_ROW":
        return { code: "LAST_ROW" };
      case "LAST_COLUMN":
        return { code: "LAST_COLUMN" };
      case "INVALID_COLOR":
        return { code: "INVALID_COLOR", color: detail.color };
      case "INVALID_ALIGN":
        return { code: "INVALID_ALIGN", align: detail.align };
      default:
        return { code: "COMMAND_NOT_APPLICABLE", command: "table" };
    }
  };
```

4. `runVoidTableCommand`의 오류 수집부(764~813번째 줄 근처)에 `errorAlign`을 추가한다:

```ts
  const runVoidTableCommand = (
    command: string,
    invoke: () => Result<void, TableCommandError>,
  ): Result<void, EditorError> => {
    let errorCode: TableCommandError["code"] | null = null;
    let errorBlockId = "";
    let errorMessage = "";
    let errorWidth = 0;
    let errorCellId = "";
    let errorColor = "";
    let errorAlign = "";

    const result = runDocumentCommand(command, "local", () => {
      const outcome = invoke();
      if (outcome.ok) return true;
      errorCode = outcome.error.code;
      if (
        outcome.error.code === "BLOCK_NOT_FOUND" ||
        outcome.error.code === "TABLE_NOT_FOUND"
      ) {
        errorBlockId = outcome.error.blockId;
      }
      if (outcome.error.code === "TABLE_NODE_INVALID") {
        errorMessage = outcome.error.message;
      }
      if (outcome.error.code === "COLUMN_WIDTH_OUT_OF_RANGE") {
        errorWidth = outcome.error.width;
      }
      if (outcome.error.code === "CELL_NOT_FOUND") {
        errorCellId = outcome.error.cellId;
      }
      if (outcome.error.code === "INVALID_COLOR") {
        errorColor = outcome.error.color;
      }
      if (outcome.error.code === "INVALID_ALIGN") {
        errorAlign = outcome.error.align;
      }
      return false;
    });

    if (errorCode !== null) {
      return {
        ok: false,
        error: tableErrorFromCode(errorCode, {
          blockId: errorBlockId,
          message: errorMessage,
          width: errorWidth,
          cellId: errorCellId,
          color: errorColor,
          align: errorAlign,
        }),
      };
    }
    return result;
  };
```

5. `insertTable`의 `tableErrorFromCode` 호출부(1023~1033번째 줄 근처)에도 `align: ""`을 추가한다:

```ts
        if (errorCode !== null) {
          return {
            ok: false,
            error: tableErrorFromCode(errorCode, {
              blockId: errorBlockId,
              message: "",
              width: 0,
              cellId: "",
              color: "",
              align: "",
            }),
          };
        }
```

6. `commands` 객체에 `setTableCellAlign`을 추가한다(`setTableCellBackgroundColor` 다음, 1119~1128번째 줄 근처):

```ts
      setTableCellBackgroundColor: (tableBlockId, target, color) =>
        runVoidTableCommand("setTableCellBackgroundColor", () =>
          setTableCellColorCommand(
            tiptapEditor,
            tableBlockId,
            target,
            "backgroundColor",
            color,
          ),
        ),
      setTableCellAlign: (tableBlockId, target, align) =>
        runVoidTableCommand("setTableCellAlign", () =>
          setTableCellAlignCommand(tiptapEditor, tableBlockId, target, align),
        ),
```

- [ ] **Step 4: model 빌드 확인 후 전체 core 테스트를 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-model build`
Run: `pnpm --filter @cp949/geul-core test`
Expected: PASS 전체

Run: `pnpm --filter @cp949/geul-core typecheck`
Expected: PASS

Run: `pnpm check:boundaries`
Expected: 7 manifests, public core declarations 개수를 기록해 Global Constraints에서 예상한 값(4 유지)과 비교한다 — 늘었다면 어떤 신규 export가 늘렸는지 확인하고 의도적인지 판단한다(이 태스크는 `EditorController`/`EditorError`/`TableCellTarget` 기존 타입만 확장하므로 4 유지가 기대값이다).

- [ ] **Step 5: 커밋한다**

```bash
git add packages/core/src/table-model-codec.ts packages/core/src/table-extension.ts packages/core/src/table-commands.ts packages/core/src/editor-controller.ts packages/core/src/errors.ts packages/core/test/table-model-codec.test.ts packages/core/test/table-extension.test.ts packages/core/test/editor-controller-table-format.test.ts
git commit -m "feat(core): 셀 정렬을 PM 코덱·렌더·EditorController에 배선한다"
```

---

## Task 8: react — `TableCellFormatMenu`에 정렬 섹션을 추가한다

**Files:**
- Modify: `packages/react/src/table-cell-format-menu.tsx`
- Test: `packages/react/test/table-cell-format-menu.test.tsx`

**Interfaces:**
- Consumes: `editor.commands.setTableCellAlign(tableBlockId, target, align)`(Task 7).

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`packages/react/test/table-cell-format-menu.test.tsx`의 `fakeController`에 `setTableCellAlign` mock을 추가한다:

```ts
  commands: {
    setTableCellTextColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellBackgroundColor: vi.fn(() => ({ ok: true, value: undefined })),
    setTableCellAlign: vi.fn(() => ({ ok: true, value: undefined })),
  } as unknown as EditorController["commands"],
```

같은 파일 끝에 새 테스트를 추가한다:

```ts
describe("정렬 버튼", () => {
  it("Align center 클릭 시 setTableCellAlign(tableBlockId, target, \"center\")를 호출하고 닫는다", () => {
    const controller = fakeController();
    const onClose = vi.fn();

    render(
      <EditorProvider editor={controller as unknown as EditorController}>
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={onClose}
          tableBlockId="table-1"
          top={100}
        />
      </EditorProvider>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Align center" }));

    expect(controller.commands.setTableCellAlign).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      "center",
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Align none 클릭 시 null을 넘긴다", () => {
    const controller = fakeController();

    render(
      <EditorProvider editor={controller as unknown as EditorController}>
        <TableCellFormatMenu
          cellIds={["cell-1"]}
          left={100}
          onClose={vi.fn()}
          tableBlockId="table-1"
          top={100}
        />
      </EditorProvider>,
    );

    fireEvent.click(screen.getByRole("menuitem", { name: "Align none" }));

    expect(controller.commands.setTableCellAlign).toHaveBeenCalledWith(
      "table-1",
      { kind: "cells", cellIds: ["cell-1"] },
      null,
    );
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-react test -- table-cell-format-menu.test.tsx`
Expected: FAIL — "Align center"/"Align none" 메뉴 항목이 아직 없다.

- [ ] **Step 3: 정렬 섹션을 추가한다**

`packages/react/src/table-cell-format-menu.tsx` 상단 import를 바꾼다:

```tsx
import { AlignCenter, AlignLeft, AlignRight } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";

import { iconProps } from "./icon-props.js";
import {
  TABLE_BACKGROUND_COLORS,
  TABLE_TEXT_COLORS,
  type TableCellColor,
} from "./table-cell-colors.js";
import { useEditor } from "./use-editor.js";
```

클래스 상수 뒤에 정렬 버튼용 클래스를 추가한다:

```ts
const dividerClassName =
  "geul:my-1 geul:mx-0 geul:border-0 geul:border-t geul:border-[color:var(--be-color-border,#dadce0)]";
const alignButtonClassName =
  "geul:flex geul:h-7 geul:min-w-7 geul:cursor-pointer geul:items-center geul:justify-center geul:rounded geul:border-0 geul:bg-transparent geul:p-1 geul:hover:bg-[var(--be-color-accent-muted,#e8f0fe)] geul:text-[color:var(--be-color-text,#202124)]";
```

컴포넌트 본문에 `applyAlign`을 추가한다(`applyColor` 바로 뒤):

```ts
  const applyAlign = (align: "left" | "center" | "right" | null) =>
    runAndClose(() => {
      editor.commands.setTableCellAlign(tableBlockId, target, align);
    });
```

반환 JSX의 마지막 `renderPalette` 호출 뒤에 정렬 섹션을 추가한다:

```tsx
      {renderPalette("text", "Text color", TABLE_TEXT_COLORS)}
      {renderPalette("background", "Background color", TABLE_BACKGROUND_COLORS)}
      <hr className={dividerClassName} />
      <p className={sectionLabelClassName}>Align</p>
      <div className="geul:flex geul:gap-1 geul:px-2 geul:pb-1">
        <button
          aria-label="Align left"
          className={alignButtonClassName}
          onClick={() => applyAlign("left")}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          <AlignLeft {...iconProps} />
        </button>
        <button
          aria-label="Align center"
          className={alignButtonClassName}
          onClick={() => applyAlign("center")}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          <AlignCenter {...iconProps} />
        </button>
        <button
          aria-label="Align right"
          className={alignButtonClassName}
          onClick={() => applyAlign("right")}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          <AlignRight {...iconProps} />
        </button>
        <button
          aria-label="Align none"
          className={alignButtonClassName}
          onClick={() => applyAlign(null)}
          onMouseDown={(event) => event.preventDefault()}
          role="menuitem"
          type="button"
        >
          ×
        </button>
      </div>
```

(`dividerClassName`이 이 파일에 아직 없다면 `table-handle-menu.tsx`와 같은 값으로 새로 선언한다: `"geul:my-1 geul:mx-0 geul:border-0 geul:border-t geul:border-[color:var(--be-color-border,#dadce0)]"`.)

- [ ] **Step 4: 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-react test`
Expected: PASS 전체

Run: `pnpm --filter @cp949/geul-react typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/react/src/table-cell-format-menu.tsx packages/react/test/table-cell-format-menu.test.tsx
git commit -m "feat(react): 셀 서식 메뉴에 정렬 섹션을 추가한다"
```

---

## Task 9: e2e — 셀 정렬 적용 (9b-2 UI 완료 확인)

**Files:**
- Modify: `e2e/table-format.spec.ts`

**Interfaces:**
- Consumes: Task 4와 같은 헬퍼, `role=menuitem[name="Align center"]` 등.

- [ ] **Step 1: 실패하는 e2e를 추가한다**

```ts
test("셀 정렬을 적용하고 undo로 되돌린다", async ({ page }) => {
  await insertTable(page, { rows: 2, columns: 2 });
  const cell = page.locator("table td").first();
  await cell.click({ clickCount: 3 });

  await page.getByRole("button", { name: "Cell formatting" }).click();
  await page.getByRole("menuitem", { name: "Align center" }).click();

  await expect(cell).toHaveCSS("text-align", "center");

  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(cell).not.toHaveCSS("text-align", "center");
});
```

- [ ] **Step 2: 확인 후 필요하면 보정한다**

Run: `pnpm test:e2e --project=chromium -g "셀 정렬을 적용하고"`
Expected: PASS (Task 7~8이 끝나 있으므로). 실패하면 셀렉터/UI를 보정한다.

- [ ] **Step 3: 커밋한다**

```bash
git add e2e/table-format.spec.ts
git commit -m "test(e2e): 셀 정렬 적용 시나리오를 추가한다"
```

---

## Task 10: io — HTML export/import에 `align` 매핑을 추가한다

**Files:**
- Modify: `packages/io/src/html/export-html.ts`, `packages/io/src/html/import-html.ts`
- Test: `packages/io/test/html-round-trip.test.ts`

**Interfaces:**
- Produces: `cellNode()`가 `align !== undefined`일 때 `dataBeAlign` hast property를 낸다(`data-be-align`으로 직렬화). import는 `dataBeAlign` property를 읽어 `align`으로 되돌린다.
- 색상과 달리 io의 HTML export는 인라인 style을 넣지 않는다(기존 색상도 안 넣는다 — 라이브 에디터 렌더(core)만 인라인 style을 쓴다). 이 계층은 `data-be-*` 매핑만 담당한다.

- [ ] **Step 1: 실패하는 테스트를 추가한다**

`packages/io/test/html-round-trip.test.ts` 끝에 새 `it`을 추가한다:

```ts
it("셀 align을 왕복 변환에서 보존한다", () => {
  const documentWithAlign: Document = {
    formatVersion: 1,
    revision: 0,
    blocks: [
      {
        id: "table-1",
        type: "table",
        columns: [{ id: "column-1", width: 160 }],
        rows: [
          {
            id: "row-1",
            cells: [
              {
                id: "cell-1",
                columnId: "column-1",
                rowSpan: 1,
                columnSpan: 1,
                content: [{ text: "Centered" }],
                align: "center",
              },
            ],
          },
        ],
        headerRows: 0,
        headerColumns: 0,
      },
    ],
  };

  const exported = exportHtml(documentWithAlign);
  expect(exported.ok).toBe(true);
  if (!exported.ok) throw new Error(exported.error.message);
  expect(exported.value).toContain('data-be-align="center"');

  expect(importHtml(exported.value)).toEqual({
    ok: true,
    value: { document: documentWithAlign, warnings: [] },
  });
});

it("허용 목록 밖 data-be-align 값은 import 전체를 HTML_DOCUMENT_INVALID로 거절한다", () => {
  const html =
    '<table data-be-block-id="table-1"><colgroup><col data-be-column-id="column-1" data-be-width="160"></colgroup><tbody><tr data-be-row-id="row-1"><td data-be-cell-id="cell-1" data-be-column-id="column-1" rowspan="1" colspan="1" data-be-align="justify"></td></tr></tbody></table>';

  const result = importHtml(html);

  expect(result.ok).toBe(false);
  if (result.ok) return;
  expect(result.error.code).toBe("HTML_DOCUMENT_INVALID");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-io test -- html-round-trip.test.ts`
Expected: FAIL — `align`이 io HTML 경로에 없어 export 문자열에 `data-be-align`이 없고, import는 `align`을 채우지 못한다(두 번째 테스트는 현재 `justify`를 그냥 문자열로 통과시켜 성공 응답을 낼 것이므로 실패한다).

- [ ] **Step 3: 매핑을 구현한다**

`packages/io/src/html/export-html.ts`의 `cellNode()`에서 `backgroundColor` 처리 다음(43~45번째 줄 근처)에 추가한다:

```ts
  if (cell.backgroundColor !== undefined) {
    properties.dataBeBackgroundColor = cell.backgroundColor;
  }
  if (cell.align !== undefined) {
    properties.dataBeAlign = cell.align;
  }
```

`packages/io/src/html/import-html.ts`의 `modelRows` 매핑부(341~365번째 줄 근처)를 교체한다:

```ts
  const modelRows: TableBlock["rows"] = rows.map((row, rowIndex) => ({
    id: propertyString(row.element, "dataBeRowId") ?? createId(),
    cells: (layouts[rowIndex] ?? []).map((layout) => {
      const column = columns[layout.columnIndex];
      const columnId =
        propertyString(layout.element, "dataBeColumnId") ??
        column?.id ??
        createId();
      const textColor = propertyString(layout.element, "dataBeTextColor");
      const backgroundColor = propertyString(
        layout.element,
        "dataBeBackgroundColor",
      );
      const align = propertyString(layout.element, "dataBeAlign");

      return {
        id: propertyString(layout.element, "dataBeCellId") ?? createId(),
        columnId,
        rowSpan: layout.rowSpan,
        columnSpan: layout.columnSpan,
        content: inlineContentFromNodes(layout.element.children),
        ...(textColor === undefined ? {} : { textColor }),
        ...(backgroundColor === undefined ? {} : { backgroundColor }),
        ...(align === undefined ? {} : { align }),
      };
    }),
  }));
```

(색과 마찬가지로 형식 검증은 여기서 하지 않는다 — `importHtml` 끝의 `parseDocument(document)` 호출이 model의 `isCanonicalCellAlign`을 거쳐 `HTML_DOCUMENT_INVALID`로 거절한다. `align` 필드가 model 타입에서 `"left"|"center"|"right"`로 좁혀져 있지만 여기서는 `propertyString`이 임의 문자열을 반환하므로, TS가 이 스프레드를 받아들이려면 `align`을 캐스팅해야 할 수 있다 — 그럴 경우 `as TableBlock["rows"][number]["cells"][number]["align"]`로 좁힌다. 어차피 런타임 검증은 `parseDocument`가 한다.)

- [ ] **Step 4: 테스트를 다시 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-io test -- html-round-trip.test.ts`
Expected: PASS

Run: `pnpm --filter @cp949/geul-io typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/io/src/html/export-html.ts packages/io/src/html/import-html.ts packages/io/test/html-round-trip.test.ts
git commit -m "feat(io): HTML 왕복 변환에 셀 정렬을 추가한다"
```

---

## Task 11: io — GFM 열 정렬을 셀에 매핑하고, 불일치는 손실로 기록한다

**Files:**
- Modify: `packages/io/src/markdown/import-markdown.ts`, `packages/io/src/markdown/export-markdown.ts`, `packages/io/src/markdown/loss-analysis.ts`
- Test: `packages/io/test/markdown-round-trip-downgrade.test.ts`, `packages/io/test/markdown-round-trip-basic.test.ts`, `packages/io/test/markdown-loss.test.ts`

**Interfaces:**
- Produces: `MarkdownLoss.kind`에 `"COLUMN_ALIGN"` 추가. `importMarkdown`은 더 이상 `TABLE_ALIGNMENT_DISCARDED` 경고를 내지 않는다(이 kind를 `ImportWarning`에서 제거한다 — io 공개 타입 변경).

- [ ] **Step 1: 기존 테스트를 새 동작으로 바꾸고, 새 테스트를 추가한다**

`packages/io/test/markdown-round-trip-downgrade.test.ts`의 "GFM 표의 정렬 메타데이터를 버릴 때 경고한다" 테스트(129~148번째 줄 근처)를 교체한다:

```ts
  it("GFM 표의 열 정렬을 그 열의 모든 셀에 매핑한다", () => {
    const result = importMarkdown(
      "| Left | Right |\n| :--- | ---: |\n| 1 | 2 |",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    expect(result.value.warnings).toEqual([]);
    const table = result.value.document.blocks[0];
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.rows[0]?.cells.map((c) => c.align)).toEqual([
      "left",
      "right",
    ]);
    expect(table.rows[1]?.cells.map((c) => c.align)).toEqual([
      "left",
      "right",
    ]);
  });

  it("정렬 구문이 없는 열은 align을 지정하지 않는다", () => {
    const result = importMarkdown("| A | B |\n| - | - |\n| 1 | 2 |");
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error.message);

    const table = result.value.document.blocks[0];
    if (table?.type !== "table") throw new Error("Expected a table");
    expect(table.rows[0]?.cells.map((c) => c.align)).toEqual([
      undefined,
      undefined,
    ]);
  });
```

`packages/io/test/markdown-round-trip-basic.test.ts`에 왕복 테스트를 추가한다(파일 끝 `describe` 안, 기존 표 테스트 뒤):

```ts
  it("정렬이 있는 GFM 표를 가져와 lossy로 다시 내보내면 같은 정렬이 남는다", () => {
    const imported = importMarkdown(
      "| Left | Center | Right |\n| :--- | :---: | ---: |\n| a | b | c |",
    );
    expect(imported.ok).toBe(true);
    if (!imported.ok) throw new Error(imported.error.message);

    const exported = exportMarkdown(imported.value.document, {
      mode: "lossy",
    });
    expect(exported.ok).toBe(true);
    if (!exported.ok) throw new Error(exported.error.message);
    expect(exported.value.warnings).toEqual([]);
    expect(exported.value.markdown).toContain(":---");
    expect(exported.value.markdown).toContain(":-:");
    expect(exported.value.markdown).toContain("---:");
  });
```

`packages/io/test/markdown-loss.test.ts`에 정렬 불일치 손실 테스트를 추가한다(파일 끝, `describe` 블록 안):

```ts
  it("열 안에서 정렬이 갈리면 strict는 실패하고 lossy는 열 정렬을 비운 채 경고한다", () => {
    const mismatchedAlignDocument: Document = {
      formatVersion: 1,
      revision: 0,
      blocks: [
        {
          id: "table-1",
          type: "table",
          columns: [{ id: "column-1", width: 160 }],
          rows: [
            {
              id: "row-1",
              cells: [
                {
                  id: "cell-1",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "a" }],
                  align: "left",
                },
              ],
            },
            {
              id: "row-2",
              cells: [
                {
                  id: "cell-2",
                  columnId: "column-1",
                  rowSpan: 1,
                  columnSpan: 1,
                  content: [{ text: "b" }],
                  align: "right",
                },
              ],
            },
          ],
          headerRows: 1,
          headerColumns: 0,
        },
      ],
    };

    expect(
      exportMarkdown(mismatchedAlignDocument, { mode: "strict" }),
    ).toEqual({
      ok: false,
      error: {
        code: "MARKDOWN_LOSS_NOT_ALLOWED",
        losses: [
          {
            kind: "COLUMN_ALIGN",
            blockId: "table-1",
            message: "Column column-1 has cells with different align values",
          },
        ],
      },
    });

    const lossy = exportMarkdown(mismatchedAlignDocument, { mode: "lossy" });
    expect(lossy.ok).toBe(true);
    if (!lossy.ok) throw new Error(lossy.error.message);
    expect(lossy.value.warnings).toEqual([
      {
        kind: "COLUMN_ALIGN",
        blockId: "table-1",
        message: "Column column-1 has cells with different align values",
      },
    ]);
  });
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `pnpm --filter @cp949/geul-io test -- markdown-round-trip-downgrade.test.ts markdown-round-trip-basic.test.ts markdown-loss.test.ts`
Expected: FAIL — import는 여전히 정렬을 버리고 경고하며, export는 항상 `align: table.columns.map(() => null)`을 낸다.

- [ ] **Step 3: import/export/loss-analysis를 구현한다**

`packages/io/src/markdown/import-markdown.ts`의 `tableFromNode()`(400~466번째 줄 근처)를 교체한다:

```ts
const tableFromNode = (
  node: MarkdownNode,
  createId: IdFactory,
  warnings: ImportWarning[],
): Document["blocks"][number] => {
  const tableId = createId();
  const sourceRows = node.children ?? [];
  const columnCount = sourceRows.reduce(
    (maximum, row) => Math.max(maximum, row.children?.length ?? 0),
    0,
  );
  if (
    columnCount > MAX_TABLE_LOGICAL_CELLS ||
    sourceRows.length * columnCount > MAX_TABLE_LOGICAL_CELLS
  ) {
    throw new MarkdownDocumentInvalidError(
      `Table logical cell count exceeds ${MAX_TABLE_LOGICAL_CELLS}`,
    );
  }

  const columns = Array.from({ length: columnCount }, () => ({
    id: createId(),
    width: DEFAULT_COLUMN_WIDTH,
  }));
  const rows = sourceRows.map((sourceRow) => {
    const rowId = createId();
    return {
      id: rowId,
      cells: columns.map((column, columnIndex) => {
        const cellId = createId();
        const sourceCell = sourceRow.children?.[columnIndex];
        const align = node.align?.[columnIndex] ?? null;
        return {
          id: cellId,
          columnId: column.id,
          rowSpan: 1,
          columnSpan: 1,
          content: inlineContentFromNodes(
            sourceCell?.children ?? [],
            warnings,
            {
              blockId: tableId,
              rowId,
              cellId,
              inTableCell: true,
            },
          ),
          ...(align === null ? {} : { align }),
        };
      }),
    };
  });

  return {
    id: tableId,
    type: "table",
    columns,
    rows,
    headerRows: rows.length === 0 ? 0 : 1,
    headerColumns: 0,
  };
};
```

같은 파일에서 `ImportWarning.kind` union(163~177번째 줄 근처)에서 `"TABLE_ALIGNMENT_DISCARDED"`를 제거한다:

```ts
export type ImportWarning = {
  kind:
    | "HEADING_DEPTH_DOWNGRADED"
    | "RAW_HTML_DOWNGRADED"
    | "LIST_DOWNGRADED"
    | "IMAGE_DOWNGRADED"
    | "UNSUPPORTED_BLOCK_DOWNGRADED"
    | "UNSUPPORTED_INLINE_DOWNGRADED";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};
```

`packages/io/src/markdown/export-markdown.ts`:

1. `MarkdownOutputNode.align` 타입을 넓힌다(23번째 줄):

```ts
type MarkdownOutputNode = {
  type: string;
  value?: string;
  depth?: number;
  url?: string;
  align?: Array<"left" | "center" | "right" | null>;
  children?: MarkdownOutputNode[];
};
```

2. `tableNode()` 앞에 헬퍼를 추가하고 `align` 계산을 바꾼다:

```ts
const columnAlign = (
  table: TableBlock,
  columnId: string,
): "left" | "center" | "right" | null => {
  let align: "left" | "center" | "right" | null | undefined;
  for (const row of table.rows) {
    for (const cell of row.cells) {
      if (cell.columnId !== columnId) continue;
      const cellAlign = cell.align ?? null;
      if (align === undefined) {
        align = cellAlign;
        continue;
      }
      if (align !== cellAlign) return null;
    }
  }
  return align ?? null;
};

const tableNode = (table: TableBlock): MarkdownOutputNode => {
  const columnIndices = new Map(
    table.columns.map((column, index) => [column.id, index]),
  );
  const rows = Array.from({ length: table.rows.length }, () =>
    Array.from(
      { length: table.columns.length },
      (): MarkdownOutputNode => ({ type: "tableCell", children: [] }),
    ),
  );

  for (const [rowIndex, row] of table.rows.entries()) {
    const outputRow = rows[rowIndex];
    if (outputRow === undefined) continue;
    for (const cell of row.cells) {
      const columnIndex = columnIndices.get(cell.columnId);
      if (columnIndex === undefined) continue;
      outputRow[columnIndex] = {
        type: "tableCell",
        children: inlineNodes(cell.content, true),
      };
    }
  }

  return {
    type: "table",
    align: table.columns.map((column) => columnAlign(table, column.id)),
    children: rows.map((cells) => ({ type: "tableRow", children: cells })),
  };
};
```

`packages/io/src/markdown/loss-analysis.ts`:

1. import에 `TableBlock`을 추가한다:

```ts
import type { Document, InlineContent, TableBlock } from "@cp949/geul-model";
```

2. `MarkdownLoss.kind` union에 추가한다:

```ts
export type MarkdownLoss = {
  kind:
    | "MERGED_CELL"
    | "COLUMN_WIDTH"
    | "COLUMN_ALIGN"
    | "CELL_COLOR"
    | "UNDERLINE"
    | "HEADER_ROW"
    | "HEADER_COLUMN"
    | "INLINE_CODE_NEWLINE";
  blockId: string;
  rowId?: string;
  cellId?: string;
  message: string;
};
```

3. 헬퍼를 추가하고(`hasInlineCodeNewline` 다음) 열 루프에 검사를 추가한다:

```ts
const columnAlignAgrees = (block: TableBlock, columnId: string): boolean => {
  let seen: "left" | "center" | "right" | null | undefined;
  for (const row of block.rows) {
    for (const cell of row.cells) {
      if (cell.columnId !== columnId) continue;
      const align = cell.align ?? null;
      if (seen === undefined) {
        seen = align;
        continue;
      }
      if (seen !== align) return false;
    }
  }
  return true;
};
```

`for (const column of block.columns) { ... }` 루프(기존 `COLUMN_WIDTH` 검사가 있는 곳) 안에 추가한다:

```ts
    for (const column of block.columns) {
      if (column.width !== DEFAULT_COLUMN_WIDTH) {
        losses.push({
          kind: "COLUMN_WIDTH",
          blockId: block.id,
          message: `Column ${column.id} has non-default width ${column.width}`,
        });
      }
      if (!columnAlignAgrees(block, column.id)) {
        losses.push({
          kind: "COLUMN_ALIGN",
          blockId: block.id,
          message: `Column ${column.id} has cells with different align values`,
        });
      }
    }
```

- [ ] **Step 4: 전체 io 테스트를 실행해 통과를 확인한다**

Run: `pnpm --filter @cp949/geul-io test`
Expected: PASS 전체(다른 io 소비처가 `TABLE_ALIGNMENT_DISCARDED`를 참조하지 않는지 `grep -rn "TABLE_ALIGNMENT_DISCARDED" packages/`로 확인 — Task 11 이전에 이미 확인했듯 `markdown-round-trip-downgrade.test.ts` 한 곳뿐이었고 Step 1에서 이미 고쳤다)

Run: `pnpm --filter @cp949/geul-io typecheck`
Expected: PASS

- [ ] **Step 5: 커밋한다**

```bash
git add packages/io/src/markdown/import-markdown.ts packages/io/src/markdown/export-markdown.ts packages/io/src/markdown/loss-analysis.ts packages/io/test/markdown-round-trip-downgrade.test.ts packages/io/test/markdown-round-trip-basic.test.ts packages/io/test/markdown-loss.test.ts
git commit -m "feat(io): GFM 열 정렬을 셀에 매핑하고 불일치를 손실로 기록한다"
```

---

## Task 12: 문서·인벤토리 마무리 + 전체 검증

**Files:**
- Modify: `docs/product/blocknote-free-feature-inventory.md`, `docs/product/current-status.md`

- [ ] **Step 1: 전체 검증 명령을 실행하고 결과를 기록한다**

```
pnpm --filter @cp949/geul-model test
pnpm --filter @cp949/geul-io test
pnpm --filter @cp949/geul-core test
pnpm --filter @cp949/geul-react test
pnpm --filter @cp949/geul-react typecheck
pnpm lint
pnpm build
pnpm typecheck
pnpm check:boundaries
pnpm check:licenses
pnpm test:e2e --project=chromium
```

`pnpm test`는 Issue #12(io 10,000셀 markdown baseline 타임아웃)가 열려 있는 한 그 1건은 baseline 실패로 분리해 보고한다 — 새 실패와 혼동하지 않는다. `pnpm verify`는 `&&` 체인이라 첫 실패에서 멈추므로 boundaries/licenses/e2e는 개별 실행한다.

- [ ] **Step 2: 인벤토리와 현재 상태 문서를 갱신한다**

`docs/product/blocknote-free-feature-inventory.md`에서 `TBL-007` 상태를 `PARTIAL`→`VERIFIED`로, `TBL-008` 상태를 `NOT_STARTED`→`VERIFIED`로 바꾸고 비고를 갱신한다(정확한 편집 위치는 `grep -n "TBL-007\|TBL-008"`로 찾는다).

`docs/product/current-status.md`의 "현재 단계"·"바로 다음 작업" 절을 슬라이스 9b 완료로 갱신한다(9a 갱신 방식과 같은 문체로, 슬라이스 10이 다음 후보임을 적는다).

- [ ] **Step 3: GitHub Issue #3의 슬라이스 9b 체크박스를 완료로 표시하고 완료 댓글을 남긴다**

9a 완료 댓글(`gh issue comment 3 --body ...`)과 같은 구조로 — 구현 요약, 검증 결과, 인벤토리 갱신, 다음 슬라이스(10) 안내를 남긴다. 이 스텝은 실행 전에 사용자에게 댓글 내용을 확인받는다(GitHub에 쓰는 작업이라 되돌리기 어렵다).

- [ ] **Step 4: 커밋한다**

```bash
git add docs/product/blocknote-free-feature-inventory.md docs/product/current-status.md
git commit -m "docs: 슬라이스 9b 완료 상태를 반영한다"
```

---

## 완료 조건

- `TBL-007`이 `VERIFIED`(행/열/셀 단위 색상 모두), `TBL-008`이 `VERIFIED`.
- 위 12개 태스크의 RED→GREEN이 모두 기록돼 있다.
- `pnpm test`/`pnpm test:e2e --project=chromium`이 Issue #12 baseline 1건을 제외하고 전부 통과.
- `pnpm check:boundaries`/`pnpm check:licenses` 결과가 기록돼 있고, public core declarations 변화가 있다면 의도적임이 설명돼 있다.
- Issue #3 9b 항목 체크, 완료 댓글, `current-status.md`/인벤토리 갱신 완료.
