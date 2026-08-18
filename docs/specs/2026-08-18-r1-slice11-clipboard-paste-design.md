# R1 슬라이스 11 — 스프레드시트 클립보드 붙여넣기 설계

## 1. 결정 요약

Issue #3 슬라이스 11(`TBL-012`~`TBL-014`)의 구현 설계다. `ClipboardTableParser`(io) → `TabularData`(io) → 검증기(model 재사용) → `pasteTabularData`(core) 파이프라인을 만들고, 10,000셀 성능 benchmark를 기록한다. `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md` 9절(붙여넣기 계약)·13절(성능 계약)을 구체화하며 그 문서의 계약을 바꾸지 않는다.

핵심 결정:

1. **`core`가 `io`에 의존하는 새 엣지를 추가한다**(`ADR-0002` 그래프 갱신). `ClipboardTableParser`/`TabularData`/검증기는 io 소유, `pasteTabularData`/`TableGrid.pasteInto`는 core 소유.
2. Issue #12(io 10,000셀 markdown 테스트 타임아웃)를 이 슬라이스에서 함께 닫는다. spec 13 기준선 최초 측정치는 이 슬라이스의 benchmark 결과로 겸한다.
3. 클립보드 HTML의 인라인 `style`(`color`/`background-color`/`text-align`)을 읽는다. 이 해석 로직은 클립보드 경로 전용이며 기존 `importHtml`(문서 HTML import) 동작은 바꾸지 않는다.

## 2. 패키지 배치와 의존성

```
io -> model        (기존)
core -> model       (기존)
core -> io          (신규 — 이 슬라이스에서 추가)
react -> core       (기존, 변경 없음)
demo -> react, io, model  (기존, 변경 없음)
```

- `packages/core/package.json`에 `"@cp949/geul-io": "workspace:*"` 추가.
- `docs/adr/0002-enforce-layered-package-boundaries.md`의 의존 방향 문장에 `core -> io`를 추가하고, 근거(클립보드 파서가 io의 HTML sanitizer·테이블 변환기를 재사용)를 기록한다.
- `scripts/check-package-boundaries.mjs`는 `model`/`io`만 headless(DOM/React/Tiptap 금지) 검사 대상이고 `core`의 의존성 방향 자체는 검사하지 않는다 — 이 변경으로 새로 실패하는 자동 검사는 없다. `core` 공개 `.d.ts`가 Tiptap/ProseMirror 타입을 계속 안 새는지는 기존 검사가 그대로 커버한다.
- `react`, `demo`는 이 슬라이스에서 변경 없음. React는 여전히 core의 명령 API(`pasteTabularData`)만 호출한다 — 클립보드 파싱을 직접 하지 않는다.

## 3. `TabularData` (io)

`packages/io/src/clipboard/tabular-data.ts`(신규):

```ts
export type TabularCell = {
  columnIndex: number;
  rowSpan: number;
  columnSpan: number;
  content: InlineContent;
  textColor?: string;
  backgroundColor?: string;
  align?: "left" | "center" | "right";
};

export type TabularData = {
  columnCount: number;
  rows: Array<{ cells: TabularCell[] }>;
};
```

- 편집기 타입(Tiptap/ProseMirror)도 model의 안정 id(`TableBlock`의 `id`/`columnId`)도 참조하지 않는다 — 위치(`columnIndex`) 기반 스냅샷이다.
- 헤더 정보(`headerRows`/`headerColumns`)는 담지 않는다. 붙여넣기는 값·서식만 옮기고 헤더 여부를 추측하지 않는다(YAGNI, 기존 `toggleHeaderRow`/`toggleHeaderColumn` 명령과 별개 관심사).

## 4. `ClipboardTableParser` (io)

`packages/io/src/clipboard/clipboard-table-parser.ts`(신규), export명 `parseClipboardTable`:

```ts
export type ClipboardParseError =
  | { code: "NOT_TABULAR" }
  | { code: "CLIPBOARD_TABLE_INVALID"; message: string };

export const parseClipboardTable = (input: {
  html?: string;
  text?: string;
}): Result<TabularData, ClipboardParseError> => { ... };
```

