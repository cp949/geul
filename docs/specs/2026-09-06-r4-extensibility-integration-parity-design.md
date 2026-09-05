# R4 확장성과 제품 통합 Parity 설계

## 1. 결정 요약

R4는 라이브러리 소비자가 자체 schema, UI, 번역과 서버 처리를 연결할 수 있게 한다(roadmap.md R4 사용자 결과). 24개 기능 ID가 서로 약하게 결합된 10개 하위 영역(공개 API, 커스텀 schema, extension/command 등록, 커스텀 UI, theming, i18n, mobile/a11y, custom paste handler, SSR, 서버 렌더)으로 나뉜다.

**전제**: geul은 BlockNote API 호환을 목표하지 않는다 — `docs/product/blocknote-free-feature-inventory.md` §4가 "BlockNote API와 JSON 호환"을 이미 명시적 제외 기능으로 선언했다("제품이 호환성보다 독자 공개 계약을 선택함"). `EXT-001`~`EXT-013`의 목표 수준은 전부 `PARITY`("BlockNote 무료 기능과 동등한 **사용자 결과**")이지 API 시그니처 동등이 아니다. 이 전제가 R4 전체 설계의 축이다 — 특히 커스텀 schema는 BlockNote식 전면 제네릭 재설계 대신 비제네릭 registry로, extension 등록은 raw ProseMirror/Tiptap 노출 없이 geul 자체 `Result<T,E>` 계약으로 구현한다.

BlockNote 동작 근거: 로컬 소스(`/work/thrd/BlockNote`, 커밋 `19b9b19d1`, 2026-08-26)를 직접 조사해 API **형태**(시그니처·계약)만 참고했다. `AGENTS.md`("BlockNote의 소스 코드, 컴포넌트, 스타일과 아이콘을 복사하지 않는다")에 따라 코드·컴포넌트·스타일·아이콘·번역 문구는 복사하지 않는다(i18n 정책은 §8).

geul 현재 구조 근거: `packages/core/src/editor-controller.ts`(`EditorController` 공개 API), `packages/core/src/production-editor-session.ts`(`runDocumentCommand` 단일 명령 실행 진입점 — 트랜잭션 적용→문서 diff→revision 증가→`onChange` 발화를 한 곳에서 수행), `docs/adr/0002-enforce-layered-package-boundaries.md`(ADR-0002, 패키지 경계 불변식)를 2026-09-06 실측 조사로 확인했다.

이 명세는 `docs/product/roadmap.md` R4 절과 `docs/product/blocknote-free-feature-inventory.md`의 R4 배정 기능 ID를 구체화한다. 전체 기능 범위와 릴리스 순서는 그 두 문서가 소유하며 이 문서에 복제하지 않는다.

## 2. 범위

### 2.1 R4 범위

기능 ID(모두 `NOT_STARTED`, `docs/product/blocknote-free-feature-inventory.md` 기준):

- `DOC-004` 블록 읽기와 순회 API, `DOC-005` 블록 삽입·수정·교체·삭제 API, `DOC-006` 블록 이동·중첩·중첩 해제 API
- `DOC-007` 커서 조회·설정 API, `DOC-008` 선택 범위 조회·설정 API
- `DOC-009` lifecycle·selection·change 이벤트, `DOC-010` 변경 전 검사와 취소
- `DOC-013` 읽기 전용 편집기
- `EXT-001` 사용자 정의 블록 schema, `EXT-002` 사용자 정의 인라인 콘텐츠 schema, `EXT-003` 사용자 정의 style/mark schema, `EXT-004` schema 확장과 처음부터 구성
- `EXT-005` 사용자 정의 extension과 command 등록
- `EXT-006` 사용자 정의 slash·suggestion menu, `EXT-007` formatting/link/side/table UI 교체
- `UI-012` emoji picker, `UI-013` 메뉴·popover portal target 제어
- `EXT-008` CSS 변수·theme·DOM 속성·style override
- `EXT-009` i18n dictionary와 사용자 번역, `EXT-010` v0.54.0 기본 locale 사전 전체
- `UI-015` BlockNote 지원 범위의 mobile·touch UI, `UI-016` 키보드 focus와 ARIA 접근성 계약
- `IO-008` 사용자 정의 paste handler
- `EXT-013` Next.js 등 SSR framework의 client-only 통합
- `IO-009` 서버 측 parse/render

### 2.2 R4 제외 범위와 roadmap 해석

roadmap R4 범위 bullet에 없는 항목은 구현하지 않는다. 브레인스토밍·그릴링(2026-09-06)에서 확정한 항목별 축소·이월과 근거:

- **BlockNote API/타입 호환** — `blocknote-free-feature-inventory.md` §4가 이미 명시적으로 제외했다. `EXT-*`는 사용자 결과 동등만 요구한다.
- **커스텀 schema의 전면 제네릭 재설계** — `model`/`core`/`react` 전체를 `Block<TSchema>`로 매개변수화하는 BlockNote식 설계는 채택하지 않는다(§4.1 근거). 비제네릭 registry로 같은 사용자 결과(등록·저장·렌더)를 달성한다.
- **커스텀 블록/인라인의 자식 중첩** — `CustomBlock`은 leaf 전용이다(`children` 없음). 중첩 커스텀 블록이 필요해지면 별도 설계·이슈가 있어야 한다(2026-09-06 사용자 승인).
- **커스텀 인라인 콘텐츠의 완전한 텍스트-급 편집 UX**(캐럿 통과, 텍스트처럼 선택·복사) — leaf 삽입·렌더·JSON round-trip만 R4 범위다(2026-09-06 사용자 승인).
- **raw ProseMirror Plugin·Tiptap Extension 등록** — `EXT-005`는 geul 자체 command/keyboard-shortcut 등록 계약만 제공한다. ADR-0002("core의 공개 declaration에는 Tiptap 또는 ProseMirror 타입을 노출하지 않는다")를 그대로 유지한다(2026-09-06 사용자 승인).
- **UI 프리미티브(Button/Menu/Popover) 단위 교체(`Components` context 계층)** — 최상위 컴포넌트(`SlashMenu`/`FormattingToolbar`/`LinkToolbar`/`MediaToolbar`/`FilePanel` 등) override prop만 추가한다. BlockNote의 2계층 중 1계층만 구현한다(2026-09-06 사용자 승인).
- **기본 slash 메뉴 항목 대체** — 소비자는 항목을 추가만 할 수 있다. 항목 제거·전체 교체는 범위 밖이다(2026-09-06 사용자 승인).
- **번들 dark theme 값** — `EXT-008`은 CSS 변수·DOM attribute override *메커니즘*만 제공한다. geul 자체 dark 팔레트를 새로 디자인하지 않는다.
- **22개 비영어·비한국어 로케일의 실제 번역**(`EXT-010`) — 에이전트가 22개 언어를 신뢰성 있게 번역할 수 없다. R4는 `Dictionary` 타입·key 구조 인프라 + 영어(`en`) + 한국어(`ko`) 2개 언어만 완성한다. 나머지 20개 로케일은 언어 "목록"(BlockNote v0.54.0 기준 23개 언어 커버리지)만 인벤토리에 남기고 번역 자체는 후속 이슈로 승인 이월한다(2026-09-06 사용자 승인, R2 `IO-007` 파일 붙여넣기 이월과 동일 패턴 — §8.4).
- **번역 문구 자체를 BlockNote 사전에서 재사용** — `AGENTS.md`의 "BlockNote 소스·컴포넌트·스타일·아이콘 복사 금지" 취지를 문구에도 적용해 geul 자체 UI 문구 기준으로 독자 작성한다(2026-09-06 사용자 승인).
- **모바일 블록 드래그 재정렬의 터치 UX 전체 재설계**(hover 게이팅 대체, 롱프레스 등) — BlockNote 자체도 네이티브 HTML5 Drag-and-Drop이라 공식적으로 터치 드래그를 지원하지 않는다(2026-09-06 로컬 소스 조사 확인) — PARITY 기준으로 고칠 의무가 없다. 방어적 CSS(`touch-action: none`)만 R4에 포함하고 전체 재설계는 후속 이슈 후보로 기록한다(2026-09-06 사용자 승인, §9.2).
- **WCAG 정량 접근성 기준**(pointer target 크기, live region 등) — R1~R3에 a11y 게이트 전례가 없다(R3 spec §2.2와 동일 근거 재사용). roadmap 완료조건이 요구하는 "핵심 menu·editor flow의 keyboard-only 조작+ARIA 속성"만 범위다.
- **Yjs 공동 편집, comment, 버전 관리** — roadmap이 R6로 명시 배정했다.
- **XLSX/CSV, iframe/p5.js** — roadmap이 R7/R8로 명시 배정했다.

## 3. 공개 편집기 API (`DOC-004`~`010`, `DOC-013`)

### 3.1 현재 상태

`EditorController`(`packages/core/src/editor-controller.ts`)는 이미 `getDocument()`(전체 트리 조회), 다수의 타입 전용 명령(`moveBlockBefore`/`duplicateBlock`/`deleteBlock`/`indentBlock`/`outdentBlock`/`setBlockType` 등, 전부 `Result<T,EditorError>` 반환), pull 방식 선택 조회(`getCaretBlockContext`/`getSelectionBlockType`/`getBlockSelection` 등)를 제공한다. 모든 명령은 `ProductionEditorSession.runDocumentCommand(command, reason, run)` 단일 진입점(트랜잭션 적용→diff→revision 증가→`onChange` 발화)을 통과한다.

빠진 것: 단일 블록 조회(`getBlock`), 임의 `Block` 형태를 받는 범용 삽입/수정/교체/삭제, 프로그램적 커서·선택 이동(setter), selection 변경 push 이벤트, 변경 전 취소가 가능한 공개 hook, 읽기 전용 토글.

### 3.2 신규 API

