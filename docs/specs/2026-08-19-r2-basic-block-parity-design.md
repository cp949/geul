# R2 기본 블록 Parity 설계

## 1. 결정 요약

R2는 일반적인 Notion형 문서를 BlockNote 무료 기본 블록 수준으로 작성할 수 있게 한다(roadmap.md R2 사용자 결과). 핵심은 저장 모델에 **재귀 중첩**(`children`)을 도입하고, 그 위에 제목 H4-H6·토글 제목, 인용문·구분선·코드 블록, 목록 4종(글머리·번호·체크·토글), 다중 블록 선택·이동·삭제, 텍스트/블록 색상과 정렬, placeholder·trailing block, 키보드 단축키·입력 규칙, 일반 clipboard(파일 제외)를 쌓는 것이다.

이 명세는 `docs/product/roadmap.md` R2 절과 `docs/product/blocknote-free-feature-inventory.md`의 R2 배정 기능 ID를 구체화한다. 전체 기능 범위와 릴리스 순서는 그 두 문서가 소유하며 이 문서에 복제하지 않는다.

이 세션 시점에 로컬 BlockNote 참조 저장소(`/work/thrd/BlockNote`)가 없다 — 인벤토리의 `features/blocks/*.mdx` 근거는 과거 세션이 남긴 것이고, 이 명세의 BlockNote 동작 서술은 별도로 "확인됨"이라고 표시하지 않는 한 일반 지식에 근거한 추정이다. 슬라이스 9(키보드 단축키·입력 규칙) 착수 시 공개 문서(`docs.blocknote.net`) 또는 npm 패키지 소스로 재확인한다.

## 2. 범위

### 2.1 R2 범위

기능 ID(모두 `NOT_STARTED`, `docs/product/blocknote-free-feature-inventory.md` 기준):

- `DOC-002` 자식 블록 중첩 모델
- `BLK-003` 제목 H4-H6, `BLK-004` 토글 제목
- `BLK-005` 인용문, `BLK-006` 구분선, `BLK-011` 코드 블록
- `BLK-007`~`BLK-010` 글머리·번호·체크·토글 목록
- `UI-004` 다중 블록 선택·이동·삭제
- `UI-006` 블록 중첩·중첩 해제 UI
- `UI-009` placeholder, `UI-010` trailing block
- `UI-011` 기본 키보드 단축키와 입력 규칙
- `INL-008` 글자색, `INL-009` 텍스트 배경색, `INL-010` 블록 글자색·배경색, `INL-011` 블록 텍스트 정렬
- `IO-007` 파일·HTML·Markdown·plain text clipboard(2.2 참고 — 파일은 R2 범위에서 제외)

### 2.2 R2 제외 범위와 roadmap 해석

- `IO-007`은 roadmap에 R2로 배정돼 있으나, 파일 붙여넣기의 실제 목적지인 파일/이미지/비디오/오디오 블록(`BLK-013`~`BLK-016`)은 R3 범위다. R2는 `IO-007`을 **HTML·Markdown·plain text 붙여넣기까지만** 구현하고, 파일 붙여넣기는 R3에서 파일 블록과 함께 완성한다(사용자 승인 완료). `IO-007`은 R2 완료 시점에 `PARTIAL`로 남고, R3 완료 조건에 "파일 붙여넣기 완성"을 추가한다.
- 표 중첩은 범위 밖이다 — `TableBlock`에 `children`을 추가하지 않는다(3.2). 이는 **표 셀 안에 블록을 넣는 것**만 막는다. `TableBlock` 자신은 다른 블록(예: 토글 목록 항목)의 `children` 값으로 들어갈 수 있다 — `indentBlock`/`outdentBlock`은 블록 타입과 무관하게 동작하는 일반 명령이라 표만 예외 취급하지 않는다(5.1). 즉 "표를 들여쓰기"는 R2 범위이고 "표 셀 안에 블록 중첩"만 범위 밖이다.
- R2 이후 기능은 이 명세의 범위가 아니다: 파일/미디어 블록, 확장성 API, Yjs 공동편집, XLSX/CSV, iframe/p5.js.

## 3. 문서 모델