### 4.1 우선순위와 판정

```text
1. input.html에 <table>이 있으면 HTML 경로
2. 없으면 input.text에 탭 문자가 1개 이상 있으면 TSV 경로
3. 둘 다 아니면 NOT_TABULAR
```

`NOT_TABULAR`는 core의 붙여넣기 가로채기가 이벤트를 소비하지 않고 Tiptap 기본 붙여넣기로 넘기는 신호다. 탭 없는 일반 여러 줄 텍스트를 1열 표로 오인하지 않도록, TSV 경로는 탭 존재를 필수 조건으로 둔다.

### 4.2 HTML 경로 — 테이블 변환기 재사용

`io/html/import-html.ts`의 `parseTable`이 쓰는 hast 트리 순회 로직 중 id 배정과 무관한 부분(`layoutRows`, `inferredColumnCount`, `columnElements`, `tableRows`, `layoutColumnSpan`, `childElements`)을 `packages/io/src/html/table-layout.ts`(신규)로 뽑아 두 소비자가 공유한다:

- `import-html.ts`의 `parseTable`: 레이아웃 + id 배정 → `TableBlock`.
- `clipboard-table-parser.ts`의 새 함수: 레이아웃(id 없이) → `TabularData`.

셀 콘텐츠(인라인 마크 포함)는 기존 `inlineContentFromNodes`(`inline-content.ts`)를 그대로 재사용한다.

sanitizer는 `htmlSanitizeSchema`를 그대로 쓰되 `htmlAllowedAttributes.td`/`.th`에 `style`을 추가한다. 이 allowlist 확장은 공유 스키마라 `importHtml` 경로도 `style` 속성이 sanitize에서 살아남게 되지만, `import-html.ts`의 `parseTable`은 여전히 `style`을 읽지 않으므로(`data-be-*`만 읽음) `importHtml`의 관찰 가능한 동작은 바뀌지 않는다.

**style 파싱(클립보드 경로 전용, 신규 코드)**: `style` 속성 문자열에서 `color`/`background-color`/`text-align` 세 선언만 최소 정규식으로 추출한다. `color`/`background-color` 값은 `isCanonicalCellColor`(model)를 통과할 때만(대문자 `#RRGGBB`로 정규화 후) 반영하고, `text-align` 값은 `isCanonicalCellAlign`을 통과할 때만 반영한다. 나머지 CSS 선언, 통과하지 못한 값은 조용히 버린다(파싱 실패로 전체를 거절하지 않는다). `data-be-text-color`/`data-be-background-color`/`data-be-align`(자기 복사)가 있으면 그걸 `style`보다 우선한다. **`data-be-*` 값도 `style` 값과 똑같이 `isCanonicalCellColor`/`isCanonicalCellAlign`을 통과해야 하고, 통과하지 못하면 조용히 버린다** — 통과시키면 클립보드 HTML이 임의 값을 문서로 밀어넣어 `parseDocument`가 커밋 시점에 거절하고 모델과 에디터가 영구 desync된다. 클립보드 sanitize 스키마는 `importHtml` 스키마와 분리해서 쓴다(`clipboardSanitizeSchema`) — 공유하면 `style`/`role` 허용이 `importHtml`의 속성 제거 경고까지 없애버린다.

### 4.3 TSV 경로

탭으로 셀, 개행으로 행을 나눈다. rowSpan/colSpan/색상/정렬 없음(전부 기본값: `rowSpan: 1, columnSpan: 1`, 색상/정렬 없음). 가장 긴 행 기준으로 `columnCount`를 정하고, 짧은 행은 빈 문자열 셀로 패딩해 항상 직사각형을 만든다(뒤 단계 검증기가 항상 통과하도록).