```ts
// 읽기·순회 (DOC-004)
getBlock(blockId: string): Block | undefined;
getPrevBlock(blockId: string): Block | undefined;
getNextBlock(blockId: string): Block | undefined;
getParentBlock(blockId: string): Block | undefined;
forEachBlock(
  callback: (block: Block, parent: Block | null) => boolean | void,
  options?: { reverse?: boolean },
): void; // callback이 false를 반환하면 순회 중단

// 조작 (DOC-005) — 기존 타입 전용 명령과 별개 계층, 임의 Block 형태를 받는다
insertBlocks(
  blocksToInsert: PartialBlock[],
  referenceBlockId: string,
  placement?: "before" | "after", // 기본 "before"
): Result<Block[], EditorError>;
updateBlock(blockId: string, update: PartialBlock): Result<Block, EditorError>;
replaceBlocks(
  blockIdsToRemove: string[],
  blocksToInsert: PartialBlock[],
): Result<{ insertedBlocks: Block[]; removedBlocks: Block[] }, EditorError>;
removeBlocks(blockIds: string[]): Result<Block[], EditorError>;

// 이동·중첩 (DOC-006) — 기존 명령 재사용, 신규 편의 API만 추가
moveBlocksUp(blockIds: string[]): Result<void, EditorError>; // 기존 moveBlockBefore 조합
moveBlocksDown(blockIds: string[]): Result<void, EditorError>;
// indentBlock/outdentBlock/moveBlockBefore/moveSelectedBlocksBefore는 기존 그대로 재사용

// 커서·선택 (DOC-007, DOC-008) — 조회는 기존 유지, setter만 신규
setTextCursorPosition(blockId: string, placement?: "start" | "end"): Result<void, EditorError>;
setSelection(startBlockId: string, endBlockId: string): Result<void, EditorError>;
```

`PartialBlock`은 `{ type: Block["type"]; id?: string } & Partial<Omit<Block, "type" | "id">>` 형태로 타입별 필수 하위 구조(표의 행/열/셀 등)는 여전히 해당 타입 전용 필드를 요구한다 — 이 API는 새로운 완화된 검증을 만들지 않고 기존 `model` 검증에 위임한다. 표·미디어처럼 이미 전용 명령(`insertMediaBlock`, table 명령 15종)이 있는 타입은 그 명령이 더 정확한 에러를 준다는 안내를 API 문서에 남긴다(대체가 아니라 병행).

텍스트가 없는 leaf 블록(구분선 등)의 `setTextCursorPosition`은 NodeSelection으로 대체한다. `table` 블록은 첫 번째 셀의 시작/끝으로 매핑한다.

### 3.3 이벤트 (`DOC-009`, `DOC-010`)

```ts
// CreateEditorOptions 확장
onSelectionChange?: () => void; // PM selection 변경 시 발화 (신규)
onMount?: () => void;           // mount(element) 성공 직후 (신규)
onUnmount?: () => void;         // unmount() 직전 (신규)
onBeforeChange?: (context: { changes: DocumentChangeEvent }) => boolean | void; // false 반환 시 트랜잭션 거절 (신규)
```

`onBeforeChange`는 다중 등록을 허용하는 목록으로 관리하고 **AND 결합·fail-fast**로 평가한다(하나라도 `false`를 반환하면 즉시 거절). 기존 내부 `canApplyDocumentChange`(revision overflow 방지 가드, `revision-guard-extension.ts`)를 이 목록의 첫 항목으로 편입해 하나의 메커니즘으로 합친다 — 별도 내부/외부 이원 체계를 만들지 않는다.

`onChange`/`onPasteRejected`/`onUploadStateChange`는 변경하지 않는다.

### 3.4 읽기 전용 (`DOC-013`)

```ts
get isEditable(): boolean;
set isEditable(value: boolean);
```

`isEditable = false`는 ProseMirror `editable` prop을 통해 **사용자 DOM 입력(타이핑·클릭 편집)만 차단**한다. 프로그램적 `commands.*`/§3.2 API 호출은 읽기 전용 상태에서도 계속 허용한다(BlockNote의 `isEditable`과 동일한 의미 — 서버 렌더 미리보기·초기 콘텐츠 프로그램적 주입 시나리오가 읽기 전용 상태에서도 문서를 채워야 하는 경우가 실제로 있다, 2026-09-06 사용자 승인).

## 4. 커스텀 schema (`EXT-001`~`004`)

### 4.1 전략 — 비제네릭 registry

`packages/model/src/types.ts`의 `Block`은 완전히 닫힌 discriminated union(14종)이고 `packages/model/src/schema.ts`의 zod 스키마도 `z.discriminatedUnion("type", [...14개])`다(2026-09-06 실측). BlockNote는 `createBlockSpec`/`BlockNoteSchema.create()`의 제네릭 타입 추론으로 커스텀 타입을 컴파일타임에 안전하게 합성하지만, 이를 그대로 이식하려면 `model`/`core`/`react` 전체를 제네릭으로 재설계해야 한다 — §1의 전제(PARITY = 사용자 결과 동등, API 호환 아님)에 따라 이 경로를 채택하지 않는다.

대신 닫힌 union 옆에 열린 catch-all 변형 1종을 추가하고, 타입별 실제 검증·렌더링은 소비자가 등록한 런타임 registry에 위임한다.

### 4.2 저장 모델