### 3.1 블록 타입 확장

```ts
export type TextMark =
  | { type: "bold" | "italic" | "underline" | "strike" | "code" }
  | { type: "link"; href: string }
  | { type: "textColor"; color: string }
  | { type: "backgroundColor"; color: string };

type TextBlockProps = {
  textColor?: string;
  backgroundColor?: string;
  textAlignment?: "left" | "center" | "right";
};

export type ParagraphBlock = { id: string; type: "paragraph"; content: InlineContent; children?: Block[] } & TextBlockProps;
export type HeadingBlock = {
  id: string;
  type: "heading";
  level: 1 | 2 | 3 | 4 | 5 | 6;
  content: InlineContent;
  isToggleable?: boolean;
  collapsed?: boolean;
  children?: Block[];
} & TextBlockProps;
export type QuoteBlock = { id: string; type: "quote"; content: InlineContent; children?: Block[] } & TextBlockProps;
export type DividerBlock = { id: string; type: "divider" };
export type CodeBlock = { id: string; type: "codeBlock"; language?: string; content: InlineContent };
export type BulletListItemBlock = { id: string; type: "bulletListItem"; content: InlineContent; children?: Block[] } & TextBlockProps;
export type NumberedListItemBlock = { id: string; type: "numberedListItem"; content: InlineContent; startNumber?: number; children?: Block[] } & TextBlockProps;
export type CheckListItemBlock = { id: string; type: "checkListItem"; content: InlineContent; checked: boolean; children?: Block[] } & TextBlockProps;
export type ToggleListItemBlock = { id: string; type: "toggleListItem"; content: InlineContent; collapsed?: boolean; children?: Block[] } & TextBlockProps;

export type Block =
  | ParagraphBlock | HeadingBlock | TableBlock
  | QuoteBlock | DividerBlock | CodeBlock
  | BulletListItemBlock | NumberedListItemBlock | CheckListItemBlock | ToggleListItemBlock;
```

- `TableBlock`은 변경하지 않는다. `DividerBlock`과 `CodeBlock`은 `children`을 갖지 않는다(리프 블록).
- `formatVersion`은 `1`을 유지한다 — 모든 신규 필드가 optional이라 R0/R1 문서는 그대로 유효하다.
- `codeBlock.content`는 `InlineContent` 타입을 재사용하되 값 수준에서 `marks`를 금지한다(4.3).

### 3.2 중첩 블록 모델(`DOC-002`)

- `children?: Block[]`를 중첩 가능한 모든 블록 타입 공통 필드로 둔다. 값이 없거나 빈 배열이면 자식이 없다는 뜻이다(둘을 구분하지 않는다 — `undefined`와 `[]`를 같은 상태로 취급).
- 순환 참조는 구조적으로 불가능하다 — `children`은 부모가 자식 값을 직접 포함하는 트리이며 참조나 포인터가 아니다.
- **전역 ID 유일성**: `id`는 트리 전체(모든 깊이, 모든 블록 타입)에서 유일해야 한다. `model/src/schema.ts`의 `validateBlocks`(id 검사 부분)를 재귀로 바꾼다.
- **재귀 검증**: `validateBlocks`가 각 노드에서 호출하는 `validateContent`(text/link href/link 중복/mark 순서 검사)를 트리 전체에 재귀 적용한다(현재는 최상위 배열 1단만 순회).
- **중첩 깊이 상한**: `MAX_NESTING_DEPTH = 64`. 초과 문서는 `DOCUMENT_LIMIT_EXCEEDED`로 거절한다(테이블 10,000셀 상한과 같은 방어적 목적 — 실사용 들여쓰기로는 도달하지 않지만 조작된 JSON의 재귀 검증 스택 사용을 방어한다).
- 표 셀 콘텐츠는 여전히 `InlineContent`만 담는다 — 표 셀 안에 블록을 중첩하지 않는다(3.1, roadmap 범위 밖).

### 3.3 인라인 색상 mark와 블록 수준 props