구현 반영(2차 리뷰 후 계약 변경): 짧은 행 패딩을 하지 않는다. TSV 경로는 **모든 줄의 탭 개수가 같고 열이 2개 이상일 때만** 표로 인정하고, 들쭉날쭉하면 `NOT_TABULAR`로 기본 붙여넣기에 넘긴다. 끝 개행 하나가 만든 빈 줄만 버리고 중간 빈 줄은 버리지 않는다(버리면 행 인덱스가 조용히 밀린다 — 중간 빈 줄은 탭 개수 검사가 걸러낸다).

이유: `text.includes("\t")` 하나로 판정하면 탭 들여쓰기 코드나 탭이 섞인 로그가 전부 표가 되고, §7.2 계약대로 확장이 이벤트를 소비하므로 사용자가 기본 붙여넣기를 되찾을 방법이 없다. 스프레드시트 클립보드는 항상 직사각형이므로 이 조건이 실제 대상 입력을 잃지 않는다. HTML 표의 짧은 행 패딩은 그대로 유지한다 — 진짜 표 마크업은 정상적으로 들쭉날쭉하다.

## 5. 검증기 — model의 그리드 커버리지 재사용

`packages/model/src/table-grid-validation.ts`를 리팩터한다:

```ts
export const validateGridCoverage = (
  rowCount: number,
  columnCount: number,
  cells: Array<{ row: number; column: number; rowSpan: number; columnSpan: number }>,
): Result<undefined, TableGridValidationError> => { ... };

export const validateTableGrid = (table: TableBlock) =>
  validateGridCoverage(
    table.rows.length,
    table.columns.length,
    /* columnId -> index 매핑 후 generic cells로 변환 */
  );
```

동작(겹침/구멍/범위 밖 판정)은 100% 동일하게 유지 — 순수 리팩터, 기존 `table-grid.property.test.ts`/`table-grid-validation` 테스트가 회귀를 잡는다. `validateGridCoverage`와 그 타입을 model의 공개 API(`index.ts`)로 새로 export한다.

io의 `TabularData` 구조 검증(직사각형, 0셀 아님, 좌표 범위 안)은 `validateGridCoverage`를 그대로 호출한다 — `io -> model`은 이미 있는 엣지라 새 의존성이 없다. 이 검증은 `parseClipboardTable`이 결과를 반환하기 직전에 내부적으로 수행한다(TSV 경로는 구성상 항상 통과, HTML 경로는 원본이 `rowSpan`/`colSpan` 교차로 깨진 표일 때를 여기서 걸러 `CLIPBOARD_TABLE_INVALID`로 거절한다).

## 6. `TableGrid.pasteInto` (core)

`packages/core/src/table-grid.ts`에 추가하는 새 격자 연산 하나:

```ts
export const pasteInto = (
  table: TableBlock,
  anchor: { row: number; column: number },
  data: TabularData,
  createId: IdFactory,
): Result<TableBlock, TableGridError> => { ... };
```

### 6.1 절차

1. 목표 크기 계산: `requiredRows = anchor.row + data.rows.length`, `requiredColumns = anchor.column + data.columnCount`.
2. 확장은 **기존 `insertRow`/`insertColumn`을 표 끝(현재 길이 인덱스)에 반복 호출**해서 수행한다 — 끝에 추가하는 삽입은 기존 span과 절대 교차하지 않으므로 새 격자 계산 코드가 필요 없다(PIT-0004 — 격자 연산의 단일 권위는 계속 `TableGrid`).
3. 확장 후 논리 셀 수(`requiredRows * requiredColumns`)가 10,000을 넘으면 **뮤테이션 전에** `CELL_LIMIT_EXCEEDED`로 거절한다(PIT-0003 — 실행 가능성을 먼저 판정).
4. 덮어쓰기 사각형(`[anchor.row, anchor.row+data.rows.length) x [anchor.column, anchor.column+data.columnCount)`) 안에 걸리는 기존 셀을 제거하고, `data`의 각 셀을 새 `cellId`로 그 위치에 꽂은 **후보 표**를 만든다.
5. 후보 표에 `validateTableGrid`(→ `validateGridCoverage`)를 돌린다. 실패하면(기존 병합 셀이 사각형 경계를 걸쳐서 삐져나옴) 후보를 버리고 `PASTE_MERGE_CONFLICT`로 전체 거절 — **겹침 탐지 로직을 새로 안 쓰고 기존 불변식 검사기를 그대로 재사용**한다. 성공하면 후보 표를 반환한다.

