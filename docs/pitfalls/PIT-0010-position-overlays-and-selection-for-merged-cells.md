# PIT-0010 병합 셀에서는 오버레이 hit-test와 selection 이동을 명시적으로 다룬다

- 상태: `ACTIVE`
- 적용 영역: react (table overlay), core (table command)
- 최초 근거: R1 슬라이스 8(셀 범위 선택, 병합/분할)

## 상황과 징후

1. 두 열을 병합한 뒤 그 셀 한가운데를 클릭하면 캐럿이 놓이지 않고 대신 열 리사이즈 드래그가 시작된다(`document.elementFromPoint`로 실측: 클릭 지점의 최상단 요소가 `<td>`가 아니라 `[data-be-table-resize-handle]`).
2. 셀 병합/분할 명령 직후 별도 조작 없이 결과 셀에 캐럿이 있기를 기대했지만, `tr.replaceWith`로 표 서브트리 전체를 바꾸면 selection이 문서 뒤쪽의 예측 불가능한 셀(대개 표의 마지막 셀)로 떨어진다.
3. (환경 의존, 근본 원인 미확정) 내용이 비어 있는 병합 셀은 클릭이나 화살표 키로 캐럿을 옮기지 못하는 경우가 headless Chromium에서 관측됐다. 같은 셀에 텍스트가 있으면(우리 자신의 병합 직후 selection 이동으로 캐럿을 둔 뒤 타이핑한 경우 포함) 이후 클릭은 정상 동작한다.
4. 셀 하나를 삼중 클릭하면 병합할 대상이 하나뿐인데도 선택 툴바에 "Merge cells"가 떴다. 눌러도 표는 그대로지만 undo 단계가 하나 쌓여, 사용자의 다음 `Ctrl+Z`가 눈에 보이는 변화 없이 소모된다(실제 Chromium에서 `.selectedCell` 1개 + 버튼 노출로 재현).
5. 표 오버레이 geometry를 한 번 읽을 때 셀 `getBoundingClientRect()` 호출이 열 개수만큼 반복됐다. 열 경계와 리사이즈 세그먼트가 각각 DOM을 다시 훑었기 때문이다(10,000셀 표라면 한 번의 pointermove에 백만 번대).
6. 셀 범위에 색상이나 정렬을 적용하면 문서 내용은 바뀌지만 `CellSelection`이 `TextSelection`으로 무너져 선택 툴바가 사라졌다. 같은 범위에 여러 서식을 연속 적용하려면 매번 다시 선택해야 했다.

## 근본 원인

1. `table-handles.tsx`의 열 리사이즈 strip은 열 경계마다 표 전체 높이(top~bottom)를 덮는 하나의 `<div>`였다. 두 열을 병합하면 그 경계가 병합 셀의 시각적 한가운데로 옮겨가는데, strip은 여전히 그 x좌표에 전체 높이로 남아 셀 클릭을 가로챈다.
2. `applyTableGridOperation`(`table-commands.ts`)이 표 서브트리를 통째로 `replaceWith`하면서 새 selection을 지정하지 않으면, ProseMirror의 기본 매핑이 옛 selection을 새 문서의 "가까운 유효 위치"로 클램프한다 — 이 위치는 사용자가 기대하는 "방금 만든/남은 셀"과 무관하다.
3. 원인 미확정. `document.getSelection()`(네이티브 브라우저 selection)과 `elementFromPoint`는 병합 셀을 정확히 가리키는데, `tiptapEditor.state.selection`(ProseMirror 내부 상태)만 갱신되지 않는 비대칭이 재현됐다 — `@tiptap/pm/tables`의 `handleMouseDown$1`(빈 클릭에서는 selection을 직접 설정하지 않고 드래그 감지용 리스너만 단다)과 ProseMirror 기본 클릭 처리 사이 상호작용, 또는 headless/Xvfb 환경 특유의 이벤트 타이밍일 가능성이 있으나 라이브러리 소스 레벨로 확정하지 못했다.
4. `@tiptap/pm/tables`의 `tableEditing`은 `handleTripleClick`과 `normalizeSelection`에서 셀 하나만 감싸는 `CellSelection`을 만든다. "CellSelection = 범위 선택"으로 판정하면 이런 축약 선택까지 병합 후보가 된다. prosemirror-tables 자신의 `mergeCells`는 `$anchorCell.pos == $headCell.pos`를 명시적으로 거절한다. 결과 표가 입력과 같아도 `tr.replaceWith`는 `ReplaceStep`을 만들기 때문에 문서는 그대로인 채 revision과 history만 오른다.
5. `readColumnBounds`와 `readResizeSegments`가 각각 행/셀 DOM을 다시 조회했다. 세그먼트는 열마다 호출되므로 rect 호출이 (열 수) x (전체 셀 수)로 늘어난다.
6. 셀 서식 명령도 `applyTableGridOperation`에서 표 서브트리 전체를 `replaceWith`한다. 구조는 같아도 교체 범위 안의 `CellSelection` anchor/head는 ProseMirror 기본 매핑으로 복구되지 않는다.

## 예방 규칙