- `textColor`/`backgroundColor` mark는 `bold`/`italic`처럼 인라인 텍스트 구간에 적용하는 mark다. 값은 `color: string`(표 셀과 동일한 `#RRGGBB` 대문자 정규형, `isCanonicalCellColor` 재사용 — 이름 변경 여부는 슬라이스 8 구현 시 최소 diff로 결정).
- 한 인라인 아이템에 `textColor`와 `backgroundColor`가 동시에 있을 수 있다. `bold`/`italic`처럼 각 타입은 최대 1개(중복 금지, `mark-canonicalization.ts`의 정규 순서에 편입).
- `TextBlockProps`(`textColor`/`backgroundColor`/`textAlignment`)는 콘텐츠를 갖는 모든 블록(`paragraph`, `heading`, `quote`, 목록 4종)의 공통 optional 필드다. `table`, `divider`, `codeBlock`에는 적용하지 않는다(표는 셀 단위 색상·정렬을 이미 갖고, divider는 콘텐츠가 없고, codeBlock은 구문 강조 색상과 충돌한다).
- 색상 팔레트는 R1 슬라이스 9a에서 승인된 표 셀 고정 팔레트(글자색·배경색 각 8색 + 없음)를 재사용한다 — 별도 팔레트를 만들지 않는다.

## 4. 신규 블록 계약

### 4.1 제목 H4-H6과 토글 제목

- `HeadingBlock.level`을 `1|2|3|4|5|6`으로 확장한다.
- `isToggleable: true`인 heading만 `collapsed`를 가질 수 있다 — `collapsed`가 존재하는데 `isToggleable`이 `true`가 아니면 `DOCUMENT_INVALID`.
- `collapsed: true`인 토글 제목은 `children`을 갖되 편집기 렌더링에서 자식을 숨긴다. 저장 JSON에는 `children`이 항상 온전히 남는다(접힘은 표시 상태이지 데이터 삭제가 아니다).

### 4.2 인용문과 구분선

- `QuoteBlock`은 `paragraph`와 동일한 `InlineContent` + `children` + `TextBlockProps` 계약을 쓴다. 차이는 블록 타입과 HTML 매핑(`blockquote`)뿐이다.
- `DividerBlock`은 콘텐츠도 `children`도 없는 리프 블록이다. HTML 매핑은 `hr`.

### 4.3 코드 블록

- `codeBlock.content`는 `InlineContent`를 재사용하지만 값 수준에서 `marks`가 있으면 안 된다(구문 강조는 `language` 속성 기반 렌더링이지 인라인 mark가 아니다).
- 위반은 두 레이어에서 거절한다(R1 `INVALID_ALIGN` 패턴과 동일한 이유 — 문서 로드 시점 무결성과 대화형 명령 시점 거절을 분리):
  - **model**: `parseDocument`가 `codeBlock` content의 `marks` 존재를 `DOCUMENT_INVALID`로 거절한다(`validateCodeBlockMarks`, `schema.ts`에 추가).
  - **core**: `toggleBold`/`toggleItalic`/`setLink` 등 mark 토글 명령이 caret/selection이 `codeBlock` 안이면 새 `EditorError` 코드 `CODE_BLOCK_MARK_NOT_ALLOWED`로 거절한다(문서 변경 없음).
- `language`는 자유 문자열이다(제어 문자 금지, `string-invariants.ts` 재사용). 특정 하이라이터 언어 목록·구문 강조 렌더링 방식은 이 슬라이스 구현 시 확정한다.
- `codeBlock`은 `children`을 갖지 않는다(리프 블록).
- Tab 처리는 5.2 참고 — 코드 블록 안에서는 셀 탐색도 들여쓰기도 아닌 탭 문자 삽입이다.

### 4.4 목록 4종

- BlockNote와 동일하게 별도 블록 타입 4개로 표현한다(단일 `listItem` + `listType` 판별자 방식은 채택하지 않는다) — 타입별 고유 필드(`startNumber`, `checked`, `collapsed`)가 discriminated union으로 깔끔하게 검증된다.
- `checkListItem.checked`는 필수 `boolean`(생성 시 기본 `false`).
- `numberedListItem.startNumber`는 optional. 값이 없으면 바로 앞 연속된 `numberedListItem` 형제의 번호(또는 그 형제의 명시적 `startNumber`)를 이어받아 1씩 증가한다. 연속이 끊기거나(다른 타입 블록이 사이에 옴) 첫 항목이면 `startNumber` 없이는 1부터 시작한다.
- `toggleListItem.collapsed`는 4.1의 토글 제목과 동일한 의미·저장 규칙을 따른다.
- 목록 항목의 `children`은 하위 목록 항목뿐 아니라 임의 블록(예: 항목 아래 문단)을 담을 수 있다 — 들여쓰기가 "하위 목록"과 "블록 중첩"을 같은 메커니즘으로 표현한다.