### 6.2 표 밖 붙여넣기(새 표 생성)

같은 함수를 재사용한다: `buildInitialTable({rows: data.rows.length, columns: data.columnCount}, createId)`로 빈 표를 만들고 `pasteInto(emptyTable, {row: 0, column: 0}, data, createId)`를 호출한다. 새 표 생성과 표 안 덮어쓰기가 격자 코드 레벨에서 완전히 하나의 경로다.

## 7. `pasteTabularData` 명령과 붙여넣기 가로채기 (core)

### 7.1 명령

`table-commands.ts`에 추가:

```ts
export const pasteTabularData = (
  editor: Editor,
  data: TabularData,
  createId: IdFactory,
): Result<{ blockId: string }, TableCommandError> => { ... };
```

호출자(명령·붙여넣기 확장 양쪽)는 항상 이 3개 인자만 넘긴다 — 표 안/밖 분기와 삽입 위치는 명령이 `editor.state.selection`에서 직접 유도한다(다른 표 명령들과 동일한 원칙, 호출자가 미리 판정해 넘기지 않는다).

- 캐럿/선택이 표 안(`isInTable`)이면: `getTableCellSelection()`/`selectedRect`로 anchor 셀의 논리 (row, column)을 구해 `applyTableGridOperation(editor, tableBlockId, (t) => pasteInto(t, anchor, data, createId), { selectCellId: ... })`를 호출한다. `selectCellId`는 붙여넣은 영역의 좌상단 셀로 캐럿을 이동시킨다(기존 옵션 재사용, 새 플러밍 없음).
- 표 밖이면: 현재 selection이 속한 최상위 블록을 `$from`에서 찾아(기존 `insertParagraphAfter`/`getCaretBlockContext`가 쓰는 최상위 블록 탐색과 같은 방식) 그 블록 뒤에 새로 만든 표를 끼운다(`insertTable`과 같은 삽입 경로).
- 성공한 생성/확장/값 입력/서식 적용은 `applyTableGridOperation`의 기존 단일 `replaceWith` + `closeHistory` 트랜잭션 경로를 그대로 타므로 원자성(PIT-0003)이 자동으로 유지된다.
- `EditorController.commands.pasteTabularData(data)`로 공개 API에도 노출한다 — 유닛 테스트가 실제 `ClipboardEvent` 없이 직접 호출해 검증할 수 있게 한다(다른 표 명령과 같은 테스트 패턴).