```ts
// model — CustomBlock: leaf 전용(children 없음, 2.2)
export type CustomBlock = {
  id: string;
  type: string; // 기존 14종 리터럴과 겹치면 안 됨
  content: "none" | "inline";
  props?: Record<string, string | number | boolean | null>;
};

// InlineContent 확장 — 텍스트 런 옆에 leaf 커스텀 원소 1종 추가(추가적 변경, formatVersion 유지)
export type InlineContentItem =
  | { text: string; marks?: TextMark[] }
  | { type: "custom"; customType: string; props?: Record<string, string | number | boolean | null> };
export type InlineContent = InlineContentItem[];

// TextMark(EXT-003, custom style) — CustomBlock과 동일 registry 패턴
export type CustomTextMark = { type: string; props?: Record<string, string | number | boolean | null> };
// TextMark = 기존 4종 | CustomTextMark
```

`props` 값은 JSON 원시값만 허용한다(중첩 객체·배열 불가 — 이번 R4 범위의 단순화, 필요해지면 후속 확장).

**`model`의 검증 범위는 envelope(구조)까지만이다.** `id`/`type`(예약 타입과 비충돌)/`content`/`props`가 shape을 만족하는지만 검증하고, 타입별 `props` 의미(예: 특정 커스텀 블록이 `count: number`를 기대하는지)는 검증하지 않는다 — `model`은 소비자 registry를 몰라야 순수성(ADR-0002 "model과 io는 DOM, React, Tiptap과 ProseMirror에 의존하지 않는다")을 유지한다. 의미 검증은 `react`가 등록된 renderer를 호출하는 시점(§4.4)의 소비자 책임이다. **이 세부 결정은 브레인스토밍·그릴링에서 명시적으로 논의되지 않았다** — BlockNote의 `propSchema` 컴파일타임 보장보다 약한 보장이며, §4.1에서 이미 승인된 비제네릭 접근의 자연스러운 귀결이라고 판단해 이 spec 작성 시점에 내린 설계 결정이다. 이견이 있으면 여기부터 재검토한다.

### 4.3 zod 구현 — discriminatedUnion 제약과 라우팅 패턴

2026-09-06 실측 확인(zod 4.4.3, `packages/model/package.json`): `z.discriminatedUnion`은 옵션 전원이 discriminant 필드에 **리터럴**(또는 `z.enum`) 값을 가져야 하며, 임의 문자열을 받는 catch-all 멤버를 옵션 배열에 직접 섞으면 첫 `.parse` 호출에서 `Invalid discriminated union option` 런타임 에러를 던진다. `unionFallback` 옵션도 "알려진 리터럴 중 매칭 실패 시 일반 union처럼 폴백"만 지원할 뿐 이 제약을 풀지 않는다. `z.union([blockSchema, customBlockSchema])`로 우회하면 동작은 하지만 실패 시 엉뚱한 branch의 에러 메시지가 노출되는 것도 실측 확인했다(zod의 union 실패-집계 휴리스틱 때문).

따라서 기존 14종 `blockSchema`(discriminatedUnion)는 그대로 두고, 원시 입력의 `type` 값을 zod 파싱 이전에 먼저 확인해 알려진 타입이면 `blockSchema`로, 아니면 `customBlockSchema`로 위임하는 라우팅 계층을 추가한다(파일:`schema.ts`가 이미 쓰는 "zod 파싱 전 원시 값을 먼저 훑는" 기존 스타일과 일관, `findNestingDepthViolation` 패턴 참고):

```ts
const KNOWN_BLOCK_TYPES = new Set([
  "paragraph", "heading", "table", "quote",
  "bulletListItem", "numberedListItem", "checkListItem", "toggleListItem",
  "divider", "codeBlock", "file", "image", "video", "audio",
] as const);

const blockOrCustomSchema: z.ZodType<Block | CustomBlock> = z.custom<unknown>().transform((raw, ctx) => {
  const type = typeof raw === "object" && raw !== null && "type" in raw ? (raw as { type?: unknown }).type : undefined;
  const schema = typeof type === "string" && KNOWN_BLOCK_TYPES.has(type as never) ? blockSchema : customBlockSchema;
  const result = schema.safeParse(raw);
  if (!result.success) {
    for (const issue of result.error.issues) ctx.addIssue(issue); // 원본 스키마의 path·메시지 보존
    return z.NEVER;
  }
  return result.data;
});
```

동일 패턴을 `textMarkSchema`(EXT-003)와 `InlineContentItem`(EXT-002)에도 적용한다. 이 패턴은 재사용 가치가 있어 슬라이스 착수 시 `docs/guides/`에 신규 가이드(카테고리 `CNV`)로 등록하는 것을 검토한다(`AGENTS.md` "정상 구현 경로가 없거나 불명확하면 가이드를 추가·보강한다").

### 4.4 Registry와 등록 API

```ts
// core — CreateEditorOptions 확장
export type CustomBlockDefinition = {
  render: (context: { block: CustomBlock; editor: EditorController }) => { element: HTMLElement; contentRef?: HTMLElement };
  toHtml?: (block: CustomBlock) => string;       // 미등록 시 §4.5 손실 정책
  toMarkdown?: (block: CustomBlock) => string;   // 미등록 시 §4.5 손실 정책
};
export type CustomInlineContentDefinition = {
  render: (context: { item: Extract<InlineContentItem, { type: "custom" }>; editor: EditorController }) => HTMLElement;
  toHtml?: (item: Extract<InlineContentItem, { type: "custom" }>) => string;
};
export type CustomStyleDefinition = {
  render: (value: CustomTextMark) => HTMLElement | { className?: string; style?: Partial<CSSStyleDeclaration> };
  toHtml?: (value: CustomTextMark) => string;
};

customBlocks?: Record<string, CustomBlockDefinition>;
customInlineContent?: Record<string, CustomInlineContentDefinition>;
customStyles?: Record<string, CustomStyleDefinition>;

// "처음부터 구성"(EXT-004) — 제네릭 재설계 대신 허용/차단 목록
enabledBlockTypes?: { mode: "allow" | "deny"; types: Block["type"][] };
```