## 5. 에디터 코어

### 5.1 명령(신규)

- `setHeadingLevel(blockId, level)` — 기존 `setBlockType`을 확장하지 않고 heading 전용 level 변경으로 분리(문단 등 다른 타입과 신호가 다르다).
- `toggleHeadingCollapse(blockId)`, `toggleListItemCollapse(blockId)`
- `toggleCheckListItemChecked(blockId)`
- `indentBlock(blockId)`, `outdentBlock(blockId)` — 형제 관계를 부모-자식으로 바꾸거나 되돌린다.
- `setBlockTextColor`/`setBlockBackgroundColor`/`setBlockTextAlignment`(선택 블록 범위 또는 caret 블록)
- `toggleInlineTextColor`/`toggleInlineBackgroundColor`(선택 텍스트 범위, 팔레트 값 중 하나 또는 해제)
- `selectBlockRange(fromBlockId, toBlockId)`, `deleteSelectedBlocks()`, `moveSelectedBlocksBefore(beforeBlockId)`
- 각 명령은 기존 표 명령과 동일한 원자성 계약을 따른다 — 하나의 트랜잭션, 실패 시 문서 무변경, undo 1회 정확 복원(PIT-0003).

### 5.2 Tab/Shift+Tab 3분기

우선순위는 다음과 같다(R1 `table-keyboard-extension.ts`가 이미 1번을 구현했다).

1. 캐럿이 표 셀 안 → 기존 `goToNextCell`(셀 탐색, 마지막 셀은 새 행 생성). 변경 없음.
2. 캐럿이 `codeBlock` 안 → 탭 문자(`\t`)를 콘텐츠에 삽입. 들여쓰기·셀 탐색과 무관.
3. 그 외(문단, heading, quote, 목록 항목 등) → `indentBlock`/`outdentBlock`. `outdentBlock`이 적용 불가(최상위 블록)면 키 이벤트만 소비하고 아무 것도 하지 않는다(R1 슬라이스 10의 첫 셀 `Shift+Tab`과 같은 원칙).

### 5.3 다중 블록 선택과 이동

- 선택 범위는 **같은 부모의 형제 블록** 연속 구간으로 제한한다(서로 다른 중첩 깊이에 걸친 비연속 선택은 만들지 않는다 — BlockNote의 `MultipleNodeSelection`과 동일한 제약).
- "이동"은 드래그 재정렬과 상하 이동 버튼 모두를 포함한다(사용자 승인). 이동 대상 블록에 딸린 `children`은 통째로 함께 이동한다.
- 삭제는 선택된 블록과 그 `children`을 통째로 삭제한다.
- ProseMirror에는 다중 노드 selection이 없다(`NodeSelection`은 단일 노드) — 선택 상태는 core가 별도로 관리하는 `blockSelection: { fromBlockId, toBlockId } | null`이며 ProseMirror `Selection`과 독립적이다. React는 이 상태를 읽어 하이라이트만 그린다(7.1 원칙 재사용 — 좌표 계산과 표시만).

## 6. React UX

### 6.1 들여쓰기/내어쓰기 UI

- 서식 툴바에 들여쓰기/내어쓰기 버튼을 추가한다(`UI-006`, inventory가 지정한 위치).
- Tab/Shift+Tab(5.2)과 버튼은 같은 `indentBlock`/`outdentBlock` 명령을 호출한다 — 두 입력 경로가 로직을 중복 구현하지 않는다.

### 6.2 접힘 UI 공유 컴포넌트