구현 반영(표 밖 분기 계약 개정, Issue #29): 표 밖 붙여넣기는 다른 에디터와 같이 **선택을 대체한다**. selection이 비어있지 않으면 먼저 지우고, 삭제 후 캐럿이 놓인 최상위 블록 뒤에 표를 끼운 다음, 캐럿을 붙여넣은 표의 좌상단 셀 안으로 옮긴다(표 안 분기의 `selectCellId`와 대칭). 선택 삭제·표 삽입·캐럿 이동은 한 트랜잭션이라 undo 1회로 함께 복원된다. 블록 전체 내용을 선택해 지운 경우 남는 빈 문단은 그대로 둔다(블록 자체를 표로 교체하지 않는다 — 최소 변경, undo 예측 가능). 거절 경로(셀 한도 등)는 아무것도 dispatch하지 않으므로 선택도 보존된다(PIT-0003).

구현 반영(오류 보고, Issue #30): `validateTabularData` 실패는 `NOT_RECTANGULAR`가 아니라 `{ code: "TABULAR_DATA_INVALID"; message }`로 보고한다 — io가 만든 원인 message(빈 표/인라인 텍스트/서식 값/열 정렬/격자 커버리지)를 그대로 전달한다. `NOT_RECTANGULAR`는 병합 명령(비직사각형 선택) 전용이다.

### 7.2 붙여넣기 가로채기

`packages/core/src/table-paste-extension.ts`(신규), `table-keyboard-extension.ts`와 동일한 패턴(`Extension.create` + `.configure({ createId })` + `addProseMirrorPlugins`):

```ts
addProseMirrorPlugins() {
  return [new Plugin({
    props: {
      handlePaste: (view, event) => {
        const html = event.clipboardData?.getData("text/html");
        const text = event.clipboardData?.getData("text/plain");
        const parsed = parseClipboardTable({ html, text });
        if (!parsed.ok) return false; // NOT_TABULAR나 CLIPBOARD_TABLE_INVALID -> Tiptap 기본 처리
        const result = pasteTabularData(this.editor, parsed.value, this.options.createId);
        return result.ok; // true = 이벤트 소비
      },
    },
  })];
}
```

`editor-controller.ts`의 extension 목록에 `TableKeyboardNavigationExtension`과 같은 자리에 등록한다.

구현 반영(설계 시 pseudocode 수정): 기본 붙여넣기로 폴백하는 경우는 `NOT_TABULAR` 하나뿐이다. 클립보드가 표로 인식된 뒤에는 파서 거절(`CLIPBOARD_TABLE_INVALID`)이든 명령 거절(`PASTE_MERGE_CONFLICT`, `CELL_LIMIT_EXCEEDED`, `PASTE_TARGET_NOT_FOUND` 등)이든 항상 `true`를 반환해 이벤트만 소비한다. 폴백하면 TSV는 ProseMirror가 `preserveWhitespace`로 파싱해 탭이 그대로 문서에 들어가고(모델↔에디터 영구 desync), HTML은 표 구조가 소실된 텍스트로 뭉개진다 — 둘 다 "전체 거부" 계약 위반이다. 거절된 명령은 아무것도 dispatch하지 않으므로 문서·selection·stored mark는 그대로 보존된다(PIT-0003).

## 8. 오류 계약 확장

- `TableGridError`(core, `table-grid.ts`)에 `CELL_LIMIT_EXCEEDED`, `PASTE_MERGE_CONFLICT` 추가.
- `EditorError`(core, `errors.ts`)에 같은 두 코드 추가.
- `io/errors.ts`에 `ClipboardParseError` 추가: `{code: "NOT_TABULAR"} | {code: "CLIPBOARD_TABLE_INVALID"; message: string}`. io의 공개 `index.ts`에서 `parseClipboardTable`/`TabularData`/`ClipboardParseError`를 export한다.

## 9. Issue #12 처리

같은 세션에서:

1. 원인 분류 — (a) io 파서가 실제로 느린가, (b) vitest 기본 5000ms 타임아웃이 병렬 부하에서 비현실적인가. `pnpm exec vitest run packages/io/test/markdown-round-trip-limits.test.ts`(단독, 통과)와 `pnpm test`(병렬, 실패) 비교, 필요하면 실제 wall-clock을 측정해 원인을 근거로 남긴다.
2. (a)면 import/export 경로 최적화, (b)면 해당 테스트의 타임아웃 또는 fixture 크기를 근거와 함께 조정 — 근거 수치를 Issue #12에 댓글로 기록.
3. spec 13 기준선(10,000셀 로드·선택·붙여넣기·undo) 최초 측정치는 §10의 benchmark 결과로 기록 — Issue #12 완료 조건 3번과 중복 측정하지 않는다.
4. `pnpm test`/`pnpm verify`가 전체 병렬 실행에서 안정적으로 통과함을 확인.

## 10. 성능 benchmark (spec 13)

Playwright e2e에 10,000셀 fixture(예: 100×100)를 대상으로 로드, 셀 범위 선택, 붙여넣기, undo 각각의 wall-clock을 측정해 기록하는 시나리오를 추가한다(`performance.now()` 기준, 콘솔 로그 또는 test annotation). 결과를 `docs/product/performance-baseline.md`(신규)에 최초 측정치·측정 환경(로컬 vs CI, 브라우저 엔진)과 함께 적는다. CI 성능 게이트(중앙값 20% 회귀 판정)는 슬라이스 13 범위이며 이번엔 기록만 한다.

## 11. 기존 두 테스트 교체

계약이 실제로 바뀌므로(핸드오프 지시대로) 삭제가 아니라 교체하고 이유를 커밋 메시지에 남긴다.

- `packages/core/test/editor-controller-table.test.ts:696` "외부 HTML 표 붙여넣기는 표 노드로 파싱되지 않고 문서를 깨뜨리지 않는다" → "외부 HTML 표 붙여넣기가 표 노드로 파싱되고 undo 1회로 복원된다"로 교체.
- `e2e/table-handle.spec.ts:225` "외부 HTML 표를 붙여넣어도 에디터가 깨지지 않는다"(표 미생성을 단언) → 실제 표 생성 + 셀 값 확인 + undo로 교체.

## 12. 테스트 전략

- `packages/core/test/table-grid.property.test.ts`: `pasteInto` 불변식(확장 후에도 3개 불변식 유지, 200회 fast-check) 추가.
- `packages/model/test/`: `validateGridCoverage` 리팩터 회귀(기존 `validateTableGrid` 케이스 전부 그대로 통과) + 신규 제네릭 호출 유닛.
- `packages/io/test/`: `parseClipboardTable` 유닛 — html-table 우선순위, TSV 탭 감지(탭 없는 텍스트는 `NOT_TABULAR`), style 색상/정렬 파싱(유효/무효 값), sanitizer가 `script`/이벤트 핸들러를 계속 차단하는지, `importHtml` 기존 테스트 전부 회귀 없음.
- `packages/core/test/`: `pasteTabularData` 유닛 — 표 안 덮어쓰기, 표 밖 새 표 생성, 자동 확장, 병합 충돌 거절(문서 불변 확인), 10,000셀 초과 거절(문서 불변 확인), undo 1회 복원.
- `e2e/`: Excel/Google Sheets 대표 fixture(고정 HTML 문자열, 실제 두 도구의 클립보드 HTML 구조를 모사) 붙여넣기, TSV 붙여넣기, 10,000셀 benchmark 시나리오, §11 교체된 두 시나리오.

## 13. 완료 기준

Issue #3 슬라이스 11 완료 기준(그대로 인용, 원본은 Issue #3):

- Excel/Google Sheets 대표 fixture가 계약대로 붙는다(표 밖 신규 생성, 표 안 좌상단 기준 덮어쓰기, 부족한 행/열 자동 확장, 병합 충돌·10,000셀 초과 전체 거부).
- 성공한 생성·확장·값 입력·서식 적용이 하나의 트랜잭션이다.
- 검증: `pnpm --filter @cp949/geul-model test`, `pnpm --filter @cp949/geul-io test`, `pnpm --filter @cp949/geul-core test`, `pnpm test`, `pnpm test:e2e`, `pnpm check:boundaries`, `pnpm verify`.

추가(이 설계 문서가 확장한 것):

- Issue #12가 닫히고 `pnpm test`/`pnpm verify`가 병렬 실행에서 안정적으로 통과한다.
- `docs/product/performance-baseline.md`에 spec 13 최초 측정치가 기록된다.
- `ADR-0002`가 `core -> io` 엣지를 반영한다.

## 14. 범위 밖

- `model-to-tiptap.ts:89-94`의 문서 로드 차단 해제 — 슬라이스 12.
- CI 성능 회귀 게이트(20% 임계, 자동 실패) — 슬라이스 13.
- XLSX/CSV 파일 붙여넣기 — R2 이후(spec 14.1).
- 클립보드 HTML의 `mso-*` 전용 속성이나 `background-color` 외 테두리/폰트 등 나머지 서식 — 이번 슬라이스는 색상 2종 + 정렬만 다룬다.