등록된 타입마다 PM 스키마에 atom 노드 1개(Divider/Table형 — 비포장 `group: "block"` 직접 멤버, `blockId` 자체 소유, 참고: `packages/core/src/table-extension.ts`의 기존 패턴)를 `createEditor(options)` 호출 시점에 조건부로 추가한다 — PM 스키마는 여전히 에디터 생성 시점에 정적으로 결정되고, "마운트 이후 동적 스키마 변경"은 시도하지 않는다.

### 4.5 HTML/GFM 손실 정책

`io`의 `exportHtml`/`exportMarkdown`은 등록된 커스텀 타입을 모른다(패키지 경계상 `core`에 의존하지 않는다) — 대신 두 함수 모두 선택적 파라미터로 렌더러를 직접 받는다(`io`는 여전히 순수 함수, `core`의 registry를 몰라도 됨):

```ts
exportHtml(document: Document, options?: { customBlockToHtml?: Record<string, (block: CustomBlock) => string> }): Result<string, ExportError>;
exportMarkdown(document: Document, options?: { customBlockToMarkdown?: Record<string, (block: CustomBlock) => string> }): ...;
```

`core`가 `EditorController`에서 문서 내보내기 편의 메서드를 제공할 때는 자신의 registry에서 `toHtml`/`toMarkdown`을 추출해 이 파라미터로 전달한다 — 소비자는 `customBlocks`에 한 번만 등록하면 된다. `io.exportHtml`/`exportMarkdown`을 에디터 인스턴스 없이 직접 호출하는 완전 서버 사이드 경로(§12)에서는 소비자가 이 파라미터를 별도로 채워야 한다(두 진입점이 독립적인 순수 함수라 상태를 공유하지 않는다 — 의도된 설계).

미등록 타입을 만나면 신규 손실 카테고리 `CUSTOM_BLOCK_LOST`로 처리한다: strict export는 거절, lossy export는 해당 블록을 폐기하고 경고를 반환한다(기존 `MEDIA_TYPE_LOST`/`INLINE_COLOR` 등과 동일한 strict/lossy 이분법 재사용, `CONTEXT.md`).

## 5. Extension/command 등록 (`EXT-005`)

```ts
// CreateEditorOptions 확장
commands?: Record<string, (editor: EditorController, ...args: unknown[]) => Result<void, EditorError>>;
keyboardShortcuts?: Record<string, (editor: EditorController) => boolean>; // true 반환 시 기본 동작 억제
```

raw ProseMirror `Plugin`이나 Tiptap `Extension`을 그대로 등록받는 API는 만들지 않는다(ADR-0002 유지, 2.2). 등록된 command는 별도 `Record` 키 공간에 저장되므로 기존 `EditorController.commands.*`와 이름이 겹쳐도 충돌하지 않는다(단순 객체 키 분리 — 별도 충돌 감지 로직 불필요). 등록된 command가 문서를 바꾸면 §3.1의 `runDocumentCommand` 진입점을 통과하도록 안내(문서화)하되, 강제 래핑은 하지 않는다 — 소비자가 직접 `editor.insertBlocks`/`updateBlock` 등 §3.2 공개 API를 호출하면 자동으로 이 진입점을 통과한다.

## 6. 커스텀 UI (`EXT-006`, `EXT-007`, `UI-012`, `UI-013`)

### 6.1 현재 상태

`packages/react/src/index.ts`가 공개하는 `SlashMenu`/`FormattingToolbar`/`LinkToolbar`/`MediaToolbar`/`FilePanel`/`MediaResizeHandles`/`EditorContent`는 전부 무인자(`() => {...}`)다. `BlockSideMenu`/`TableHandles`는 공개 export되지 않는다(중복 마운트 방지, 2026-09-06 실측).

### 6.2 신규 override prop

최상위 컴포넌트 각각에 "통째 교체" prop을 추가한다(BlockNote의 2계층 중 1계층만, 2.2):

```ts
<FormattingToolbar component?: FC<FormattingToolbarProps> />
<LinkToolbar component?: FC<LinkToolbarProps> />
<MediaToolbar component?: FC<MediaToolbarProps> />
<FilePanel component?: FC<FilePanelProps> />
```

`SlashMenu`는 두 가지를 추가한다:

```ts
<SlashMenu
  items?: SlashMenuItem[]; // 기존 기본 목록 뒤에 추가만 — 대체·제거 불가(2.2)
  portalTarget?: HTMLElement | null;
/>
```

`Components` context(프리미티브 단위 교체) 계층은 만들지 않는다(2.2). Portal target은 컴포넌트별 개별 prop으로 노출한다(BlockNote의 전역 `portalElements` 맵 대신 — 이미 무인자→override prop 전환을 하는 김에 각 컴포넌트 prop에 자연스럽게 포함).