- 토글 제목(4.1)과 토글 목록(4.4)은 같은 "접힘 트라이앵글 + children 컨테이너" React 컴포넌트를 공유한다(신규, 이름 미정 — 구현 시 `packages/react/src/collapsible-children.tsx` 후보).
- 접힘 상태는 `collapsed` 문서 필드를 그대로 반영한다(에디터 세션 로컬 상태를 따로 두지 않는다 — 3.1에서 "문서에 저장" 결정).

### 6.3 다중 선택 UI

- R1 슬라이스 4의 drag handle pointer-event 패턴을 재사용해 여러 블록에 걸친 드래그로 `blockSelection`을 만든다.
- 선택 상태에서 삭제 버튼과 상하 이동 버튼을 노출한다(플로팅 툴바, `TableSelectionToolbar`와 같은 배치 원칙).

### 6.4 placeholder와 trailing block

- 빈 블록에 타입별 placeholder 텍스트를 표시한다(예: "글을 입력하세요", "제목", 목록 항목 placeholder). 저장 JSON에 포함하지 않는다 — 순수 렌더링.
- 문서 끝에는 항상 편집 가능한 마지막 블록(`paragraph`)이 있어야 한다. 사용자가 문서 끝 블록을 지우거나 다른 타입으로 바꾸면 core가 자동으로 빈 `paragraph`를 추가한다.

### 6.5 색상 팔레트

- 인라인 색상 툴바(글자색/배경색)와 블록 색상 메뉴는 R1 표 셀 색상 메뉴와 같은 컴포넌트를 재사용하거나(가능하면) 같은 팔레트 상수를 공유하는 별도 컴포넌트로 만든다 — 팔레트 값 자체는 3.3에서 이미 고정했다.

## 7. 문서 입출력

### 7.1 HTML 계약 확장

- H4-H6 → `h4`~`h6`. 토글 제목/토글 목록의 `collapsed` → `<details open={!collapsed}>`류 표현(정확한 매핑은 슬라이스 착수 시 확정, `isToggleable`이 없으면 일반 heading으로 export).
- 인용문 → `blockquote`(children은 blockquote 안에 중첩 HTML로).
- 구분선 → `hr`.
- 코드 블록 → `<pre><code class="language-...">`(language 없으면 class 생략).
- 목록 4종 → `ul`/`ol`(`start` 속성 매핑)/체크박스는 `input[type=checkbox][disabled]` 또는 `data-checked` 속성(정확한 형태는 슬라이스 착수 시 확정) / 토글은 `details`.
- 인라인 색상 → `style="color:...; background-color:..."`.
- 블록 색상/정렬 → 블록 wrapper의 `style`/`data-*` 속성(표 셀과 같은 방식).
- 중첩 `children`은 해당 HTML 요소 안에 재귀적으로 중첩된 HTML로 표현한다.

### 7.2 GFM 계약 확장과 손실 정책

R0/R1과 동일한 strict/lossy 계약을 그대로 적용한다(새 규칙을 만들지 않는다, CONTEXT.md의 strict/lossy export 정의, `PIT-0005`와 같은 패턴).

- GFM이 직접 표현 가능한 것: H1-H6(H4-H6도 `####`~`######`로 표현 가능), 인용문(`>`), 구분선(`---`), 코드 블록(펜스 코드 블록, language 포함), 글머리·번호 목록(`start` 속성 포함), 체크 목록(`- [ ]`/`- [x]`), 중첩(들여쓰기).
- GFM이 표현할 수 없는 것: 토글(제목/목록의 `collapsed`·`isToggleable` 자체), 인라인 색상, 블록 색상, 블록 정렬.
  - `strict` export는 이 중 하나라도 문서에 있으면 실패하고 구조화된 손실 정보(블록 ID, 기능 종류)를 반환한다.
  - `lossy` export는 토글을 일반 목록/heading으로 낮추고(접힘 상태·`isToggleable` 정보만 버림, 콘텐츠는 보존), 색상·정렬을 버리고, 각 손실을 경고 목록에 기록한다.
- GFM import는 토글 문법이 없으므로 토글을 만들지 않는다. 체크 목록(`- [ ]`)은 `checkListItem`으로, 번호 목록의 시작 값은 `startNumber`로 매핑한다.

