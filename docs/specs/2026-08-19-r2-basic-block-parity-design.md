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
- R2 완료 조건 1(11절)의 "종류 변경"은 콘텐츠 블록을 대상으로 한다 — 표와 구분선은 제외한다(표는 R1부터 Turn into 목록 밖이다)(사용자 승인 완료 2026-08-28, Issue #38 슬라이스 3).
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
- `codeBlock.content`는 `InlineContent` 타입을 재사용하지만 plain-text source의 정규 저장형은 빈 source의 `[]` 또는 비어 있지 않은 source의 `[{ text: source }]` 두 형태뿐이다. 빈 text run, text run 2개 이상과 `marks` key는 `DOCUMENT_INVALID`다(4.3). HTML/GFM round-trip은 이 단일 source 문자열의 동등성을 판정한다.

### 3.2 중첩 블록 모델(`DOC-002`)

- `children?: Block[]`를 중첩 가능한 모든 블록 타입 공통 필드로 둔다. 값이 없거나 빈 배열이면 자식이 없다는 뜻이다(둘을 구분하지 않는다 — `undefined`와 `[]`를 같은 상태로 취급).
- 순환 참조는 구조적으로 불가능하다 — `children`은 부모가 자식 값을 직접 포함하는 트리이며 참조나 포인터가 아니다.
- **전역 ID 유일성**: `id`는 트리 전체(모든 깊이, 모든 블록 타입)에서 유일해야 한다. `model/src/schema.ts`의 `validateBlocks`(id 검사 부분)를 재귀로 바꾼다.
- **재귀 검증**: `validateBlocks`가 각 노드에서 호출하는 `validateContent`(text/link href/link 중복/mark 순서 검사)를 트리 전체에 재귀 적용한다(현재는 최상위 배열 1단만 순회).
- **중첩 깊이 상한**: `MAX_NESTING_DEPTH = 64`. 초과 문서는 `DOCUMENT_LIMIT_EXCEEDED`로 거절한다(테이블 10,000셀 상한과 같은 방어적 목적 — 실사용 들여쓰기로는 도달하지 않지만 조작된 JSON의 재귀 검증 스택 사용을 방어한다). 이 거절은 JSON 문서 로드(`parseDocument`) 계약이다 — HTML import는 상한 초과 중첩을 거절 대신 평탄화한다(7.1, Issue #132).
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
- 정정(2026-09-13, roadmap-workflow RD-001~004): 위 토글 제목(`isToggleable`/`collapsed`) 계약은 전량 폐기됐다 — Notion parity가 아니라 이 문서 자체가 근거였던 BlockNote 무료 기능 parity 체크리스트만으로 구현됐고 실사용 근거·배포 이력이 없어 사용자 판단으로 제거했다(`docs/product/blocknote-free-feature-inventory.md` `BLK-004`). `HeadingBlock`에는 이제 `isToggleable`/`collapsed` 필드가 없다. 같은 절의 `toggleListItem`(4.4, `BLK-010`)은 별개 블록 타입이라 이 정정과 무관하게 유지된다.

### 4.2 인용문과 구분선

- `QuoteBlock`은 `paragraph`와 동일한 `InlineContent` + `children` + `TextBlockProps` 계약을 쓴다. 차이는 블록 타입과 HTML 매핑(`blockquote`)뿐이다.
- `DividerBlock`은 콘텐츠도 `children`도 없는 리프 블록이다. HTML 매핑은 `hr`.

### 4.3 코드 블록

- `codeBlock.content`는 `InlineContent`를 재사용하지만 plain-text source 하나만 저장한다. 빈 source는 `[]`, 비어 있지 않은 source는 정확히 `[{ text: source }]`다. 빈 text run, text run 2개 이상과 `marks` key는 정규 저장형이 아니므로 `DOCUMENT_INVALID`다. 인접 run 경계는 사용자 의미가 아니며 별도 metadata로 인코딩하지 않는다.
- code source 문자열은 LF(`U+000A`)와 Tab(`U+0009`)을 허용한다. 나머지 C0 control, DEL과 invalid surrogate는 거절한다. 일반 `InlineContent`의 LF-only 문자열 불변식은 바꾸지 않고 CodeBlock 전용 검증을 둔다.
- 위반은 두 레이어에서 거절한다(R1 `INVALID_ALIGN` 패턴과 동일한 이유 — 문서 로드 시점 무결성과 대화형 명령 시점 거절을 분리):
  - **model**: `parseDocument`가 위 content 정규형·문자 불변식·mark 금지를 검증하고 위반을 `DOCUMENT_INVALID`로 거절한다.
  - **core 공개 command**: caret이 CodeBlock 안이거나 selection이 CodeBlock을 한 글자라도 교차하면 `toggleBold`/`toggleItalic`/`toggleUnderline`/`toggleStrike`/`toggleCode`/`setLink`/`unsetLink` 전체를 새 `EditorError` 코드 `CODE_BLOCK_MARK_NOT_ALLOWED`로 거절한다. document, ProseMirror document, selection, stored mark, revision과 change event는 모두 바뀌지 않는다. 정정(2026-10-05, Issue #264): 교차 대상은 보이는 CodeBlock이다. 접힌 `toggleListItem`의 숨은 CodeBlock은 교차로 치지 않는다(4.4). 같은 판정을 쓰는 단축키와 React 툴바 mark 버튼도 같다. 붙여넣기의 CodeBlock 분기는 범위 전체 판정이라 숨은 CodeBlock도 본다. 단 `text/html`이거나 여러 줄 평문이고 시작이 CodeBlock 밖이면 7.3의 정정(2026-10-07, Issue #286·#285)이 우선한다.
  - **DOM/StarterKit 단축키**: 같은 selection 조건에서 `Mod-b`·`Mod-i`·`Mod-e`·`Mod-Shift-s` 등 mark 단축키를 소비하고 완전한 no-op으로 처리한다. DOM 경로에는 오류 반환 호출자가 없으므로 외부 오류 callback을 신설하지 않는다.
- `language`는 optional 자유 문자열이지만 빈 문자열은 `DOCUMENT_INVALID`다. 제어 문자는 기존 문자열 불변식으로 거절한다. known alias만 trim·case-insensitive하게 canonical ID로 바꾸고 unknown은 공백·대소문자를 포함해 exact 보존한다. 신규 CodeBlock과 UI에서 비운 language draft는 `"text"`를 저장한다. 미지정 필드는 유효한 기존 상태이며 로드에서 `"text"`를 강제 삽입하지 않는다.
- known alias는 `plain text`/`none`→`text`, `js`→`javascript`, `ts`→`typescript`, `sh`/`shell`→`bash`, `py`→`python`, `md`→`markdown`이다. syntax highlighting과 highlighter dependency는 이 슬라이스 범위가 아니며 R5 `BLK-017`의 잔여 범위다.
- `codeBlock`은 `children`을 갖지 않는다(리프 블록).
- Tab 처리는 5.2를 따른다. 저장 가능한 literal Tab과 키보드 Tab의 indentation UX는 별도 계약이다.

### 4.4 목록 4종

- BlockNote와 동일하게 별도 블록 타입 4개로 표현한다(단일 `listItem` + `listType` 판별자 방식은 채택하지 않는다) — 타입별 고유 필드(`startNumber`, `checked`, `collapsed`)가 discriminated union으로 깔끔하게 검증된다.
- `checkListItem.checked`는 필수 `boolean`(생성 시 기본 `false`).
- `numberedListItem.startNumber`는 optional. 명시 값은 저장 시 정수 `0..999999999`만 허용한다. GFM/HTML `ol[start]`와의 교집합에서 음수·소수·표현 불가능하게 큰 시작값을 모델 단계에서 제외해 변환 경로마다 의미가 갈리지 않게 한다. 값이 없으면 바로 앞 연속된 `numberedListItem` 형제의 번호(또는 그 형제의 명시적 `startNumber`)를 이어받아 1씩 증가한다. 연속이 끊기거나(다른 타입 블록이 사이에 옴) 첫 항목이면 `startNumber` 없이는 1부터 시작한다.
- `toggleListItem.collapsed`는 4.1의 토글 제목과 동일한 의미·저장 규칙을 따른다. 정정(2026-10-05, Issue #264): 숨은 자손은 조상 중 접힌 `toggleListItem`이 하나라도 있는 블록이다. 접힌 toggle의 라벨은 보인다. 블록 단위 수집은 보이는 블록만 본다. 대상은 `getSelectionBlocks()`와 그 결과로 부르는 여러 블록 타입 변환·blocker 판정, 그리고 CodeBlock 교차 판정(4.3)이다. 숨은 그룹은 화면에 없어 편집 대상이 아니기 때문이다(5.1 #252·#253 정정과 같은 원칙). 텍스트 범위 연산은 범위 전체를 본다. 대상은 mark 적용·active 판정, 범위 삭제, 붙여넣기다. 그래서 범위 mark는 숨은 일반 텍스트에도 적용된다. 명시적 id로 숨은 블록을 넘긴 `setBlockTypes`·`getBlockTypesBlocker` 호출은 거르지 않는다. 호출자 책임이다. 접힌 toggle 자신을 다른 타입으로 바꾸면 접힘이 사라져 자식이 드러난다.
- 목록 항목의 `children`은 하위 목록 항목뿐 아니라 임의 블록(예: 항목 아래 문단)을 담을 수 있다 — 들여쓰기가 "하위 목록"과 "블록 중첩"을 같은 메커니즘으로 표현한다.

## 5. 에디터 코어

### 5.1 명령(신규)

- `setHeadingLevel(blockId, level)` — 기존 `setBlockType`을 확장하지 않고 heading 전용 level 변경으로 분리(문단 등 다른 타입과 신호가 다르다).
  - 정정(2026-08-28, Issue #38 슬라이스 3): `setHeadingLevel`을 신설하지 않는다 — heading level 변경은 기존 `setBlockType`이 단일 경로로 소유한다(`setBlockType(blockId, { type: "heading", level })`). 근거: `packages/core/src/editor-controller.ts`의 `setBlockType`이 이미 현재 블록의 level을 읽어 동일 타입·동일 level 재적용을 `COMMAND_NOT_APPLICABLE`로 거절하고(`clearContent` 옵션으로 콘텐츠를 비우는 호출은 예외) level attr 적용까지 소유하며, React 소비 표면 3곳(슬래시 메뉴 `slash-menu.tsx`, 서식 툴바 `formatting-toolbar.tsx`, 블록 메뉴 Turn into `block-side-menu.tsx`)이 전부 이 경로를 쓴다. 원문의 전제("문단 등 다른 타입과 신호가 다르다")와 달리 level은 `setBlockType`의 heading 대상 인자에 이미 포함돼 있어 별도 명령을 두면 같은 로직이 두 경로에 중복된다 — 모든 입력 경로가 같은 명령을 호출하고 로직을 중복 구현하지 않는다(6.1과 같은 원칙).
- `insertDivider(afterBlockId, options?: { clearAfterBlockText?: boolean })` — 구분선 삽입 전용 명령이다. `setBlockType`의 변환 대상이 아니다(content 폐기형 변환을 Turn into·툴바에 열지 않는다 — 표와 같은 원칙)(사용자 승인 완료 2026-08-28, Issue #38 슬라이스 3).
- `setBlockType`은 paragraph·heading·quote·`bulletListItem`·`numberedListItem` 사이의 종류 변경을 단일 공개 경로로 소유한다. numbered command 입력은 `startNumber?: number | null`이다. 기존 numbered에 필드를 생략하면 현재 명시값을 보존하고, 다른 타입을 numbered로 바꾸며 생략하면 미지정으로 만든다. `null`은 명시값을 제거한다. 같은 최종 상태 재적용과 정수 `0..999999999` 밖 값은 mutation 전 `COMMAND_NOT_APPLICABLE`로 거절한다. 목록과 CodeBlock 사이의 양방향 종류 변경은 `clearContent` 여부와 무관하게 `COMMAND_NOT_APPLICABLE`다(RD-004). caret·selection 조회 descriptor는 저장 정규형과 같은 `startNumber?: number`만 보고하며 `null`을 노출하지 않는다(RD-005)(사용자 승인 완료 2026-08-30, Issue #38 슬라이스 5 RD-004/RD-005). 문단·heading·quote·callout을 CodeBlock으로 바꿀 때 mark를 잃고 hardBreak는 개행(`\n`)으로 옮긴다. CodeBlock에서 되돌릴 때는 개행을 hardBreak로 복원한다. 변환 뒤 selection offset은 hardBreak를 개행 하나로 센다(Issue #226).
- `toggleHeadingCollapse(blockId)`, `toggleListItemCollapse(blockId)`
- `toggleCheckListItemChecked(blockId)`
- `indentBlock(blockId)`, `outdentBlock(blockId)` — 형제 관계를 부모-자식으로 바꾸거나 되돌린다.
- `setBlockTextColor`/`setBlockBackgroundColor`/`setBlockTextAlignment`(선택 블록 범위 또는 caret 블록)
- `toggleInlineTextColor`/`toggleInlineBackgroundColor`(선택 텍스트 범위, 팔레트 값 중 하나 또는 해제)
- `selectBlockRange(fromBlockId, toBlockId)`, `deleteSelectedBlocks()`, `moveSelectedBlocksBefore(beforeBlockId)`
- 각 명령은 기존 표 명령과 동일한 원자성 계약을 따른다 — 하나의 트랜잭션, 실패 시 문서 무변경, undo 1회 정확 복원([`G-EDT-001`](../guides/G-EDT-001-keep-editor-commands-atomic.md)).

#### 네이티브 블록 split/join

- `paragraph`/`heading`/`quote`의 Enter split은 `blockContainer(content: "blockContent blockGroup?")`를 직접 재구성하는 커스텀 경로가 소유한다. 범위 선택이면 선택 삭제와 분할을 같은 트랜잭션에 쌓는다. 산출 문서는 스키마에 유효하고 원본 컨테이너의 `blockId`와 기존 자식의 순서·귀속을 보존한다. 새 컨테이너의 `blockId`는 같은 `view.dispatch` 처리 중 `BlockIdExtension.appendTransaction`의 별도 트랜잭션에서 다른 값으로 최종화된다. 캐럿은 두 위치 분기 모두 새 블록 콘텐츠 시작에 결정적으로 놓인다. 성공한 split과 ID 최종화는 단일 `view.dispatch`로 처리되고 undo 1회로 함께 복원된다([`G-EDT-001`](../guides/G-EDT-001-keep-editor-commands-atomic.md), [`G-EDT-003`](../guides/G-EDT-003-design-pm-block-node-schemas-and-group-fill-contracts.md)).
- `paragraph`/`heading`/`quote` Enter split의 위치는 원본의 기존 자식 유무로 정한다. 자식이 없으면 새 블록을 원본의 다음 형제로 삽입한다. 기존 자식이 있으면 새 블록을 원본의 첫 자식, 즉 기존 첫 자식 앞에 삽입한다. 분할 뒤 콘텐츠(`afterContent`)가 비면 새 콘텐츠는 빈 `paragraph`이고, 비지 않으면 원본 콘텐츠 노드 타입과 attrs를 유지한다. 정정(2026-10-04, Issue #252): 접힌 `toggleListItem`은 자식이 있어도 새 블록을 원본의 다음 형제로 삽입한다. 숨은 그룹에 새 블록이 생기면 화면 변화 없이 보이지 않는 데이터가 쌓이기 때문이다. 원본은 접힘과 기존 자식 그룹을 유지하고, 새 형제는 접힘 없는 `toggleListItem`이다.
- 비어 있지 않은 `bulletListItem`/`numberedListItem`의 Enter는 캐럿 기준으로 같은 목록 타입을 split한다. 원본 컨테이너의 `blockId`와 attrs는 유지하고 새 `numberedListItem`에는 명시 시작점인 `startNumber`를 복제하지 않는다. 자식이 없으면 새 항목을 원본의 다음 형제로, 기존 자식이 있으면 원본의 첫 자식이자 기존 첫 자식 앞에 둔다. 새 컨테이너의 `blockId`는 위 split과 같은 단일 `view.dispatch` 처리 중 `BlockIdExtension.appendTransaction`의 별도 트랜잭션으로 최종화한다. 캐럿은 새 항목 콘텐츠 시작에 놓이고 revision/event와 undo 단위는 각각 1회다.
- 빈 `bulletListItem`/`numberedListItem`의 Enter는 새 항목을 만들지 않고 현재 항목을 `paragraph`로 전환해 목록을 종료한다. 원본 컨테이너의 `blockId`, `children`, 부모 안 위치와 중첩 깊이를 보존하고 `startNumber`는 제거한다. 타입 전환과 새 paragraph 시작 selection을 단일 트랜잭션에 담아 revision/event와 undo 단위를 각각 1회로 유지한다. 이 목록 전용 규칙은 앞의 `paragraph`/`heading`/`quote` split 계약을 바꾸지 않는다.
- 목록 항목(`bulletListItem`/`numberedListItem`/`checkListItem`/`toggleListItem`) 선두의 Backspace는 문서 최선두면 내용 유무와 무관하게, 그 외 위치라도 항목이 비어 있으면 현재 항목을 `paragraph`로 전환해 목록을 종료한다(2026-09-13 정정, 사용자 결정 — 이전에는 문서 최선두만 전환하고 그 외 위치는 항상 아래 병합 규칙을 탔다: 앞에 병합할 형제가 있다는 사실이 "보여줄 내용이 없다"는 사실을 바꾸지 않는다 — Enter의 빈 목록 종료 규칙(위)과 대칭). 원본 `blockId`, 인라인 콘텐츠(있다면), `children`, 부모 안 위치와 중첩 깊이를 보존하고 `startNumber`는 제거한다. 타입 전환과 paragraph 시작 selection을 단일 트랜잭션에 담아 revision/event와 undo 단위를 각각 1회로 유지한다.
- `paragraph`/`heading`/`quote`/`bulletListItem`/`numberedListItem` 선두의 Backspace와 끝의 Delete는 중첩 깊이와 무관하게 해당 방향에서 시각적으로 인접한 같은 다섯 타입의 모든 텍스트 블록과 병합한다 — 단, 목록 항목이 비어 있어 위 규칙으로 종료되는 경우는 병합 대신 그 규칙을 따른다. 제거되는 블록의 인라인 콘텐츠는 대상 텍스트 블록 끝으로 이동하고 대상 타입과 attrs는 유지되며, 제거되는 블록의 자식은 그 자리에 같은 순서로 승격된다. 구조 변경·콘텐츠 병합·병합 접점으로의 캐럿 이동은 단일 트랜잭션에 들어가고 revision/event와 undo 단위는 각각 1회다. 정정(2026-10-04, Issue #253): Backspace 병합 대상이 접힌 `toggleListItem`의 숨은 자손이면 가장 바깥 접힌 toggle의 라벨 끝에 병합한다. 숨은 그룹은 화면에 없어 거기 병합하면 텍스트가 보이지 않는 곳으로 사라지기 때문이다. 접힘과 숨은 자손은 그대로이고 캐럿은 접합점, 곧 라벨의 기존 텍스트 끝이다. 단, 숨은 마지막 자손이 `codeBlock`이면 아래 CodeBlock 흡수 규칙이 먼저 적용돼 이 보정이 닿지 않는다. Delete 경로는 바꾸지 않는다. 거절·no-op은 문서·selection·stored marks·history를 바꾸지 않는다.
- CodeBlock 자신의 경계 — 캐럿이 CodeBlock 콘텐츠 안에서 선두의 Backspace와 끝의 Delete — 는 콘텐츠가 있으면 항상 무동작이다(Issue #202, RD-001). `paragraph`/`heading`/`quote` 선두의 Backspace(이전 블록=CodeBlock)와 끝의 Delete(다음 블록=CodeBlock)는 대신 CodeBlock을 흡수해 소멸시킨다 — CodeBlock은 늘 mark 없는 plain text만 담으므로(4.3) 그 인라인 콘텐츠를 그대로 대상 텍스트 블록 경계에 삽입하고 대상 타입·attrs는 유지한다. 목록 항목 선두의 Backspace(이전 블록=CodeBlock)는 항목이 비어 있지 않아도 위 항목의 빈 목록 규칙과 별개로 그 항목을 먼저 `paragraph`로 전환만 하고, 전환된 paragraph에서 이어지는 Backspace가 비로소 CodeBlock을 흡수한다(목록 구조를 갑자기 잃지 않게 하는 2단계 안전장치). 정정(2026-10-06, Issue #281): CodeBlock 콘텐츠를 그대로 삽입하지 않는다. 리터럴 개행은 hardBreak로 바꿔 삽입한다. 대상 텍스트 블록은 개행을 hardBreak 노드로 담기 때문이다. 그대로 넣으면 화면은 한 줄, export는 두 줄이 되고 다음 입력에서 개행이 공백으로 바뀌었다. `heading` level 1도 같다. h1 제한은 Shift-Enter 입력 정책이고 병합에는 적용하지 않는다. 숨은 CodeBlock 흡수(154 문단의 #253 정정)도 같은 변환을 거친다. 이와 별개로 hardBreak를 받는 블록(텍스트 블록·목록 항목·callout·표 셀)에 리터럴 개행 text가 남으면 같은 dispatch 안의 정규화 트랜잭션이 hardBreak로 바꾼다. 범위 삭제·붙여넣기·끌어 옮기기·공개 API 경로를 모두 덮는다. 판정은 부모의 content match이고 CodeBlock은 대상이 아니다. 개행 한 글자와 hardBreak는 위치 크기가 같고 export도 같아 selection과 저장 모델은 바뀌지 않는다. revision/event와 undo 단위는 각각 1회다.
- CodeBlock 끝의 Delete(다음 블록=Text 등)는 반대로 다음 블록을 CodeBlock에 흡수한다(Issue #202, RD-001) — CodeBlock 타입과 `language` 등 attrs는 유지되고, 다음 블록의 인라인 콘텐츠는 모든 mark를 잃으며 hardBreak는 리터럴 개행 문자로 치환돼 CodeBlock의 plain-text 콘텐츠에 합류한다. 다음 블록이 CodeBlock이면 같은 규칙으로 병합하고 `language`는 살아남는(앞) CodeBlock 것을 유지한다. 다음 블록이 목록 항목이어도 CodeBlock이 살아남는 쪽이라 위 2단계 보호가 필요 없어 다른 텍스트 타입과 동일하게 바로 흡수한다. 구조 변경·콘텐츠 병합·캐럿 이동은 단일 트랜잭션에 들어가고 revision/event와 undo 단위는 각각 1회다([`G-EDT-001`](../guides/G-EDT-001-keep-editor-commands-atomic.md)).
- 인접 리프가 `divider`·`image`·`video`·`audio`·`file`·`table`(atom)이면 그 자리에 그대로 두고 건너뛰어 그 너머의 병합 가능한 텍스트 블록과 현재 블록을 결합한다(Issue #202, RD-002·RD-003) — 연속·혼합된 atom도 재귀적으로 전부 건너뛴다(방향 무관 대칭). 병합 자체는 위 154 문단과 같되, atom은 제거·이동 대상이 아니라 원래 있던 자리에 그대로 남는다. `divider`·미디어 4종은 병합 대상을 찾는 기존 탐색이 텍스트 전용 모드에서 원래부터 atom을 건너뛰던 동작을 그대로 쓴다. `table`은 atom이 아니라(`isAtom: false`) 그 탐색이 셀 안 위치로 재귀되므로, 닿을 때마다 그 위치를 표 경계 밖으로 다시 던져 같은 탐색을 반복하는 별도 래퍼가 표도 같은 재귀에 편입시킨다. 정정(2026-10-06, Issue #281): Backspace의 atom 너머 병합 대상이 보이는 CodeBlock이면 현재 블록을 CodeBlock에 넣지 않는다. 그 경로는 hardBreak 뒤를 새 블록으로 쪼개고 블록 id와 mark를 잃었다. 155 문단의 인접 규칙처럼 현재 텍스트 블록이 남고 CodeBlock을 흡수한다. CodeBlock 내용은 개행을 hardBreak로 바꿔 현재 블록 앞에 붙고 캐럿은 접합점이다. atom은 제자리에 남는다. 목록 항목은 155 문단의 2단계 보호를 똑같이 받는다. 대상이 접힌 toggle의 숨은 CodeBlock이면 154 문단의 라벨 끝 병합을 그대로 따른다. Delete의 atom 너머 대상이 CodeBlock이면 방향은 그대로(현재 블록이 남음)이고 개행만 hardBreak로 바꾼다. CodeBlock 끝 Delete가 atom 너머에서 무동작인 계약은 바꾸지 않는다.
- table 인접 Backspace/Delete가 auto로 표 전체를 선택하던 이전 동작(`#138`이 고친 select→2단계 삭제 경로)은 폐기됐다(RD-003) — 인접 키가 표를 지우는 경로 자체가 없어져 그 경로가 낳던 데이터 손실(중첩 위치에서 부모·형제 블록이 표와 함께 사라짐)이 구조적으로 재발할 수 없다. 남는 두 경로는 위 skip-and-merge 규칙과 무관하다. (1) 사용자가 드래그 등으로 직접 만든 표 전체 `CellSelection`에서 Backspace/Delete는 여전히 표만(표가 `blockGroup`의 유일한 자식이면 그 그룹까지) 지우며 이 삭제가 undo 1회 단위다. (2) table이 문서 절대 경계(그 너머에 병합 대상이 전혀 없음)에 있으면 이 확장이 관여하지 않고 PM 기본 keymap의 native 폴백이 table을 `NodeSelection`으로 선택해 `tableEditing`이 표 전체 `CellSelection`으로 정규화한다 — 문서를 바꾸지 않는다.
- 표 셀에서는 일반 블록 split/join 확장이 관여하지 않고 표 키보드 계약이 키별 동작을 별도로 소유한다. Enter는 아래 행의 같은 열 셀로 이동하며, 이동할 아래 셀이 없으면 transaction 없이 키를 소비한다. Backspace/Delete는 셀 콘텐츠와 셀 선택에서는 `tableEditing` 계약을 따르고, 위 (1)의 표 전체 `CellSelection` 삭제만 블록 join 경계가 처리한다. 따라서 표 셀 Enter를 전체 무동작으로 취급하지 않는다. 정정(2026-10-07, Issue #289): 범위 선택이 표 경계에 걸치면 split/join 확장이 키를 소비한다. 경계 범위는 비어 있지 않은 텍스트 선택이고 시작과 끝이 속한 표가 서로 다르다. 한쪽만 표 안이거나 서로 다른 두 표 안이다. 같은 표 안 범위, 표 `CellSelection`, 표를 완전히 감싸는 범위는 해당하지 않아 위 규칙을 그대로 따른다. Enter는 분할할 위치가 없다. 문서·selection·history를 바꾸지 않고 키만 소비한다. 이전에는 예외를 던지거나 표를 지웠다. Backspace·Delete는 선택한 텍스트만 지운다. 표 안은 겹친 셀의 텍스트만 지우고 셀·행·열 구조를 유지한다. 표 밖은 일반 삭제라 사이 블록과 사이 표가 사라진다. 끝 블록은 텍스트만 줄어 남고, 텍스트 전체가 선택돼도 빈 블록으로 남아 병합하지 않는다. 끝 블록의 자식은 그대로다. 캐럿은 범위 시작에 접힌다. 삭제는 단일 트랜잭션이라 undo 1회다. `Mod-Backspace`·`Mod-Delete`도 같다. 정정(2026-10-07, Issue #293): 끝 블록이 상위 블록의 자식이어도 같은 규칙이다. 라벨이 범위에 든 상위 블록(heading·quote·callout·목록 항목·`toggleListItem` 등)은 타입과 attrs를 유지한 채 빈 라벨로 남는다. 조부모 체인의 모든 상위 블록에 적용한다. 끝 블록은 가장 가까운 상위 블록의 자식으로 남고, 텍스트 전체가 선택돼도 빈 블록으로 남는다. 끝이 표 셀이면 표를 감싼 상위 블록에도 적용한다. 체인 안에서 끝 블록 앞의 형제 블록은 범위에 든 사이 블록이라 삭제한다. 끝 블록 뒤의 형제 블록은 남는다. 닫는 토큰만 가로지르는 구간은 지우지 않아 끝 블록의 부모가 바뀌지 않는다. 이전에는 상위 블록이 PM이 채운 빈 `paragraph`가 되거나, 끝 블록이 앞 상위 블록의 자식으로 합류하거나, 끝 블록 텍스트를 전부 덮으면 서브트리가 사라졌다. 정정(2026-10-07, Issue #292): 글자 입력, IME 조합 시작, Cut, 붙여넣기, 내부 이동 drop, `Shift-Enter`, `insertCustomInlineContent`도 경계 범위를 처리한다. 이전에는 PM 기본 삭제·삽입을 타서 선택하지 않은 뒷부분 텍스트가 셀로 옮겨 가거나 표가 사라졌다. 선택 교체 의미를 지켜 선택한 텍스트만 위 Backspace와 같이 지우고 삽입은 범위 시작의 캐럿에 한다. 글자 입력과 IME 조합 시작은 입력 규칙(`> ` 등)보다 먼저 처리해 경계 범위에서 블록 변환을 일으키지 않는다. Cut은 Copy와 같은 slice를 clipboardData에 싣고 지운다. clipboardData가 없으면 문서를 바꾸지 않고 소비한다. 붙여넣기는 종류별 분기 없이 먼저 지우고 기존 경로(파일·표·HTML·Markdown·plain)가 캐럿 기준으로 이어 받는다. 붙일 내용이 없는 붙여넣기(빈 클립보드·미지원 데이터만 있고 파일·text/html·text/plain이 없을 때)는 지우지 않고 소비한다. 읽기 전용에서는 어느 경로도 문서를 바꾸지 않는다. Cut·IME 조합 시작은 PM이 `handleDOMEvents`를 읽기 전용 검사 없이 실행해 이 확장이 `view.editable`로 막고, 나머지는 PM이 막는다. 프로그램적 `insertCustomInlineContent`는 읽기 전용에서도 동작한다. 캐럿이 셀이면 셀 안 규칙을 따른다. 셀 안 캐럿의 다중 블록 붙여넣기는 첫 블록이 셀에, 나머지가 표 뒤에 놓인다. 지움과 붙여넣기는 transaction 둘이지만 undo 1회로 원복된다. 표·TSV 붙여넣기는 자체 transaction이 undo 그룹을 닫아 undo 2회가 필요하다. 붙여넣기를 취소(`pasteHandler`가 `false`)하거나 거절해도 경계 범위 선택은 이미 지워져 있다(undo 1회로 복원). `Shift-Enter`는 head 위치와 무관하게 지운 뒤 캐럿에 `hardBreak`를 삽입한다. 캐럿 블록이 `hardBreak`를 받을 수 없으면(스키마 판정, `codeBlock` 등) 또는 h1이면 삽입하지 않고 선택한 텍스트만 지운 뒤 소비한다. 내부 이동 drop은 부분 표 slice를 임의 위치에 꽂는 결과가 정의되지 않아 문서·selection을 바꾸지 않고 소비한다. 복사 드래그와 외부 drop은 현행이다. 판정은 파생 selection으로 하고 문서 transaction은 live state로 만든다. live만 경계 범위이고 파생 selection이 대상 밖이면 폴스루하지 않고 소비한다. 입력·Cut·`Shift-Enter`·`insertCustomInlineContent` 한 번은 dispatch 1회, undo 1회다.

#### 목록 native input rule

- native text input에서 최종 space 직전 현재 `blockContainer`의 content node가 `paragraph`이고 전체 inline text가 exact `-` 또는 `1.`일 때만 각각 `bulletListItem`·`numberedListItem`으로 바꾼다. 번호 목록에는 `startNumber`를 넣지 않는다. top-level·중첩·`children` 보유 paragraph를 허용하며 안정 ID, `children`, 부모 안 위치와 중첩 깊이를 보존한다.
- 선행 공백, 문장 중간 marker, `-- `·`* `·`+ `·`2. `·`01. `과 heading·quote·CodeBlock·기존 목록·표 셀 paragraph는 변환하지 않는다. paste와 기본 programmatic insertion에도 적용하지 않는다. 범위 선택을 native marker 입력으로 대체한 뒤 exact 상태가 된 paragraph는 다음 native space에서 변환한다.
- marker text만 제거하고 빈 목록 content 시작에 캐럿을 둔다. marker의 active inline marks는 stored marks로 보존한다. `-  `·`1.  `의 첫 space는 변환을 실행하고 둘째 space는 목록 content에 native 입력된다.
- 변환은 custom Tiptap `InputRule`이 현재 chainable transaction을 직접 변경한다. public `setBlockType`을 중첩 호출하지 않는다. 타입·selection 변경, `BlockIdExtension`/trailing append transaction, revision/change event는 단일 `view.dispatch`와 history 단위다. 변환 직후 public undo 한 번은 최종 space 직전 marker paragraph와 trailing 상태를 복원한다. 즉시 Backspace는 `undoInputRule`을 우선 적용해 literal `- ` 또는 `1. ` paragraph를 복원한다(Issue #38 슬라이스 5 RD-006).

### 5.2 Tab/Shift+Tab 3분기

우선순위는 다음과 같다(R1 `table-keyboard-extension.ts`가 이미 1번을 구현했다).

1. 캐럿이 표 셀 안 → 기존 `goToNextCell`(셀 탐색, 마지막 셀은 새 행 생성). 변경 없음.
2. 캐럿이 `codeBlock` 안 → 공백 2개를 콘텐츠에 삽입하고 키 이벤트를 소비한다. Shift+Tab은 source·블록 중첩을 바꾸지 않고 소비하지 않아 브라우저 기본 순차 포커스 이동을 허용한다. literal Tab은 외부 source에서 보존할 수 있지만 키보드 Tab 조작은 literal Tab을 만들지 않는다.
3. 그 외(문단, heading, quote, 목록 항목 등) → `indentBlock`/`outdentBlock`. 명령이 성공한 경우에만 키 이벤트를 소비한다. 적용 불가(예: 최상위 블록의 `Shift+Tab`)면 이벤트를 소비하지 않고 브라우저 기본 순차 포커스 이동을 허용한다. 표 셀 안 첫 셀의 `Shift+Tab`은 1번 분기의 기존 계약에 따라 계속 소비한다.

CodeBlock의 Enter는 source에 LF를 삽입하는 일반 code editing만 담당한다. triple Enter exit, ArrowUp/ArrowDown exit와 빈 CodeBlock의 Backspace→paragraph 전환은 이 슬라이스에서 추가하지 않는다. 기존 공개 block command와 side menu가 종류 변경·이동 경로를 소유하며, 추가 keyboard parity는 슬라이스 9에서 재평가한다. 정정(2026-10-06, Issue #281): CodeBlock에서 시작해 그 CodeBlock 밖까지 걸친 범위 선택의 Enter는 범위를 지우고 그 자리에서 Enter를 누른 것과 같다. 삭제는 범위 Backspace·Delete와 같은 기준이라 서식 있는 꼬리처럼 두 블록이 남으면 캐럿이 CodeBlock 끝에 남는다. 캐럿이 CodeBlock에 남으면 위 LF 삽입이고, 일반 텍스트 블록에 닿으면 149 문단의 split이다. 삭제와 Enter는 한 트랜잭션이라 undo 1회다. CodeBlock 안에서 끝나는 범위 Enter는 범위를 LF 하나로 바꾸는 기존 동작을 유지한다.

### 5.3 다중 블록 선택과 이동

- 선택 범위는 **같은 부모의 형제 블록** 연속 구간으로 제한한다(서로 다른 중첩 깊이에 걸친 비연속 선택은 만들지 않는다 — BlockNote의 `MultipleNodeSelection`과 동일한 제약).
- "이동"은 드래그 재정렬과 상하 이동 버튼 모두를 포함한다(사용자 승인). 이동 대상 블록에 딸린 `children`은 통째로 함께 이동한다.
- 삭제는 선택된 블록과 그 `children`을 통째로 삭제한다.
- ProseMirror에는 다중 노드 selection이 없다(`NodeSelection`은 단일 노드) — 선택 상태는 core가 별도로 관리하는 `blockSelection: { fromBlockId, toBlockId } | null`이며 ProseMirror `Selection`과 독립적이다. React는 이 상태를 읽어 하이라이트만 그린다(7.1 원칙 재사용 — 좌표 계산과 표시만).

### 5.4 단일 블록 하위 트리 인지 이동·복제(Issue #125)

`moveBlockBefore`/`duplicateBlock`(R1 기존 명령)은 슬라이스 1이 `children`을 도입한 뒤 한동안 자식 딸린 블록을 `COMMAND_NOT_APPLICABLE`로 거절했다(Issue #125). 2026-09-03 이 거절을 아래 계약으로 교체했다.

- **`moveBlockBefore(blockId, beforeBlockId)`**: 목적지는 (a) 다른 부모의 `children` 목록 안 임의 위치, (b) `beforeBlockId === null`인 최상위 문서 끝을 모두 지원한다. `null`은 항상 최상위 문서 끝을 의미하며 소스의 현재 부모 끝이 아니다. 원본과 하위 트리 전체(표 포함)를 하나의 transaction으로 옮긴다.
  - 목적지가 소스 자신의 하위 트리 안(자손)이면 mutation 전 `COMMAND_NOT_APPLICABLE`.
  - 이동 결과 최심부가 `MAX_NESTING_DEPTH`(64, 3.2)를 넘으면 mutation 전 `COMMAND_NOT_APPLICABLE`(새 에러 코드를 만들지 않고 `indentBlock`과 같은 코드로 수렴 — 5.1 결정에 이어 공개 에러 union을 바꾸지 않는다는 원칙 유지).
  - 표를 소스로 한 이동은 같은 부모 형제 간·cross-parent 모두 성공한다(신규 거절 가드 없음 — 표는 스키마상 `blockContainer`와 동급 형제라 core 계약을 막을 근거가 없다. 제품 UI가 표를 드래그 후보에서 제외하는 것은 UI 계층의 선택이다).
- **`duplicateBlock(blockId)`**: 자식이 있는 블록을 대상으로 호출하면 하위 트리 전체를 복제하고 모든 `blockId`를 원본과 겹치지 않게 재귀 재발급한다. 복제되는 하위 트리 안에 표가 자식으로 들어있으면 그 표의 column/row/cell id도 함께 재귀 재발급한다(clone이 표 내부 id 중복을 낳기 때문, D7). 표 자신이 직접 duplicate 대상인 경우도 같은 D7 분기가 적용돼 표 전체(row/cell/column id 전량 포함)가 새 id로 복제된다 — 이전에는 `COMMAND_NOT_APPLICABLE`로 거절했으나(id 재사용 우려), clone 헬퍼가 이미 표 전용 처리를 완비하고 있어 거절 근거가 사라졌다(Issue #174 RD-001, 2026-09-11).
- 표 직접 duplicate를 지원하면서 병합 셀(colspan/rowspan)이 있는 표도 구조가 보존된 채 복제된다 — 병합 참조가 id가 아니라 위치(row 순서·컬럼 인덱스·rowSpan/columnSpan) 기반이라 id 재발급의 영향을 받지 않는다(`editor-controller-table.test.ts`로 고정). Delete와 이동(위/아래 버튼)은 여전히 `BlockSelectionToolbar`(6.3, DELTA-01~04)를 표에도 그대로 연다 — `table-handles.tsx`의 "표 선택" 버튼이 `selectBlockRange(tableBlockId, tableBlockId)`를 커밋하는 것이 유일한 진입점이다(`BlockSelectionToolbar` 자신은 표를 포함해 어떤 블록 타입도 거절하지 않는다, Issue #149).
- 두 명령 모두 성공은 revision과 `onChange`를 한 번만 변경하고 undo 1회로 원본 트리와 selection을 복원한다.
- `UI-004`(다중 블록 선택 이동, 5.3)와는 별개 계약이다 — `moveSelectedBlocksBefore`는 여전히 같은 부모 형제 안으로만 제한된다.

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
- 빈 CodeBlock은 caret 위치와 무관하게 `Code` placeholder를 항상 표시한다. CodeBlock의 타입을 식별하는 표시이며 저장 JSON에는 남지 않는다.
- 문서 끝에는 항상 편집 가능한 마지막 블록(`paragraph`)이 있어야 한다. 사용자가 문서 끝 블록을 지우거나 다른 타입으로 바꾸면 core가 자동으로 빈 `paragraph`를 추가한다.

### 6.5 색상 팔레트

- 인라인 색상 툴바(글자색/배경색)와 블록 색상 메뉴는 R1 표 셀 색상 메뉴와 같은 컴포넌트를 재사용하거나(가능하면) 같은 팔레트 상수를 공유하는 별도 컴포넌트로 만든다 — 팔레트 값 자체는 3.3에서 이미 고정했다.

### 6.6 CodeBlock language UI

- CodeBlock이 활성 상태면 always-available editable combobox를 표시한다. Plain Text, JavaScript, TypeScript, HTML, CSS, JSON, Bash, Python, Java, Kotlin, SQL, Markdown의 display name·alias suggestion을 제공하고 unknown 현재값도 exact 표시한다.
- Enter와 option click만 draft를 commit한다. Escape와 바깥 pointerdown은 draft를 취소한다. Escape는 editor focus를 복원하고 바깥 pointerdown은 자연스러운 focus 이동을 유지한다.
- 입력을 전부 비운 뒤 commit하면 `"text"`를 저장한다. known alias는 4.3 규칙으로 canonicalize하고 unknown은 그대로 저장한다.
- UI는 plain monospace source만 표시한다. syntax highlighting, grammar, theme, Copy control, line wrap toggle과 line number는 이 슬라이스 범위가 아니다.

## 7. 문서 입출력

### 7.1 HTML 계약 확장

- H4-H6 → `h4`~`h6`. 토글 제목/토글 목록의 `collapsed` → `<details open={!collapsed}>`류 표현(정확한 매핑은 슬라이스 착수 시 확정, `isToggleable`이 없으면 일반 heading으로 export).
- 인용문 → `blockquote`(children은 blockquote 안에 중첩 HTML로).
- import 방향: `<blockquote>`의 첫 자식이 문단이면 그 문단의 인라인 콘텐츠가 quote `content`가 되고 나머지 자식은 `children`이 된다. 첫 자식이 `h2`·`ul`·중첩 `blockquote`처럼 비문단 블록 요소면 `content`는 빈 채로 두고 전부 `children`이 된다(사용자 승인 완료 2026-08-28, Issue #38 슬라이스 3). 첫 자식이 태그로 감싸이지 않은 인라인 텍스트·요소면(손으로 쓴 HTML에서만 나타난다 — geul 자체 export는 own content를 항상 `<p>`로 감싼다) list item(`splitListItemChildren`)과 동일한 규칙을 쓴다: 블록 형제가 없으면 인라인 전체가 `content`이고, 있으면 첫 block-boundary 전까지를 `content`로 승격하고 boundary부터를 `children`으로 넘긴다(Issue #142 정정, 2026-09-01 — 이전에는 이 경우도 `content`를 비웠으나 근거였던 "승격하면 문서 순서가 어긋난다"가 실측에서 재현되지 않아 list와 통일했다).
- 구분선 → `hr`.
- 코드 블록 export → `<pre><code data-language="..." class="language-...">source</code></pre>`. language가 있으면 exact 값을 HTML escape한 `data-language`에 저장한다. `/^[A-Za-z0-9][A-Za-z0-9_-]*$/`을 만족할 때만 같은 값의 `language-*` class를 병기한다. language가 없으면 두 metadata를 모두 생략한다.
- 코드 블록 import는 `<pre><code>`와 bare `<pre>`를 모두 받는다. language metadata가 없는 bare `<pre>`는 language 없는 CodeBlock이다. bare `<pre>` 자체의 `data-language`·`language-*` class는 다음 우선순위의 `<pre>` 후보로 처리한다. source는 sanitized descendant text를 문서 순서대로 연결하고 `<br>`만 LF로 바꾼다. `span` 등 wrapper는 visible text만 보존하고 element 경계 자체로 LF를 만들지 않는다.
- language import 우선순위는 `<code data-language>` → `<pre data-language>` → `<code class="language-*">` → `<pre class="language-*">`다. 빈 `data-language`는 미지정으로 보고 다음 후보를 읽는다. 같은 위치에 `language-*` class가 여러 개면 첫 token을 쓴다. 선택되지 않은 non-empty metadata가 선택값과 다르면 결과는 유지하고 `CODE_BLOCK_LANGUAGE_METADATA_IGNORED` warning을 반환한다. 같은 값의 중복은 warning이 아니다.
- `<pre>` descendant text의 code-point warning은 Code source 문자 계약을 따른다. literal Tab은 허용된 source이므로 `UNSAFE_CODE_POINT_REMOVED`를 반환하지 않는다. 선택된 language 또는 source가 4.3의 문자 계약을 위반하면 값을 보정하거나 후순위 metadata로 fallback하지 않고 `HTML_DOCUMENT_INVALID`로 거절하며 document·warning 목록을 반환하지 않는다.
- 목록 4종 → `ul`/`ol`(`start` 속성 매핑)/체크박스는 `input[type=checkbox][disabled]` 또는 `data-checked` 속성(정확한 형태는 슬라이스 착수 시 확정) / 토글은 `details`.
- 인라인 색상 → `style="color:...; background-color:..."`.
- 블록 색상/정렬 → 블록 wrapper의 `style`/`data-*` 속성(표 셀과 같은 방식).
- 중첩 `children`은 해당 HTML 요소 안에 재귀적으로 중첩된 HTML로 표현한다.
- import 방향의 중첩 계약(Issue #132): children wrapper 중첩이 `MAX_NESTING_DEPTH`(64)를 넘으면 문서를 거절하지 않고 초과분을 형제 블록으로 평탄화해 보이는 텍스트를 보존하며 `NESTED_CHILDREN_FLATTENED` 경고를 반환한다. 별개로 HTML 트리 자체는 파싱 직후 깊이 캡(`MAX_HTML_TREE_DEPTH = 256`, io 소유)에서 절단돼 캡 너머 서브트리는 텍스트로 평탄화되고 `DEEP_TREE_FLATTENED` 경고가 난다(Issue #130) — 두 축(모델 중첩·HTML 트리 깊이)은 상수도 경고도 분리된다. 파서 수준에서 트리를 만들 수 없는 입력(예: 매우 깊은 미폐쇄 template 중첩)은 평탄화 보존 대상이 아니라 `HTML_PARSE_FAILED` 거절이다.

### 7.2 GFM 계약 확장과 손실 정책

R0/R1과 동일한 strict/lossy 계약을 그대로 적용한다(새 규칙을 만들지 않는다, CONTEXT.md의 strict/lossy export 정의, [`G-CNV-002`](../guides/G-CNV-002-preserve-imported-meaning.md)와 같은 패턴).

- GFM이 직접 표현 가능한 것: H1-H6(H4-H6도 `####`~`######`로 표현 가능), 인용문(`>`), 구분선(`---`), 코드 블록(펜스 코드 블록, language 포함), 글머리·번호 목록(`start` 속성 포함), 체크 목록(`- [ ]`/`- [x]`), 중첩(들여쓰기).
- GFM이 표현할 수 없는 것: 토글(제목/목록의 `collapsed`·`isToggleable` 자체), 인라인 색상, 블록 색상, 블록 정렬.
  - `strict` export는 이 중 하나라도 문서에 있으면 실패하고 구조화된 손실 정보(블록 ID, 기능 종류)를 반환한다.
  - `lossy` export는 토글을 일반 목록/heading으로 낮추고(접힘 상태·`isToggleable` 정보만 버림, 콘텐츠는 보존), 색상·정렬을 버리고, 각 손실을 경고 목록에 기록한다.
- GFM import는 토글 문법이 없으므로 토글을 만들지 않는다. 체크 목록(`- [ ]`)은 `checkListItem`으로, 번호 목록의 시작 값은 `startNumber`로 매핑한다.
- fenced code와 네 칸 들여쓴 CommonMark code를 모두 CodeBlock으로 import한다. 들여쓴 code는 language가 없고 export는 항상 fenced code 정규형을 사용한다. source의 CRLF·CR은 LF로 canonicalize하며 warning을 만들지 않는다. source의 LF·공백·literal Tab·fence 충돌 문자는 보존하고 필요한 경우 serializer가 더 긴 fence를 선택한다.
- GFM info string의 language는 4.3 규칙으로 canonicalize한다. mdast `meta`는 저장 필드가 없으므로 language만 보존하고 `CODE_BLOCK_META_DROPPED` warning을 반환한다. 모델의 공백 포함 unknown language는 exporter가 GFM entity로 escape해 exact 보존한다.
- 정정(2026-08-28, Issue #38 슬라이스 3): (a) `paragraph`/`heading`/`quote`의 `children`은 GFM 표현 불가 목록이다 — `strict` export는 거절하고, `lossy` export는 자식을 형제로 평탄화하며 `NESTED_CHILDREN` 경고를 반환한다(슬라이스 1 규칙에 quote를 편입한다). (b) GFM import는 `>` 안 문단을 문단마다 형제 `quote`로 분해하고 `children`을 만들지 않는다(import 직후 strict 실패의 비대칭을 막는다); 비문단 자식은 unwrap하고 경고를 1회 반환하며, 중첩된 `>`는 재귀적으로 처리한다. (c) 목록·인용문 컨테이너의 중첩 표현은 슬라이스 5에서 재평가한다. **`quote`는 (a)(b) 대상에서 이후 제외됐다 — 아래 정정(2026-09-09) 참고.**
- 정정(2026-09-09, Issue #151, roadmap-workflow RD-001): 목록은 슬라이스 5가 이미 컨테이너로 편입했고(`isGfmListLikeBlockType`), `quote`는 이 RD가 (c)를 재평가해 같은 방향으로 편입했다 — GFM blockquote의 content model이 root와 동일한 flow content임을 실측 확인(mdast 자체가 blockquote 재귀를 막지 않음). 위 (a)의 `quote`는 더 이상 GFM 표현 불가 목록이 아니다: `strict` export가 성공하고 `children`(재귀, model이 허용하는 14종 Block 전부 — 사용자 명시 선택 2026-09-09)을 GFM `>`/`>>` 중첩으로 그대로 낸다(`isGfmContainerLikeBlockType`, `export-markdown.ts`). 위 (b)는 폐기됐다 — `blockquoteToBlocks`(import-markdown-blocks.ts)가 `listBlocksFromNode`와 동일 패턴(첫 자식이 paragraph면 own content로 승격, 나머지는 재귀 변환한 `children`)으로 재작성돼 형제로 쪼개거나 비문단 자식을 quote 밖으로 내리지 않는다 — `QUOTE_CHILD_DOWNGRADED`/`NESTED_QUOTE_FLATTENED` warning kind는 제거됐다. own content가 비고 첫 child가 paragraph인 조합만 목록 항목과 동일한 모호성으로 여전히 `NESTED_CHILDREN`을 낸다(`hasAmbiguousLeadingListParagraph`, GFM이 own content와 첫 child paragraph의 경계를 재파싱 시 구분하지 못하는 원천적 한계 — 이월이 아니다).

### 7.3 일반 clipboard(`IO-007`, 2.2에서 파일 제외)

- 우선순위: `text/html`(구조 보존) → GFM Markdown 텍스트 감지 시 Markdown 파서 → 그 외 `text/plain`.
- HTML 붙여넣기는 7.1 계약과 동일한 sanitizer·매핑을 재사용한다(문서 HTML import와 다른 경로를 만들지 않는다 — R1 슬라이스 11의 표 클립보드가 문서 HTML sanitizer를 재사용한 것과 같은 원칙).
- 표 붙여넣기(R1 `TablePasteExtension`)와의 경계: 클립보드에 표 형태의 `text/html`이 있으면 R1 계약이 우선한다 — 이 슬라이스는 표가 아닌 콘텐츠(문단, 목록, heading 등)의 붙여넣기만 다룬다.
- 파일이 클립보드에 있고 대체 가능한 HTML/텍스트 표현이 없으면(예: 이미지 파일 단독) 이벤트를 소비하지 않고 무시한다 — R3에서 파일 블록과 함께 처리한다(2.2).
- 여러 줄 `text/plain` 배치(정정 2026-10-06, Issue #284). 줄이 둘 이상인 평문은 Enter 분할(5.1, D23·D24·#252)과 같은 규칙으로 놓는다. 들여쓰기 없던 블록이 붙여넣기만으로 자식을 얻지 않는다. 이전에는 PM 기본 처리가 줄마다 문단 slice를 만들어 둘째 줄 이후를 캐럿 블록의 자식으로 넣었다.
  - 입력은 먼저 `normalizePasteText`로 정리한다. CR을 LF로 바꾼 뒤 `sanitizeInlineText`를 건다. 줄은 `\r\n`·`\r`·`\n`으로 나눈다. 연속 개행은 한 경계다. 앞·뒤 개행은 빈 줄로 남아 경계가 된다. 정정(2026-10-07, Issue #291): 이전 서술은 sanitize가 먼저였다. `sanitizeInlineText`가 CR을 지워 단독 `\r`이 줄 경계가 되지 못했다. 자세한 규칙은 아래 #291 문단이다.
  - 범위 선택은 Enter와 같은 기준(`deleteSelection`)으로 지운 뒤 붙인다.
  - 줄 사이마다 Enter 분할을 한다. 자식 없는 블록은 다음 형제를 만든다. 자식 있는 블록은 원본의 첫 자식을 만들고 기존 자식 귀속은 바뀌지 않는다. 접힌 toggle은 펼친 형제를 만든다. heading·quote의 끝은 새 블록이 paragraph이고 목록은 같은 타입이다.
  - 빈 목록 항목의 exit 규칙(빈 항목 Enter는 paragraph로 바꾼다)은 붙여넣기 중간 분할에서 끈다. 빈 항목에 `"\nX"`를 붙이면 빈 항목과 새 항목 `X`가 남는다.
  - 삭제·삽입·분할은 한 transaction이다. dispatch와 undo가 각각 1회다. `paste` meta와 `uiEvent: "paste"`를 단다.
  - Ctrl+Shift+V도 같다. 확장은 Shift를 구분하지 않는다.
  - 직접 배치하지 않는 경우는 PM 기본 처리나 기존 분기를 유지한다. 유효한 한 줄 평문(무효 문자가 섞이면 정리본을 `view.pasteText`로 넣는다, #295), `text/html` 동봉(HTML 우선, 블록을 못 만들면 아래 #287 폴백), Markdown 감지(빈 줄 포함 평문 등), 표 셀 안(유효한 평문만 PM 기본이고, 무효 문자가 섞이면 정리본을 `view.pasteText`로 넣는다, #297), 캐럿·시작이 codeBlock 안인 붙여넣기(유효한 평문만 PM 기본이고, 무효 문자가 섞이면 정리본을 `view.pasteText`로 넣는다, #296), `TextSelection`이 아닌 selection이 해당한다.
  - 직접 배치가 물러나는 입력은 `clipboardTextParser`를 탄다. 줄마다 `blockContainer(paragraph)`를 만든 `open(2,2)` slice를 돌려준다. 한 줄이면 `null`이라 PM 기본이다. 자식 없는 블록은 위와 같은 형제 배치다. 정정(2026-10-07, Issue #285): drop과 시작이 codeBlock 밖인 codeBlock 걸친 범위는 이 경로가 아니라 아래 직접 삽입이다.
  - 한계: `clipboardTextParser` 경로는 자식 있는 블록에서 D23 배치를 만들 수 없다. PM Fitter가 캐럿 뒤 꼬리 텍스트를 새 컨테이너로 가르면서 기존 `blockGroup`을 함께 옮긴다. `open(1,3)` 같은 slice 모양으로도 꼬리와 기존 자식을 한 `blockGroup`에 모을 수 없다. 이 경로에서는 기존 자식이 마지막 줄 블록으로 넘어간다. 정정(2026-10-07, Issue #285): drop과 시작이 codeBlock 밖인 codeBlock 걸친 범위는 이 한계에서 벗어났다. 이 경로는 위임 입력에만 남는다(#285 한계 참조). 그 입력에서는 이 한계가 그대로다.
- codeBlock에 걸친 범위의 HTML 배치(정정 2026-10-07, Issue #286). 선택이 비어 있지 않고 시작(`$from`)이 codeBlock 밖이면 `text/html`은 비코드 범위와 같은 분기(`importHtml` → `insertContent`)로 배치한다. 이전에는 codeBlock에 걸치면 조기 반환해 PM 기본 처리로 넘어갔다. 그 결과 `abX[Ybar]`처럼 둘째 블록이 앞 블록의 자식이 되고 목록·heading·`pre` 서식이 사라졌다.
  - `insertContent`가 범위를 `replaceWith`로 대체한다. 삭제 단계는 없다. 삽입 지점은 범위 시작이다. 새 블록은 시작 블록의 형제다. 시작이 자식 블록이면 그 자식과 같은 층위 형제다.
  - 끝 codeBlock의 잔여는 codeBlock으로 남는다. `[p "abcd", code "foobar"]`에서 `ab` 뒤부터 `foo` 뒤까지 `<p>X</p><p>Y</p>`를 붙이면 `[p "ab", p "X", p "Y", code "bar"]`다.
  - 서식은 보존된다. `<ul>`은 목록 항목, `<h1>`은 heading, `<pre>`는 codeBlock으로 들어간다.
  - 시작이 codeBlock 밖이면 접힌 toggle 안 숨은 codeBlock이 범위 중간에 있어도 같은 분기다.
  - 범위 대체는 한 transaction이다. revision은 1 늘고 undo는 1회다.
  - 한계: 첫·끝 블록의 인라인 병합(PM 열린 slice) 의미는 따르지 않는다. 한 블록 HTML도 `ab`, `X`, `bar`로 나뉜다. 이는 비코드 범위·캐럿과 같은 `insertContent` 의미다.
  - 한계: `NodeSelection`·`AllSelection`도 시작이 codeBlock 밖이면 이 분기를 탄다. codeBlock `NodeSelection`은 그 블록 전체를 HTML 블록으로 대체하고, `AllSelection`은 문서 전체를 대체한다. 수정 전 PM 기본 처리와 결과가 같다.
  - 한계: 시작이 codeBlock 안인 범위와 캐럿이 codeBlock 안인 붙여넣기는 현행 PM 기본 처리를 유지한다. 시작이 codeBlock 안인 범위는 `fooX`·`Yil`처럼 나뉜다. 정정(2026-10-07, Issue #296): 유효한 평문은 이 서술 그대로다. 무효 문자가 섞인 평문은 정리본을 `view.pasteText`로 넣는다(아래 #296 문단).
  - 한계: `text/html`이 없으면 이 예외가 없다. codeBlock에 걸친 범위의 Markdown 평문은 감지하지 않고 리터럴 문단으로 넣는다. 시작이 codeBlock 밖인 범위의 여러 줄 평문은 아래 #285 직접 삽입이다.
- html이 블록을 만들지 못할 때의 평문 폴백(정정 2026-10-07, Issue #287). `text/html`이 있어도 블록이 생기지 않으면 같은 클립보드의 `text/plain`을 붙인다. 우선순위는 `text/html` → Markdown → `text/plain`이다. html이 블록을 못 만들면 그 단계만 건너뛴다. 이전에는 붙여넣기가 조용히 사라졌다. `<meta charset='utf-8'>`만 담긴 클립보드가 대표 사례다.
  - 폴백 대상은 블록 0개인 결과와 import 실패다. 블록 0개는 `modelToTiptap`이 `DOCUMENT_INVALID`로 거절한다. import 실패는 위험 URL(`<img src='javascript:x'>`)·제어문자(`<pre>`에 `\u0001`)가 대표다.
  - 위험 입력은 여전히 import하지 않는다. 문서에는 평문만 들어온다.
  - 빈 문단 1개 이상은 폴백하지 않는다. `<p></p>`·`<p><br></p>`·`<p> </p>`는 html 우선이고 평문은 쓰지 않는다. 빈 줄 복사가 빈 문단을 넣는 동작을 지킨다.
  - 폴백 후 규칙은 `text/plain`만 있는 클립보드와 같다. Markdown 감지, 여러 줄 직접 배치(#284), `sanitizeInlineText` 순서다.
  - 한 줄 평문은 PM 기본 처리에 위임하지 않고 `view.pasteText`로 넣는다. PM 기본은 비어 있지 않은 `text/html`이 있으면 `text/plain`을 버린다.
  - codeBlock에 걸친 범위(시작이 codeBlock 밖)는 Markdown 감지를 건너뛴다. Markdown 평문은 리터럴 문단이다. `sanitizeInlineText` 뒤 한 줄이면 `view.pasteText`로 넣는다. 여러 줄이면 아래 #285 직접 삽입이다.
  - 평문도 비면 이벤트를 소비하고 문서는 그대로다. `sanitizeInlineText` 뒤 빈 문자열인 경우도 같다. `text/html`이 없고 평문도 비면 현행대로 PM에 위임한다.
  - 폴백 붙여넣기는 한 transaction이다. revision은 1 늘고 undo는 1회다. codeBlock에 걸친 범위도 같다.
  - `pasteHandler`가 `defaultPasteHandler()`로 위임해도 같은 폴백을 받는다. `true`를 돌려받는다.
  - 한계: 폴백 중 codeBlock에 걸친 범위의 끝 잔여는 PM 기본 처리가 앞 블록과 병합한다. `[p "abcd", code "foobar", p "tail"]`에서 `ab` 뒤부터 `foo` 뒤까지 `Q`를 붙이면 `[p "abQbar", p "tail"]`다. codeBlock 잔여는 남지 않는다. `text/plain`만 있는 클립보드와 같다.
  - 한계: 폴백은 무효 문자를 지운 평문을 넣는다. codeBlock에 걸친 범위에 무효 문자만 있는 평문을 `text/plain`만으로 붙이면 문서가 그대로다. 폴백은 지운 뒤 남은 글자를 넣는다.
  - 한계: 시작이 codeBlock 안인 범위에 빈 결과 html만 붙이면(평문 없음) PM 기본 처리가 선택을 지운다. 이 폴백은 시작이 codeBlock 밖인 경우만 고친다.
  - 한계: 폴백은 `text/plain`만 읽는다. 빈 결과 html에 `Text`·`text/uri-list`만 있는 클립보드는 붙지 않는다. 이전에도 같았다.
- 여러 줄 평문 drop과 codeBlock에 걸친 범위의 자식 보존(정정 2026-10-07, Issue #285). 여러 줄 `text/plain`을 drop하거나 시작이 codeBlock 밖인 codeBlock 걸친 범위에 붙여도 기존 자식이 마지막 줄 블록으로 넘어가지 않는다. 배치는 #284와 같은 Enter 분할(5.1, D23·D24·#252)이다. 이전에는 PM 기본 처리가 `clipboardTextParser` slice를 넣어 자식을 마지막 줄 블록으로 넘겼다.
  - drop 직접 삽입 조건은 넷이다. `view.dragging`이 없다. `files`가 비어 있다. `text/html`이 비어 있다. `sanitizeInlineText`한 `text/plain`이 둘 이상의 줄이다. 판정은 live `view.state`로 한다.
  - 위임(`false`) 입력은 PM 기본이다. 파일 동반 drop은 미디어 확장이 처리한다. 위 조건 밖 입력과 아래 위치가 해당한다. `posAtCoords`가 `null`인 위치. 부모가 분할 가능한 텍스트 블록이 아닌 위치(표 셀·atom 블록·블록 사이). 위치를 보정하지 않는다.
  - 줄은 drop 위치에 놓는다. 현재 selection은 지우지 않는다. 마크는 drop 위치의 `$from.marks()`다. 입력은 `sanitizeInlineText`를 거친다.
  - 삽입은 한 transaction이다. dispatch·undo는 각각 1회다. `uiEvent: "drop"`만 달고 `paste` meta는 달지 않는다. dispatch 뒤 `view.focus()`를 부른다. 삽입 범위(drop 위치부터 마지막 줄 끝)를 `TextSelection`으로 선택한다. PM 기본 drop과 같다.
  - codeBlock 걸친 범위는 시작(`$from`)이 codeBlock 밖이고 (`text/html`이 있거나 sanitize 후 평문이 여러 줄이면) #286의 조기 반환을 통과한다. 평문 단독 여러 줄과 html 폴백(#287) 여러 줄은 직접 삽입한다. 유효한 한 줄 평문만 PM 기본이고, 무효 문자가 섞이면 정리본을 `view.pasteText`로 넣는다(#295). 한 줄 폴백은 `view.pasteText`다. html import가 성공하는 경로(#286)는 그대로다.
  - 이 범위의 평문은 Markdown을 감지하지 않는다. 현행 한계를 유지한다.
  - 직접 삽입을 못 하면(`NodeSelection` 등) 유효한 평문 단독은 PM 기본에 위임한다. html 폴백과 무효 문자가 섞인 평문은 정리본을 `view.pasteText`로 넣는다(#295).
  - 예: `[p "abcd" 자식 [code "xyz", p "c2"]]`에서 `ab` 뒤부터 `xy` 뒤까지 `X\nY`를 붙이면 `p "abX"`의 자식이 `["Yz", "c2"]`다. 이전에는 `p "abX"` 뒤에 `p "Yz"`가 오고 `c2`가 `"Yz"`의 자식이었다.
  - 이슈 서술 정정: 결함 조건은 "시작 블록에 자식이 있음"이 아니라 "범위 끝 뒤에 자식이 남는 모양"이다. 범위 끝 뒤에 자식이 없는 일반 모양은 PM 기본도 결함이 없고 결과가 같다. 가설 "`handleDrop`에서 `splitAtCaret`"은 `buildPlainMultilinePasteTransaction`의 `at` 옵션으로 확정했다.
  - 한계: 위임 입력은 PM 기본이라 자식 있는 블록에서 기존 자식이 마지막 줄 블록으로 넘어간다. 내부 드래그, `text/html` 동반 drop, 표 셀·구분선 위치 drop, `NodeSelection`, 시작이 codeBlock 안인 범위가 해당한다.
  - 한계: 끝 잔여는 codeBlock으로 남지 않는다. `[p "abcd", code "foobar"]`에서 `ab` 뒤부터 `foo` 뒤까지 `X\nY`를 붙이면 `[p "abX", p "Ybar"]`다. #286 HTML 경로와 다르다. `text/plain`만 있는 PM 기본과 같다.
  - 한계: 범위가 중간 컨테이너의 라벨을 지우고 그 자식을 남기면 빈 문단이 그 자식을 가진다. `[p "abcd" 자식 [p "mid" 자식 [code "xyz", p "g2"]]]`에서 `ab` 뒤부터 `xy` 뒤까지 `X\nY`를 붙이면 `p "abX"`의 자식이 `["Yz", 빈 문단 자식 ["g2"]]`다. PM 기본도 같은 빈 문단을 만든다.
  - 한계: 접힌 toggle 안 숨은 codeBlock이 범위에 있는 여러 줄 평문은 시작이 codeBlock 밖이면 직접 삽입이다. 범위 삭제는 #264 결과 그대로 숨은 자손을 지운다.
- 자식 있는 블록 끝의 HTML·Markdown 배치(정정 2026-10-07, Issue #290). 자식이 있는 텍스트블록의 끝 캐럿에 `text/html`·Markdown 블록을 붙이면 새 블록이 Enter 분할(5.1, D23·#252)과 같은 위치에 놓인다. 이전에는 `insertContent`가 캐럿에서 블록을 갈라 뒤 조각이 빈 껍데기가 됐고 기존 자식이 그 껍데기로 넘어갔다. `[p "abcd" 자식 [p "child"], p "tail"]`의 끝에 `<p>X</p><p>Y</p>`를 붙이면 `[p "abcd", p "X", p "Y", p "" 자식 [p "child"], p "tail"]`였다.
  - 열린 블록은 새 블록이 자식 그룹의 첫 자리에 놓인다(D23). 위 문서는 `[p "abcd" 자식 [X, Y, child], p "tail"]`가 된다. 자식 id는 보존되고 빈 블록이 생기지 않는다.
  - 접힌 toggle은 새 블록이 컨테이너 바로 뒤 형제다(#252). 숨은 자식은 toggle에 남는다. `[toggle~ "abcd" 자식 [child], tail]`은 `[toggle~ "abcd" 자식 [child], X, Y, tail]`다.
  - 대상은 넷을 모두 만족하는 입력이다. `TextSelection`이다. 시작과 끝이 같은 중첩 가능한 텍스트블록이다. 끝이 그 텍스트블록 내용의 끝이다. 그 `blockContainer`가 자식 `blockGroup`을 가진다. 하나라도 아니면 현행 `insertContent`다.
  - 부모 타입과 attrs는 유지된다. 열린 toggle·heading·quote·번호 목록·체크 목록 모두 같다. 자식 있는 빈 문단은 빈 문단을 유지하고 같은 규칙이다. 손자가 있는 자식의 끝은 그 자식의 첫 자식이 된다.
  - 같은 텍스트블록 안 범위가 블록 끝에서 끝나면 범위를 지운 뒤 같은 규칙이다. 선택하지 않은 앞 텍스트는 남는다. 삭제와 삽입은 한 transaction이다. dispatch·revision·undo가 각각 1회다. 캐럿은 삽입 내용 끝이다.
  - 삽입 깊이는 계산한 삽입 위치 기준이다. 새 블록이 자식 자리에 들어가므로 캐럿 블록보다 한 단 깊다. `clampDepth`가 `MAX_NESTING_DEPTH`를 넘는 목록을 평탄화한다. 깊이 `MAX-1` 부모의 첫 자식 자리에 3단 목록을 붙이면 `a`, `b`, `c`가 같은 층위로 놓이고 최대 깊이가 `MAX`다.
  - 배치 계산은 `paste-block-placement.ts`의 `resolvePasteBlockPlacement`가 맡는다. 호출부는 `clipboard-paste-extension.ts`의 `insert`다. 공개 API는 바뀌지 않는다. HTML과 Markdown 감지 경로가 같은 `insert`를 쓴다.
  - 현행 유지: 자식 없는 블록, 자식 있는 블록의 시작·중간 캐럿, 블록 끝에서 끝나지 않는 같은 블록 범위, 다른 블록에 걸친 범위. 시작 캐럿의 빈 head(`p ""`)와 중간 캐럿의 분할은 자식 없는 블록에도 나오는 baseline이다. 이슈 서술의 "시작 캐럿" 결함은 자식이 `abcd`에 남으므로 해당하지 않는다.
  - 한계: 시작이 끝 블록과 다른 블록인 범위는 대상이 아니다. `[p0 "abcd", p1 "efgh" 자식 [child]]`에서 p0 offset 2부터 p1 끝까지 `<p>X</p><p>Y</p>`를 붙이면 `[p "ab", X, Y, p "" 자식 [child]]`다. 빈 껍데기가 자식을 가진다. 범위 대체의 `replaceWith` 의미(#286)와 자식 귀속 정책이 걸려 별건이다. 정정(2026-10-07, Issue #294): 해소됐다. 아래 #294 문단을 따른다.
  - 한계: 표를 포함한 HTML은 표 붙여넣기 경로(`TablePasteExtension`)가 먼저 처리한다. 이 규칙의 대상이 아니다. 새 블록이 최상위 형제로 놓인다.
  - 한계: 평문 경로(#284)와 drop(#285)은 바꾸지 않았다. 같은 내용도 평문 한 줄이면 캐럿 블록 텍스트에 이어 붙는 다른 의미다. 표 셀 안과 내부 드래그도 바꾸지 않았다.
- 다른 블록에서 시작해 자식 있는 블록 끝에서 끝나는 범위의 HTML·Markdown 배치(정정 2026-10-07, Issue #294). 붙여넣기는 범위 삭제 뒤 캐럿 삽입이다. 삭제는 Backspace·글자 입력과 같은 PM 기본 삭제라 끝 블록의 자식이 시작 블록의 자식이 된다. 삽입은 지운 뒤 캐럿에 #290 배치를 적용한다. 이전에는 `insertContent`가 범위를 한 번에 대체해 빈 껍데기가 자식을 가졌다. `[p0 "abcd", p1 "efgh" 자식 [child], tail]`에서 p0 offset 2부터 p1 끝까지 `<p>X</p><p>Y</p>`를 붙이면 `[p "ab", X, Y, p "" 자식 [child], tail]`였다.
  - 위 문서는 `[p "ab" 자식 [X, Y, child], tail]`가 된다. 자식 id는 보존되고 빈 블록이 생기지 않는다. 시작이 heading이면 `[h2 "he" 자식 [X, Y, child], tail]`다. 시작 블록의 타입과 attrs가 유지된다. 단일 블록 HTML도 같다. 새 블록이 시작 블록의 형제가 아니라 자식이다. 끝 블록에 자식이 없는 같은 모양(`[he, X, Y, tail]`)과 다르다. #290의 같은 블록 범위와 같은 차이다.
  - 대상은 넷을 모두 만족하는 입력이다. `TextSelection`이고 비어 있지 않다. 시작과 끝의 텍스트블록이 다르다. 끝이 중첩 가능한 텍스트블록 내용의 끝이다. 그 `blockContainer`가 자식 `blockGroup`을 가진다. 하나라도 아니면 현행이다. 같은 텍스트블록 안 범위는 #290 경로다.
  - 시작 블록의 자식은 범위 안이라 삭제된다. 시작이 접힌 toggle이면 지운 뒤 캐럿 규칙(#252)에 따라 새 블록이 컨테이너 뒤 형제다.
  - 끝 블록이 접힌 toggle이면 특례가 없다. 삭제처럼 toggle 타입을 잃고 숨은 자식이 시작 블록의 보이는 자식이 된다. 새 블록은 그 앞의 첫 자식이다. 4.4의 #264(범위 삭제·붙여넣기는 범위 전체를 본다)를 따른다.
  - 삭제와 삽입은 한 transaction이다. dispatch·revision·undo가 각각 1회다. 캐럿은 삽입 내용 끝이다. 깊이는 지운 뒤 삽입 위치 기준이고 `clampDepth`가 `MAX_NESTING_DEPTH`를 넘는 목록을 평탄화한다.
  - 배치 판정은 `paste-block-placement.ts`의 `isRangeEndingAtChildrenBlockEnd`가 맡는다. 호출부는 `clipboard-paste-extension.ts`의 `insert`다. `resolvePasteBlockPlacement`는 바꾸지 않았다. 지운 뒤 캐럿이 대상이 아니면 그 캐럿에 단일 캐럿 붙여넣기(`insertContent`)를 한다. 공개 API는 바뀌지 않는다.
  - 현행 유지: 끝 블록에 자식이 없는 같은 모양, 끝이 내용 끝이 아닌 범위(남은 텍스트가 자식을 가진다), 같은 블록 범위, 끝 codeBlock 잔여(#286), 시작이 codeBlock 안인 범위.
  - 한계: 시작이 끝 블록보다 깊거나 끝 블록이 부모의 자식인 모양은 삭제 기준선을 따른다. 삭제가 빈 블록을 남기고 그 아래에 자식이 있다. `[par 자식 [s "abcd"], e "efgh" 자식 [child], tail]`에서 s offset 2부터 e 끝까지 붙이면 `[par 자식 [s "ab", X, Y], p "" 자식 [child], tail]`다. `[p0 "abcd", par 자식 [e "efgh" 자식 [child], sib], tail]`에서 p0 offset 2부터 e 끝까지 붙이면 `[p "ab" 자식 [X, Y, p "" 자식 [child], sib], tail]`다. Backspace도 같은 빈 블록을 남기므로 붙여넣기만의 결함이 아니다.
  - 한계: 표 셀 안, 평문 경로(#284·#285), 시작이 codeBlock 안인 범위는 바꾸지 않았다. 표 경계 범위는 #292가 먼저 지운다. 정정(2026-10-07, Issue #297): 표 셀 안에서 무효 문자가 섞인 평문은 정리본을 넣는다. 이 문단의 HTML·Markdown 배치와는 별개다(아래 #297 문단).
- 붙여넣기·drop 평문의 줄 경계와 감지 입력(정정 2026-10-07, Issue #291). 줄 경계는 CRLF·CR·LF다. Tab 외 제어문자 유무가 줄 배치와 Markdown 감지를 바꾸지 않는다. 이전에는 단독 `\r`이 지워져 한 줄로 합쳐졌고, 제어문자 하나가 Markdown 감지를 껐다.
  - 정규화 순서는 CR → LF가 먼저, 무효 문자 제거(`sanitizeInlineText`)가 그다음이다. 삽입용은 `normalizePasteText`다(`plain-text-paste.ts`). U+2028·U+2029·U+0085는 줄 경계가 아니다. 건드리지 않는다.
  - 직접 삽입·codeBlock 걸친 범위 분기·`view.pasteText` 폴백·drop이 같은 정규화본에서 나온다. 감지만 입력이 한 지점 다르다. 감지 전용 `normalizeForMarkdownDetection`은 CR을 LF로 바꾼 뒤 Tab 외 무효 문자만 지운다. Tab은 감지 입력에서 지우지 않는다. 삽입용은 Tab까지 지운다(QA-078).
  - Tab을 남기는 이유는 Markdown 구조와 코드 내용이다. 줄 앞 Tab(중첩 목록 `- a\n\t- b`, 들여쓴 코드 `\tcode`), 마커 뒤 Tab(`1.\tfoo`, `#\tHeading`, `-\tone`), 코드 펜스·들여쓴 코드 안 Tab(`a\tb`)이 이전과 같다. codeBlock 정책(model)이 Tab을 허용한다.
  - Tab 외 제어문자(U+0001·ESC 등)는 감지를 끄지 않는다. `# H\u0001\n\nbody`는 heading이다. 코드 펜스 안 `\u0001`이 있어도 codeBlock이다. 코드 내용의 Tab은 남는다(`a\tb\u0001c` → `a\tbc`). 이전에는 이 입력 전부가 감지되지 않아 문단으로 들어갔다.
  - 인라인 본문(문단·heading·목록 항목 텍스트)에 Tab이 있으면 `importMarkdown`이 거절해 감지가 꺼지고 평문으로 들어간다. 이전과 같다. `a\tb\n\nc`는 감지되지 않고 `[ab, c]`로 이어 붙는다(Tab 정책 QA-078).
  - 단독 `\r`은 단독 `\n`과 같다. 줄 경계 하나다. `\r\r`은 `\n\n`과 같아 Markdown 문단 경계다.
  - `view.pasteText` 위임 판정은 CR을 무효 문자로 세지 않는다. 정규화본이 CR→LF 변환만 한 입력과 같고 html 폴백이 아니면 raw 그대로 PM 기본에 위임한다. CRLF만 있는 평문은 최종 문서 결과가 이전과 같다. 이전에는 sanitize가 CR을 지워 `view.pasteText`를 불렀고, 지금은 raw를 PM 기본에 위임하고 `view.pasteText`를 부르지 않는다. 무효 문자가 있을 때만 정규화본으로 `view.pasteText`를 부른다.
  - 빈 판정은 raw 클립보드 값으로 한다. 제어문자만 있는 입력은 이벤트를 소비하고 문서를 바꾸지 않는다.
  - drop은 같은 `normalizePasteText`를 쓴다. 단독 `\r` 평문 drop도 직접 삽입으로 줄이 나뉜다.
  - 표 셀 안 평문과 `clipboardTextParser`는 바꾸지 않았다. `clipboardTextParser`는 raw 입력도 받으며 CR을 이미 줄 경계로 나눈다. 공개 API는 바뀌지 않는다. 정정(2026-10-07, Issue #297): 표 셀 안에서 무효 문자가 섞인 평문은 정리본을 `view.pasteText`로 넣는다. 아래 #297 문단이 현재 계약이다.
  - 한계: 인라인 본문에 Tab이 있는 Markdown은 감지되지 않고 평문으로 들어간다. 변경 전과 같다.
  - 한계(정정 2026-10-07, Issue #295): 시작이 codeBlock 밖인 codeBlock 걸친 범위의 한 줄 평문에 제어문자가 섞이면 붙여넣기가 사라지던 한계는 해소했다. 아래 #295 문단이 현재 계약이다.
- codeBlock에 걸친 범위의 무효 문자 평문(정정 2026-10-07, Issue #295). 시작이 codeBlock 밖인 codeBlock 걸친 범위에 무효 문자(U+0001 등 제어문자, 짝 없는 surrogate)가 섞인 평문을 붙여도 붙여넣기가 사라지지 않는다. 무효 문자를 지운 평문이 범위를 대체한다. 이전에는 한 줄 평문이 PM 기본에 위임됐다. PM 기본이 raw 무효 문자를 넣었고, 문서 검증 실패로 `revision-guard-extension.ts`가 문서를 되돌렸다. 붙여넣기가 문서를 바꾸지 않고 사라졌다. `onChange`도 `TypeError`도 없었다.
  - 위임 가능 여부(`delegable`)를 한 번 계산한다. 정규화본이 CR→LF 변환만 한 입력과 같으면 참이다. 이 값을 세 곳이 공유한다. codeBlock 걸친 범위의 한 줄 조기 반환, 같은 범위의 직접 삽입 실패 뒤 위임, 비-codeBlock 경로의 `view.pasteText` 위임 판정이다.
  - 유효한 한 줄 평문만 PM 기본에 위임한다. 결과는 이전과 같다(`ab` → `[p "ababbar", p "tail"]`, `view.pasteText` 미호출).
  - 무효 문자가 섞인 한 줄 평문은 정리본을 `view.pasteText`로 넣는다. PM 자신의 `doPaste`라 transaction이 하나다. dispatch·undo가 각각 1회다. `a` U+0001 `b`와 `a` U+D800 `b`가 모두 `[p "ababbar", p "tail"]`다.
  - 제어문자만 있는 입력은 이벤트를 소비하고 문서를 바꾸지 않는다. 범위를 지우지 않는다. 비-codeBlock 경로와 같다. `TypeError`는 없다.
  - 직접 삽입이 안 되는 선택(`NodeSelection`·`AllSelection`)의 여러 줄 평문도 같다. 무효 문자가 섞이면 정리본을 `view.pasteText`로 넣는다. 유효한 여러 줄은 PM 기본 위임 그대로다.
  - Markdown 감지는 이 범위에서 건너뛴다(#286). 바꾸지 않았다.
  - 한계(정정 2026-10-07, Issue #296): 캐럿이 codeBlock 안일 때와 시작이 codeBlock 안인 범위는 바꾸지 않았다. 무효 문자가 섞이면 같은 되돌림으로 붙여넣기가 사라지던 한계는 해소했다. 아래 #296 문단이 현재 계약이다. 원래 한계 근거는 그대로다. codeBlock 안은 Tab·LF를 보존해야 해서 `normalizePasteText`(Tab 삭제)를 쓸 수 없다.
  - 한계(정정 2026-10-07, Issue #297): 표 셀 안은 바꾸지 않았다. 무효 문자가 섞이면 같은 되돌림으로 붙여넣기가 사라지던 한계는 해소했다. 아래 #297 문단이 현재 계약이다. Tab이 든 한 줄 평문은 TSV 표 붙여넣기가 먼저 가로챈다. 이 경로 밖이다.
- 캐럿·시작이 codeBlock 안인 붙여넣기의 무효 문자 평문(정정 2026-10-07, Issue #296). 캐럿이 codeBlock 안이거나 범위의 시작(`$from`)이 codeBlock 안일 때 무효 문자(U+0001 등 제어문자, 짝 없는 surrogate)가 섞인 평문을 붙여도 붙여넣기가 사라지지 않는다. 무효 문자만 지운 평문이 선택을 대체한다. 이전에는 입력과 무관하게 PM 기본에 위임했다. PM 기본이 raw 무효 문자를 넣었고 `revision-guard-extension.ts`가 문서를 되돌렸다. 붙여넣기가 문서를 바꾸지 않고 사라졌다. `onChange`도 `TypeError`도 없었다.
  - 정규화본은 `normalizeCodeBlockPasteText`다. CR을 LF로 바꾼 뒤 `isValidCodeBlockSource`가 거부하는 문자만 지운다. Tab·LF는 코드 내용이라 남긴다. U+2028·U+2029·U+FEFF·U+0085도 유효라 남긴다. 출력은 항상 모델 검증을 통과한다.
  - 유효한 평문은 PM 기본에 위임한다. `view.pasteText`를 부르지 않고 결과는 이전과 같다. 비교 기준은 `normalizeLineBreaks(rawText)`다. CR→LF 변환만 다른 입력은 유효로 본다.
  - 무효 문자가 섞인 평문은 정리본을 `view.pasteText`로 넣는다. PM 자신의 `doPaste`라 transaction이 하나다. dispatch·undo가 각각 1회다. 범위 선택은 PM 기본과 같이 정리본으로 대체된다.
  - 정리본이 비는 입력(제어문자만 있는 입력)은 이벤트를 소비하고 문서와 선택을 바꾸지 않는다. dispatch가 없다. 범위를 지우지 않는다. 시작이 codeBlock 밖인 경로(#295)와 같다.
  - `text/html`이 함께 와도 평문 정리본만 쓴다. PM이 codeBlock 안에서 html을 무시하는 현행과 같다.
  - 예: 문서 `p1 "abcd"`, `cb "foobar"`, `tail`에서 `a` U+0001 `b`를 붙이면 캐럿 cb:3은 `code "fooabbar"`, cb:2 ~ tail:2는 `code "foabil"`과 빈 문단, cb:1 ~ cb:4는 `code "fabar"`다.
  - 한계(정정 2026-10-07, Issue #297): 표 셀 안은 바꾸지 않았다. 표 셀 안 가드가 먼저 물러난다. 무효 문자가 섞인 평문이 사라지던 한계는 해소했다. 아래 #297 문단이 현재 계약이다.
  - 한계: codeBlock 안에서 Tab이 든 TSV 모양 입력(모든 줄의 탭 개수가 같은 직사각형)은 표 붙여넣기가 먼저 가로채 표 블록을 만든다. 유효한 입력도 같고 수정 전과 같다(jsdom 실측). 이 경로 밖이다. 정정(2026-10-07, Issue #298): 이 한계는 해소했다. 캐럿이나 시작이 codeBlock 안이면 표 붙여넣기가 물러나 평문이 코드 텍스트로 들어간다. 현재 계약은 r1 슬라이스 11 스펙 §7.2의 Issue #298 문단이다.
  - 한계: Firefox·WebKit은 측정하지 않았다. Chromium만 실측했다.
- 표 셀 안 평문 붙여넣기의 무효 문자(정정 2026-10-07, Issue #297). 표 셀 안 캐럿이나 같은 셀 안 범위에 무효 문자(U+0001 등 제어문자, 짝 없는 surrogate)가 섞인 평문을 붙여도 붙여넣기가 사라지지 않는다. 무효 문자와 Tab을 지운 평문이 선택을 대체한다. 이전에는 표 셀 안이면 입력과 무관하게 PM 기본에 맡겼다. PM 기본이 raw 무효 문자를 넣었고 `revision-guard-extension.ts`가 문서를 되돌렸다. 붙여넣기가 문서를 바꾸지 않고 사라졌다. `onChange`도 `TypeError`도 없었다.
  - 개입 조건은 둘이다. 선택이 `CellSelection`이 아니다. `text/html`이 비어 있다. 하나라도 아니면 이전과 같다. 셀 안 인라인 atom `NodeSelection`은 개입 대상이다.
  - 처리는 표 셀 안 가드 안에서 한다. `pasteHandler`와 `defaultHandlePaste`는 부르지 않는다. 표 셀 안에서 `pasteHandler`를 부르지 않는 계약(roadmap "제외 범위")은 그대로다.
  - 정규화본은 표 밖 평문과 같은 `normalizePasteText`다. CR을 LF로 바꾼 뒤 무효 문자를 지운다. 셀은 인라인 정책이라 Tab도 지운다.
  - 유효한 평문은 PM 기본에 맡긴다. `view.pasteText`를 부르지 않고 결과는 이전과 같다. 비교 기준은 `normalizeLineBreaks(rawText)`다.
  - 무효 문자가 섞인 평문은 정리본을 `view.pasteText`로 넣는다. PM 자신의 `doPaste`라 transaction이 하나다. dispatch·undo가 각각 1회다.
  - 정리본이 비는 입력(제어문자만 있는 입력)은 이벤트를 소비하고 문서와 선택을 바꾸지 않는다. dispatch가 없다. 범위를 지우지 않는다. #295·#296과 같다.
  - 한 줄 예: 문서 `p "para"`, 1x1 표 `"cell"`, `tail`에서 `a` U+0001 `b`를 붙이면 셀 끝 캐럿은 `cellab`이다. 같은 셀 안 범위 `c[el]l`은 `cabl`이다. 1x2 표의 마지막이 아닌 셀 끝 캐럿(`c1`)은 `c1ab`다. `a` U+D800 `b`도 같다.
  - 여러 줄은 유효한 여러 줄과 구조가 같다. 마지막 셀은 첫 줄만 셀에 들어가고 나머지는 표 뒤 문단이 된다. `a` U+0001 `b\nc`는 셀 `cellab`과 표 뒤 문단 `c`다. 마지막이 아닌 셀은 PM이 표를 쪼갠 뒤 되돌림 guard가 복원해 문서가 그대로다.
  - 표 경계 범위(#292)는 `TableBoundaryInputExtension`이 범위를 먼저 지운다. 이 핸들러는 지운 뒤 state를 읽는다. 시작이 셀 안이고 끝이 뒤 문단 안이면 캐럿이 셀 안이라 이 분기가 정리본을 넣는다(셀 `ceab`, 뒤 문단 `il`). 시작이 표 밖이면 캐럿이 표 밖이라 표 밖 경로가 넣는다.
  - 셀 안 인라인 atom `NodeSelection`에 무효 문자가 섞인 평문을 붙이면 정리본이 atom을 대체한다(`ab` atom `cd`에 `a` U+0001 `b`를 붙이면 `ababcd`). 유효 평문은 PM 기본이라 이전처럼 atom을 대체한다.
  - 현행 유지: `text/html` 동반(PM이 html만 쓴다), `CellSelection`, TSV 한 줄(표 붙여넣기가 먼저 처리한다), 표 밖과 codeBlock 안.
  - 한계: `text/html`이 함께 오면 개입하지 않는다. 개입하면 셀 서식(mark)을 잃는다. html 안의 무효 문자는 바꾸지 않았다.
  - 한계: 공백뿐이거나 파싱 결과가 빈 `text/html`이 함께 와도 개입하지 않는다. PM이 html만 쓰므로 유효 평문까지 사라진다. 수정 전과 같다. 표 밖은 #287 폴백이 평문을 넣는다.
  - 한계: 표 경계 범위의 제어문자만 있는 입력은 범위 삭제가 남는다. `TableBoundaryInputExtension`이 raw 기준으로 비었는지 판정해 먼저 지운다. 이 문단의 "범위를 지우지 않는다"는 같은 셀 안 범위와 캐럿에만 해당한다.
  - 한계: `CellSelection`에서는 유효 평문도 사라진다. 원인이 무효 문자가 아니라 NOID 셀의 되돌림이라 이 문단 밖이다.
  - 한계: 유효한 여러 줄 평문은 이전 그대로다. 마지막 셀은 둘째 줄 이후가 표 뒤 문단으로 빠지고, 마지막이 아닌 셀은 붙여넣기가 사라진다. 이 문단은 무효 문자만 다룬다.
  - 한계: Firefox·WebKit은 측정하지 않았다. Chromium만 실측했다.

## 8. 오류 계약 확장

`packages/core/src/errors.ts`의 `EditorError` union에 추가:

- `CODE_BLOCK_MARK_NOT_ALLOWED`(4.3)

`packages/model`의 `DOCUMENT_INVALID`/`DOCUMENT_LIMIT_EXCEEDED`를 재사용(전용 코드를 새로 만들지 않음):

- 재귀 중첩 깊이 초과(3.2, JSON 문서 로드) → `DOCUMENT_LIMIT_EXCEEDED`. HTML import는 초과 전에 평탄화하므로 이 코드를 내지 않는다(7.1, Issue #132)
- `codeBlock` content의 비정규 shape, 금지 mark, 금지 source 문자 또는 빈 language(4.3, 로드 시점) → `DOCUMENT_INVALID`
- `collapsed`가 있는데 `isToggleable`이 아닌 heading(4.1) → `DOCUMENT_INVALID`
- 전역 ID 중복(3.2, 트리 전체) → `DOCUMENT_INVALID`

`packages/io` import warning union에 추가:

- HTML `CODE_BLOCK_LANGUAGE_METADATA_IGNORED` — 우선순위에서 탈락한 non-empty language metadata가 선택값과 충돌
- GFM `CODE_BLOCK_META_DROPPED` — mdast code `meta`를 저장 모델이 표현하지 못해 제거

HTML CodeBlock의 선택된 language/source 문자 위반은 warning으로 복구하지 않고 기존 `HTML_DOCUMENT_INVALID` import error로 반환한다(7.1).

## 9. 검증 전략

R1 `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md` 12절의 전략을 R2 대상으로 확장한다 — 새 카테고리만 기록한다.

- **모델 단위 테스트**: 재귀 `children` round-trip, 전역 ID 유일성(깊은 중첩 포함), 깊이 상한 거절, `codeBlock` 단일 source 정규형·mark·문자·language 거절, heading `collapsed`/`isToggleable` 불변식.
- **입출력 단위 테스트**: HTML/GFM 신규 요소 round-trip(7.1), bare `<pre>`·metadata 우선순위/충돌 warning·GFM meta warning·indented code·CRLF canonicalization, GFM strict 실패 케이스(토글·색상·정렬), GFM lossy 손실 경고, IO-007 clipboard 우선순위 fixture.
- **코어 통합 테스트**: 각 신규 명령의 단일 트랜잭션·무변경 실패, `indentBlock`/`outdentBlock`/Code 공백 2개의 3분기 Tab 라우팅, Code/mixed selection의 공개 command 오류와 DOM mark 단축키 no-op, 다중 선택 삭제/이동의 `children` 동반 이동.
- **Playwright**: 슬라이스마다 Chromium 시나리오, 슬라이스 11에서 3-엔진 전체 게이트(R1과 동일한 순서).

## 10. 후속 확장 경계

- R3가 파일 블록을 추가하면 `IO-007`의 파일 붙여넣기를 완성한다(2.2) — 이 명세는 파일 붙여넣기의 형태를 선결정하지 않는다.
- 표 셀 안 블록 중첩은 이 명세의 범위가 아니다. 필요해지면 별도 설계가 있어야 한다(3.2). 표 블록 자체를 문서 안에서 들여쓰기(다른 블록의 자식으로 두는 것)는 R2 범위다(2.2).
- Yjs 공동 편집(R6)의 다중 선택·중첩 이동 충돌 정책은 이 명세가 선결정하지 않는다(기존 `TableGrid`/CRDT 확장 경계와 같은 원칙).

## 11. R2 완료 조건

roadmap.md R2 완료 조건 4개를 그대로 인용한다(약화·추가하지 않음).

- 모든 기본 블록이 생성, 종류 변경, 중첩, 이동, 저장과 복원된다.
- 목록 번호·체크·토글 상태가 round-trip된다.
- 다중 선택 조작과 undo가 브라우저에서 검증된다.
- 일반 clipboard 우선순위와 fallback이 fixture로 고정된다(2.2 — 파일 부분은 `PARTIAL`로 남고 이 조건은 HTML/Markdown/plain text 범위로 판정한다).