### 6.3 Emoji picker (`UI-012`)

geul에 없는 신규 grid suggestion 메뉴를 신설한다(BlockNote의 grid suggestion 변형과 같은 *개념*이지만 독자 구현). 트리거 문자·아이템 목록·컬럼 수는 슬라이스 착수 시 확정한다.

## 7. Theming (`EXT-008`)

`--geul-*` CSS 커스텀 속성 체계를 도입한다(현재 scss 하드코딩 값을 변수로 승격). `data-*` DOM attribute로 라이트/다크 등 상태 전환 지점을 노출하고, 블록별 임의 HTML attribute 주입 옵션(`domAttributes`류)을 추가한다. **번들 dark 팔레트는 만들지 않는다** — 메커니즘만 제공한다(2.2).

## 8. i18n (`EXT-009`, `EXT-010`)

### 8.1 Dictionary 타입

`core`/`react` 전역에 하드코딩된 영어 문구를 키로 추출한다(2026-09-06 실측: `packages/core/src/placeholder-extension.ts`의 placeholder 문구, `packages/react/src/block-type-options.ts`/`slash-menu.tsx`/각 toolbar의 aria-label 등 다수). `Dictionary` 타입을 신설하고 `CreateEditorOptions.dictionary?: Dictionary`로 override를 받는다(BlockNote처럼 자동 딥 병합은 하지 않는다 — 소비자가 스프레드로 병합, 단순함 우선).

### 8.2 Key 구조 — 독자 설계

BlockNote의 `Dictionary` key 구조·문구를 그대로 가져오지 않는다(2.2) — geul UI 컴포넌트 자체가 다르므로(다른 메뉴 구성, 다른 라벨) geul 자체 문구 목록을 기준으로 key 구조를 새로 설계하고 독자 영어(`en`)·한국어(`ko`) 문구를 작성한다.

### 8.3 언어 커버리지

roadmap 완료조건 "v0.54.0 기본 locale 사전 전체"는 언어 **목록**(23개: `ar,de,en,es,fa,fr,he,hr,is,it,ja,ko,nl,no,pl,pt,ru,sk,uk,uz,vi,zh,zh-tw`) 커버리지 기준으로 유지한다. R4는 `en`/`ko` 2개만 완성한다.

### 8.4 이월 승인