- 열/행 경계에 표 전체 높이로 걸치는 오버레이(리사이즈 strip 등)를 놓을 때는, 그 경계가 실제로 각 행에서 "진짜 셀 경계"인지 행 단위로 확인한다. 병합 셀이 경계를 가로지르는 행에서는 그 구간을 strip에서 뺀다(`readResizeSegments`처럼 행별 세그먼트로 분할).
- 표 서브트리를 통째로 교체하는 명령(병합, 분할, 그리고 향후 유사한 구조 변경 명령)은 selection을 옛 상태의 매핑에 맡기지 말고, 결과 문서에서 사용자가 다음에 있어야 할 셀의 `cellId`를 결정해 `TextSelection.near`로 명시 이동한다(`duplicateBlock`이 복제본 끝으로 커서를 옮기는 것과 같은 원칙).
- 표 서브트리를 교체하지만 선택 범위의 셀 ID가 그대로인 서식 명령은 교체 전 `CellSelection` anchor/head를 `cellId`로 저장하고 새 표에서 `CellSelection`을 재구성한다. 병합 셀 안의 커서 `TextSelection`도 교체 전후 좌표를 명시 보존한다. 연속 서식 적용 시나리오로 툴바 유지를 검증한다.
- 셀 병합/분할처럼 셀 내용이 비어 있을 수 있는 명령을 만들 때는, "명령이 캐럿을 셀 안에 두는지"를 유닛 테스트로 고정한다(`editor.state.selection.$from.parent.attrs.cellId`) — 클릭으로 빈 셀에 진입하는 경로가 불안정할 수 있다는 전제하에, 프로덕트 동작이 클릭 성공 여부에 의존하지 않게 만든다.
- 새로 병합/추가된 빈 셀을 대상으로 하는 e2e 시나리오는 가능하면 "명령 직후 자동으로 이동된 selection"을 검증하고, 이후 상호작용(추가 클릭)이 필요한 시나리오는 실제 브라우저(비-headless 포함)에서 먼저 재현을 확인한 뒤 작성한다.
- 선택 상태로 UI를 여는 판정은 "선택 타입"이 아니라 "그 조작이 실제로 바꿀 대상이 있는가"로 한다. 셀 범위 선택이면 `TableMap`에서 서로 다른 기준 셀이 2개 이상인지 세고, 하나뿐이면 병합이 아닌 분할 후보로 넘긴다.
- 결과가 입력과 같은 표 연산은 격자 함수가 **입력 표를 참조 그대로** 반환한다(`moveRow`/`resizeColumn`/`splitCell`과 같은 규약). `applyTableGridOperation`이 이 참조 동일성으로 no-op을 알아보고 트랜잭션 자체를 만들지 않는다 — 문서가 안 바뀌어도 트랜잭션을 만들면 undo 단계가 쌓인다.
- 표 오버레이 geometry는 행/셀 rect를 한 번만 읽어 재사용한다. 열 경계, 리사이즈 세그먼트처럼 같은 rect에서 파생되는 값이 각자 DOM을 다시 훑으면 rect 호출이 열 수만큼 곱해진다(spec 13 성능 계약).
- 스크롤/리사이즈로 값이 바뀌는 뷰포트 좌표를 React `key`에 넣지 않는다. 드래그 중 스크롤 한 번에 오버레이가 통째로 remount된다 — 세그먼트 key는 `rowId`처럼 안정된 값으로 만든다.

## 검증 방법

```bash
pnpm --filter @cp949/geul-core test
pnpm --filter @cp949/geul-react test
pnpm test:e2e
```

## 실제 근거

- `packages/react/src/table-handles.tsx`의 `readResizeSegments`/`ColumnGeometry.resizeSegments` — 열 경계 strip을 행 단위로 분할.
- `packages/core/src/table-commands.ts`의 `applyTableGridOperation` `options.selectCellId`, `findCellOffset`(`.content`) — 병합/분할 직후 결과 셀로 selection을 명시 이동.
- `packages/core/src/table-commands.ts`의 `options.preserveSelection`, `findCellOffset`(`.boundary`) — 셀 서식 적용 전후 `CellSelection` anchor/head와 병합 셀 커서 `TextSelection` 보존.
- `e2e/table-format.spec.ts`의 "셀 범위를 다시 선택하지 않고 색상과 정렬을 연속 적용한다"/"병합 셀 커서를 유지하며 색상과 정렬을 연속 적용한다".
- `packages/core/test/table-commands.test.ts`의 "병합 직후 캐럿을 병합된 셀 안으로 옮긴다"/"분할 직후 캐럿을 분할 대상이었던 셀 안에 유지한다".
- `packages/core/src/editor-controller.ts`의 `coversMultipleCells`/`getTableCellSelection` — 단일 셀 `CellSelection`을 병합 후보에서 제외하고 분할 판정으로 넘김.
- `packages/core/src/table-grid.ts`의 `mergeCells` no-op 분기와 `packages/core/test/table-grid.test.ts`의 "...입력 표를 참조 그대로 반환한다" 2건.
- `packages/react/src/table-handles.tsx`의 `readRowBoxes` — 행/셀 rect 1회 읽기, `ResizeSegment.rowId` 안정 key.
- `e2e/table-cell-selection.spec.ts`의 "셀 하나만 삼중 클릭한 선택에는 병합 버튼을 노출하지 않는다"/"병합된 셀을 삼중 클릭하면 분할 버튼을 노출한다".
- R1 슬라이스 8 Issue [#3](https://github.com/cp949/geul/issues/3) 댓글에 `elementFromPoint`/`tiptapEditor.state.selection` 실측 과정과 리뷰 라운드 결과를 기록함.

## 관련 문서

- [PIT-0003 편집기 트랜잭션 원자성 유지](./PIT-0003-keep-editor-transactions-atomic.md)
- [PIT-0009 UI를 닫는 키보드 핸들러는 병렬 e2e로 검증](./PIT-0009-verify-keyboard-close-with-parallel-e2e.md)