### 7.3 일반 clipboard(`IO-007`, 2.2에서 파일 제외)

- 우선순위: `text/html`(구조 보존) → GFM Markdown 텍스트 감지 시 Markdown 파서 → 그 외 `text/plain`.
- HTML 붙여넣기는 7.1 계약과 동일한 sanitizer·매핑을 재사용한다(문서 HTML import와 다른 경로를 만들지 않는다 — R1 슬라이스 11의 표 클립보드가 문서 HTML sanitizer를 재사용한 것과 같은 원칙).
- 표 붙여넣기(R1 `TablePasteExtension`)와의 경계: 클립보드에 표 형태의 `text/html`이 있으면 R1 계약이 우선한다 — 이 슬라이스는 표가 아닌 콘텐츠(문단, 목록, heading 등)의 붙여넣기만 다룬다.
- 파일이 클립보드에 있고 대체 가능한 HTML/텍스트 표현이 없으면(예: 이미지 파일 단독) 이벤트를 소비하지 않고 무시한다 — R3에서 파일 블록과 함께 처리한다(2.2).

## 8. 오류 계약 확장

`packages/core/src/errors.ts`의 `EditorError` union에 추가:

- `CODE_BLOCK_MARK_NOT_ALLOWED`(4.3)

`packages/model`의 `DOCUMENT_INVALID`/`DOCUMENT_LIMIT_EXCEEDED`를 재사용(전용 코드를 새로 만들지 않음):

- 재귀 중첩 깊이 초과(3.2) → `DOCUMENT_LIMIT_EXCEEDED`
- `codeBlock` content의 mark 위반(4.3, 로드 시점) → `DOCUMENT_INVALID`
- `collapsed`가 있는데 `isToggleable`이 아닌 heading(4.1) → `DOCUMENT_INVALID`
- 전역 ID 중복(3.2, 트리 전체) → `DOCUMENT_INVALID`

## 9. 검증 전략

R1 `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md` 12절의 전략을 R2 대상으로 확장한다 — 새 카테고리만 기록한다.

- **모델 단위 테스트**: 재귀 `children` round-trip, 전역 ID 유일성(깊은 중첩 포함), 깊이 상한 거절, `codeBlock` mark 거절, heading `collapsed`/`isToggleable` 불변식.
- **입출력 단위 테스트**: HTML/GFM 신규 요소 round-trip(7.1), GFM strict 실패 케이스(토글·색상·정렬), GFM lossy 손실 경고, IO-007 clipboard 우선순위 fixture.
- **코어 통합 테스트**: 각 신규 명령의 단일 트랜잭션·무변경 실패, `indentBlock`/`outdentBlock`의 3분기 Tab 라우팅, 다중 선택 삭제/이동의 `children` 동반 이동.
- **Playwright**: 슬라이스마다 Chromium 시나리오, 슬라이스 11에서 3-엔진 전체 게이트(R1과 동일한 순서).

## 10. 후속 확장 경계

- R3가 파일 블록을 추가하면 `IO-007`의 파일 붙여넣기를 완성한다(2.2) — 이 명세는 파일 붙여넣기의 형태를 선결정하지 않는다.
- 표 셀 안 블록 중첩, 표 블록 자체의 문서 내 중첩은 이 명세의 범위가 아니다. 필요해지면 별도 설계가 있어야 한다(3.2).
- Yjs 공동 편집(R6)의 다중 선택·중첩 이동 충돌 정책은 이 명세가 선결정하지 않는다(기존 `TableGrid`/CRDT 확장 경계와 같은 원칙).

## 11. R2 완료 조건

roadmap.md R2 완료 조건 4개를 그대로 인용한다(약화·추가하지 않음).

- 모든 기본 블록이 생성, 종류 변경, 중첩, 이동, 저장과 복원된다.
- 목록 번호·체크·토글 상태가 round-trip된다.
- 다중 선택 조작과 undo가 브라우저에서 검증된다.
- 일반 clipboard 우선순위와 fallback이 fixture로 고정된다(2.2 — 파일 부분은 `PARTIAL`로 남고 이 조건은 HTML/Markdown/plain text 범위로 판정한다).