나머지 20개 로케일의 번역은 R4 완료 시점에 후속 이슈로 승인 이월한다(2026-09-06 사용자 승인) — R2의 `IO-007` 파일 붙여넣기 이월(`docs/product/roadmap.md` R2 절, Issue #38 spec §2.2)과 동일 패턴. `EXT-010`은 R4 완료 판정에서 `PARTIAL`로 참여한다(roadmap.md §4 이월 조항). 이 이월을 `roadmap.md` R4 절에 반영하는 편집은 R2/R3 전례대로 실제 슬라이스 실행 시점(슬라이스 6 완료 시)에 한다 — 계획 단계인 지금 미리 하지 않는다.

## 9. Mobile/touch·키보드 접근성 (`UI-015`, `UI-016`)

### 9.1 현재 상태(2026-09-06 실측)

`playwright.config.ts`에 모바일 뷰포트/`isMobile`/`hasTouch` project가 없고, `e2e/` 전체에 터치 이벤트 시뮬레이션이 0건이다. `table-handles.tsx`/`media-resize-handles.tsx`는 이미 `touch-action: none` + `preventDefault()`로 터치 스크롤 가로채기를 방어하지만, **블록 재정렬 드래그 핸들(`block-side-menu.tsx`)만 이 방어가 빠져 있다** — 실기기 터치에서 핸들을 누르고 움직이면 브라우저가 스크롤 제스처로 판단해 `pointercancel`로 드래그가 중단될 수 있다. 게다가 드래그 핸들 노출이 hover(`pointermove`) 기반이라 순수 터치 흐름에서는 핸들 자체가 뜨지 않는다.

### 9.2 R4 범위

- 블록 드래그 핸들에 `touch-action: none` + `preventDefault()`를 추가한다(`table-handles`/`media-resize-handles`와 동일 패턴, 방어적 수정).
- hover 게이팅 재설계(터치 전용 노출 방식)는 **BlockNote 자체도 네이티브 HTML5 DnD라 터치 드래그를 공식 지원하지 않으므로**(2026-09-06 로컬 소스 조사) PARITY 의무 밖이다 — R4에 포함하지 않고 후속 이슈 후보로 기록한다(2.2, 2026-09-06 사용자 승인).
- 파일/미디어 리사이즈, formatting toolbar의 가상 키보드 회피(BlockNote의 `ExperimentalMobileFormattingToolbarController`와 동일 *문제*, 독자 구현)를 완료 조건 "mobile viewport의 formatting·file resize 등 기준 동작을 touch 입력으로 검증"에 맞춰 구현·검증한다.
- Playwright에 모바일 뷰포트 project(`isMobile`/`hasTouch`)를 신설하고 대표 시나리오를 터치 이벤트로 재검증한다.
- Suggestion menu류(Slash·emoji)에 `aria-expanded`/`aria-activedescendant`/`aria-controls` 등을 보강한다(`UI-016`).
- **WCAG 정량 기준은 범위 밖**이다(2.2, R3 전례 재사용).

## 10. Custom paste handler (`IO-008`)

`packages/core/src/clipboard-paste-extension.ts`의 `handlePaste`는 현재 완전히 하드코딩돼 있다(2026-09-06 실측). override hook을 추가한다:

```ts
pasteHandler?: (context: {
  event: ClipboardEvent;
  editor: EditorController;
  defaultPasteHandler: () => boolean; // 기존 handlePaste 로직 그대로 호출
}) => boolean | undefined;
// true: 처리됨(기본 동작 중단), false: 취소, undefined: 기본 동작 위임
```

`onPasteRejected`(기존, 표 붙여넣기 거절 통지 전용)는 변경하지 않는다 — `pasteHandler`는 이를 대체하지 않고 그 앞단에서 전체 paste 이벤트를 가로챌 수 있는 새 확장점이다.

## 11. SSR/Next.js 통합 (`EXT-013`)

### 11.1 현재 상태 — 실제 결함

2026-09-06 실측: `createEditor(options)`는 소비자가 `.mount()`를 한 번도 호출하지 않아도 **무조건 크래시**한다. 호출 스택: `createEditor`(`editor-controller.ts:605`) → `new ProductionEditorSession`(`production-editor-session.ts:159`) → `createTiptapEditor`(`:441`) → `createProductionEditor`(`production-editor-assembly.ts:186-329`)가 옵션 분기 없이 항상 `editor.mount(globalThis.document.createElement("div"))`(`:323`)를 실행한다 — `document`가 없는 Node.js/SSR 환경에서는 이 인자 평가 자체가 `TypeError`를 던진다. 이 자기-mount round-trip은 `ensureTrailingParagraphOnLoad`를 초기 로드 시 실행시키기 위한 내부 구현 디테일이다.

브라우저 전용으로 쓰는 현재 사용처에는 영향이 없다(브라우저에는 `document`가 항상 있다) — 이 결함은 R4의 SSR 지원 신규 요구에서만 표면화된다.

### 11.2 최소 수정 (2026-09-06 사용자 승인)

`production-editor-assembly.ts`의 자기-mount round-trip을 `typeof document !== "undefined"`일 때만 실행하도록 조건 분기한다. `document`가 없으면 `ensureTrailingParagraphOnLoad` 정규화를 소비자가 나중에 실제 `.mount(element)`를 호출하는 시점으로 지연한다. **왜 애초에 순수 정규화 함수가 아니라 실제 EditorView 자기-mount 방식을 선택했는지는 슬라이스 착수 시 재조사한다** — 더 근본적인 재설계(정규화를 순수 모델 레벨 함수로 이전)가 안전하다고 확인되면 그쪽으로 대체할 수 있다(2026-09-06 결정: 최소 수정을 기본으로 하되 재조사 결과에 따라 조정).

### 11.3 client-only 통합 가이드

Next.js 공식 패턴(`"use client"` + `next/dynamic({ssr:false})`, 2026-09-06 BlockNote 문서 조사로 형태 확인, 코드 비복사)과 동등한 형태로 geul 소비자 가이드를 작성한다 — `react` 패키지 자체에 `"use client"` 지시어를 넣을지, 소비자가 넣게 안내만 할지는 슬라이스 착수 시 결정한다.

## 12. 서버 측 parse/render (`IO-009`)

### 12.1 이미 충족 확인 (2026-09-06 실측)

`packages/io/src/{html,markdown}/*.ts`는 `globalThis.document`/`window`/DOM 전역을 전혀 참조하지 않는다(grep 0건, 사용 라이브러리 `parse5`/`hast-util-*`/`unified`/`remark-gfm`도 전부 DOM-free 순수 파서). 공개 함수 `exportHtml(document: Document): Result<string, ExportError>`, `exportMarkdown(document, options): Result<...>`, `importHtml(source, options?): Result<...>`, `importMarkdown(source, options?): Result<...>`가 이미 `packages/io/src/index.ts`로 공개돼 있고, 입출력이 순수 `Document`/`string`/`Result` 데이터뿐이다. 순수 Node.js 환경(브라우저·jsdom·에디터 인스턴스 전혀 없음)에서 4개 함수(HTML↔문서, Markdown↔문서) 왕복 호출을 실측 검증했다 — 전부 정상 동작.

### 12.2 남은 작업 — 신규 구현 아님

새 변환 로직은 필요 없다. 이 슬라이스는 판정 작업이다:

- `docs/product/blocknote-free-feature-inventory.md`의 `IO-009` 상태를 `NOT_STARTED`에서 `VERIFIED`로 갱신하고 판정 근거를 기록한다(R3 슬라이스7의 완료 판정 패턴 재사용).
- `packages/io/test`에 "DOM 전역 없는 순수 환경에서 4개 함수가 동작한다"를 명시적으로 고정하는 회귀 fixture를 추가한다(현재 이런 이름의 테스트가 없다, 2026-09-06 실측).
- 이 4개 함수가 "서버 측 parse/render" 용도로 쓸 수 있다는 공식 안내를 문서(reference)에 추가한다(BlockNote의 `@blocknote/server-util` 같은 별도 포지셔닝 문서가 geul에는 없다).
- §4(커스텀 schema)가 도입하는 커스텀 블록 타입을 `exportHtml`/`importHtml`이 인식하려면 §4.5의 선택적 파라미터를 통해서만 가능하다는 경계를 명시한다 — `IO-009` 자체 범위는 아니다.

## 13. 오류 계약

`packages/core/src/errors.ts`의 `EditorError` union에 추가(정확한 이름은 슬라이스 착수 시 확정):

- 읽기 전용 상태에서 시도할 수 없는 조작(있다면) — 단, §3.4 결정에 따라 대부분의 프로그램적 command는 읽기 전용에서도 허용되므로 이 카테고리는 최소화될 것으로 예상한다.
- 커스텀 블록 registry 미등록 상태에서 문서에 알 수 없는 커스텀 타입이 있을 때의 렌더 실패 처리(에러로 거절할지, fallback UI를 보일지는 슬라이스 착수 시 확정).

`packages/model`의 `DOCUMENT_INVALID`를 재사용(전용 코드를 새로 만들지 않음):

- `CustomBlock`의 `type`이 예약된 14종과 충돌.
- `CustomBlock.props`/`CustomTextMark.props`가 JSON 원시값이 아닌 값을 포함.

## 14. 검증 전략

- **모델 단위 테스트**: `CustomBlock`/`InlineContentItem`/`CustomTextMark` envelope 검증(예약 타입 충돌 거절, props 원시값 검증), 라우팅 스키마(§4.3)가 기존 14종의 에러 품질(정확한 path)을 그대로 보존함을 고정하는 회귀 fixture.
- **코어 단위 테스트**: §3.2 신규 API의 `Result` 계약과 undo 원자성, `onBeforeChange` 다중 등록 AND 결합(하나라도 false면 거절), `isEditable=false`에서 command는 허용되고 DOM 입력만 막힘, registry 등록 커스텀 블록의 PM atom 노드 생성·JSON round-trip, `commands`/`keyboardShortcuts` 등록이 기존 명령과 충돌하지 않음.
- **입출력 단위 테스트**: `exportHtml`/`exportMarkdown`이 미등록 커스텀 블록을 `CUSTOM_BLOCK_LOST`로 strict 거절/lossy 폐기+경고 처리, 등록 시(`customBlockToHtml`/`customBlockToMarkdown` 파라미터) 정상 직렬화, §12의 DOM-free 순수 환경 회귀 fixture.
- **React 단위 테스트**: override prop이 실제로 기본 컴포넌트를 대체함, Slash 커스텀 항목이 기본 목록 뒤에 추가됨(대체 아님), `dictionary` override 병합.
- **Playwright**: 커스텀 블록 등록·렌더·저장 round-trip(Chromium), 읽기 전용 토글, 모바일 뷰포트(신규 project)에서 formatting toolbar·파일 리사이즈 touch 시나리오, suggestion menu keyboard-only 조작 + ARIA assertion, SSR 수정 검증용 Node.js 스모크 테스트(`createEditor` 호출이 `document` 없이도 크래시하지 않음).
- R4 마지막 슬라이스에서 3-엔진 게이트 재확인(R1/R2/R3와 동일 패턴).

## 15. 후속 확장 경계

이 명세가 선결정하지 않고 후속 이슈 후보로 남기는 것(2.2에서 이미 근거 기록):

- 커스텀 블록/인라인 콘텐츠의 자식 중첩과 완전한 텍스트-급 편집 UX.
- `Components` context 계층(프리미티브 단위 UI 교체).
- Slash 메뉴 기본 항목 제거·전체 교체.
- 번들 dark theme 팔레트.
- 20개 비영어·비한국어 로케일 번역.
- 블록 드래그 재정렬의 완전한 터치 UX 재설계(hover 게이팅 대체).
- WCAG 정량 접근성 기준.

## 16. R4 완료 조건

roadmap.md R4 완료 조건 8개를 그대로 인용한다(약화·추가하지 않음).

- 별도 fixture extension이 사용자 정의 block/inline/style을 등록한다.
- 소비자 UI가 기본 메뉴 중 하나를 교체해 동일 command를 실행한다.
- v0.54.0 기본 locale 전체와 사용자 번역 override가 검증된다.
- mobile viewport의 formatting·file resize 등 기준 동작을 touch 입력으로 검증한다.
- 핵심 menu와 editor flow를 keyboard-only 및 접근성 assertion으로 검증한다.
- Next.js fixture가 SSR 중 editor DOM을 평가하지 않고 client에서 정상 mount된다.
- server 환경에서 DOM 전역 없이 지원 변환을 수행한다.
- 공개 API에 Tiptap/ProseMirror 타입이 노출되지 않는다.

§8.4의 이월 승인에 따라 `EXT-010`은 위 3번째 조건의 "전체" 요구를 `en`/`ko` 2개 언어 + 나머지 20개 언어 목록 커버리지로 축소한 `PARTIAL` 상태로 R4 완료 판정에 참여한다(roadmap.md §4 이월 조항) — 이 문단은 위 인용 목록에 대한 해석이지 목록 자체의 수정이 아니다.
