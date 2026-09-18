# BLK-020 — Callout 블록 설계

## 1. 결정 요약

Callout을 `customBlocks`(`EXT-001`) 확장 예시가 아니라 `model`/`core`/`io`/`react` core 기능으로 제공한다(2026-09-18 사용자 지시 — "자주 사용될 만한 것인데 사용처에서 직접 구현하기보다는 제공해주는 게 좋겠다"). BlockNote 무료 기준선에는 없는 기능이라 목표 수준은 `CUSTOM`이다.

콘텐츠 모델은 신규 설계가 아니라 paragraph/heading/quote/목록 4종/toggleListItem이 이미 공유하는 nestable 패턴(`content: InlineContent`, `children?: Block[]`, `TextBlockProps`)을 그대로 재사용한다 — Callout이 8번째 멤버가 된다. 신규 필드는 `icon`(자유 이모지 문자열) 하나뿐이고, 배경색은 기존 `TextBlockProps.backgroundColor`를 그대로 쓴다.

warning/error/info/success는 저장 필드로 만들지 않는다. `icon`+`backgroundColor` 두 값에 대한 `react` UI 프리셋(빠른 버튼)으로만 제공한다 — 별도 `variant` 필드를 추가하면 icon/backgroundColor와 독립된 3번째 상태가 생겨 "variant는 warning인데 icon은 임의로 바뀐" 모순 상태가 가능해지기 때문이다(2026-09-18 사용자 확인).

Mention은 이 문서 범위가 아니다 — `customInlineContent`(`EXT-002`) 예시로만 제공하기로 별도 결정했다(2026-09-18).

## 2. 데이터 모델 (`model`)

```ts
export type CalloutBlock = {
  id: string;
  type: "callout";
  content: InlineContent;
  icon?: string; // 자유 이모지 문자열, 기본값 "💡"
  children?: Block[];
} & TextBlockProps;
```

- `Block` 유니온(`types.ts`)에 8번째 nestable 콘텐츠 블록으로 추가한다.
- `NestableBlockType`(`block-kind.ts`)에 `"callout"`을 추가한다 — `isNestableBlockType`/`isInlineContentBlockType`이 그대로 `true`를 반환하게 된다.
- `content`/`children`/`TextBlockProps` 검증은 기존 paragraph 스키마 검증 로직을 재사용한다(신규 검증 로직 없음).
- `icon` 검증: `isValidInlineText`(기존 `string-invariants.ts`) 재사용 + 빈 문자열 거부. `name`/`caption` 같은 기존 문자열 prop과 동일하게 별도 길이 상한을 두지 않는다(선례 확인 — `media-block.ts`에 길이 상한 없음). 이모지 grapheme cluster 형식 검증(단일 이모지인지)은 하지 않는다 — `react`의 `EmojiPicker`가 항상 유효한 단일 이모지만 만들어 내므로 model이 이중 검증할 필요가 없다(직접 편집한 JSON이 여러 글자를 넣어도 표시만 어색할 뿐 문서 무결성은 깨지지 않는다).
- `children` 깊이 상한은 기존 `MAX_NESTING_DEPTH`(64)를 그대로 공유한다.

## 3. `core` 구현

- `block-container-extension.ts`의 `nestableBlockContent` PM 그룹에 callout 노드를 추가한다 — paragraph/heading/quote와 동일하게 `blockContainer`로 감싸는 content node로 만든다(atom 아님, 텍스트 편집 가능).
- 기존 `commands.setBlockType`(`SetBlockTypeDescriptor`)이 다루는 타입 집합에 `callout`을 추가한다 — Quote가 편입될 때와 동일한 패턴이라 신규 변환 명령이 필요 없다. Slash 생성과 Turn into 양방향 변환이 이 하나로 해결된다.
- `setCalloutIcon(blockId: string, icon: string): Result<void, EditorError>` 신설 — `setBlockTextColor`/`setBlockBackgroundColor`(`INL-010`)와 동일한 얕은 setter 패턴. `commands` 네임스페이스 아래 노출한다.
- 배경색·글자색·정렬은 신규 명령이 필요 없다 — `TextBlockProps`를 가진 블록 전체를 대상으로 하는 기존 `setBlockBackgroundColor`/`setBlockTextColor`/`setBlockTextAlignment`가 callout에도 그대로 적용된다(대상 타입 목록에 `callout` 추가만 필요).
- placeholder: 빈 callout은 상시 "Callout" 텍스트(Quote 선례와 동일 — 캐럿 유무 무관하게 항상 표시).
- indent/outdent, 들여쓰기 시각 렌더링: `nestableBlockContent` 자동 편입이라 별도 구현이 필요 없다.
- 삭제/복제/이동: 기존 nestable 블록 범용 명령(`generic-block-*-commands.ts`)이 타입 무관하게 동작하므로 별도 구현이 필요 없다.

## 4. `io` HTML/GFM 계약

### HTML

시맨틱 HTML5 엘리먼트가 없으므로 table/divider/toggle과 같은 `data-geul-*` 속성 관례를 따른다.

```html
<div data-geul-callout="true" data-geul-icon="💡" data-geul-background-color="#FEF7E0">
  <!-- content + 재귀 children -->
</div>
```

`backgroundColor`/`textColor`/`textAlignment`의 HTML 표현은 기존 `TextBlockProps` 직렬화 규칙(`data-geul-text-color` 등, `Issue #179`가 추가한 인라인 `style` 동시 기록 포함)을 그대로 재사용한다.

### GFM

타입 정체성 손실은 Toggle(`BLK-010`)과 같은 정책(strict 거절 + lossy 평탄화 + 손실 카테고리 1개)을, 자식 중첩 손실은 paragraph/heading이 이미 쓰는 기존 정책을 각각 재사용한다 — 신규 메커니즘은 만들지 않는다. GitHub 확장 alert 문법(`> [!NOTE]`)은 채택하지 않는다(고정 5종 타입 전제라 자유 이모지 결정과 맞지 않는다).

- **strict export**: 신규 손실 카테고리 `CALLOUT_STATE_LOST`로 거절한다 — `TOGGLE_STATE_LOST`와 동일 논리다. callout이라는 블록 타입 자체가 일반 문단과 구분되는 GFM 표현 수단이 없어 icon 값·유무와 무관하게 항상 보고한다(toggleListItem의 타입 정체성 손실과 같은 성격).
- **children 평탄화**: 신규 메커니즘을 만들지 않는다 — paragraph/heading이 이미 갖고 있는 중첩 손실 정책(`NESTED_CHILDREN`, `DOC-002` 슬라이스 1)을 그대로 재사용한다.
- **lossy export**: `content`는 일반 문단으로 방출하고(icon·backgroundColor 폐기) `CALLOUT_STATE_LOST` 경고를 남긴다. `children`이 있으면 `NESTED_CHILDREN`을 함께 보고할지는 기존 paragraph/heading 처리와 동일하게 따르는 것을 기본값으로 하되 구현 시점에 확인한다.
- **import**: GFM에는 callout을 만드는 문법이 없다 — 생성 경로 자체가 없다(Toggle import와 동일).

## 5. `react` UI

- Slash 메뉴에 "Callout" 항목 추가.
- `BLOCK_TYPE_OPTIONS`(Turn into 공용 리스트)에 callout 추가 — `block-side-menu-menu.tsx`/`formatting-toolbar.tsx`가 자동으로 소비한다.
- 아이콘 클릭 시 기존 `EmojiPicker`(`UI-012`, 564개 큐레이션 grid)를 그대로 재사용해 교체한다 — 신규 이모지 선택 UI를 만들지 않는다. 선택 시 `commands.setCalloutIcon(blockId, icon)` 호출.
- 배경색은 기존 TextBlockProps 대상 블록의 블록 메뉴 색상 섹션에 callout을 추가로 노출한다(신규 UI 없음).
- `_callout.scss` 신설 — 좌측 아이콘 + 본문 flex 레이아웃, 카드형 배경.

### 색상 프리셋 (모델 불변, `react` 전용)

블록 메뉴/서식 툴바의 callout 색상 섹션에 빠른 프리셋 4개를 추가한다. 값은 기존 8색 팔레트(`table-cell-colors.ts`의 `TABLE_BACKGROUND_COLORS`)를 그대로 재사용한다 — 신규 hex를 만들지 않는다.

| 프리셋   | icon | backgroundColor(팔레트 id) | hex       |
| -------- | ---- | --------------------------- | --------- |
| Info     | ℹ️   | `blue`                       | `#E8F0FE` |
| Warning  | ⚠️   | `yellow`                     | `#FEF7E0` |
| Error    | 🚫   | `red`                        | `#FCE8E6` |
| Success  | ✅   | `green`                      | `#E6F4EA` |

클릭 시 `editor.commands.updateBlock(blockId, { type: "callout", icon, backgroundColor })` 한 번으로 icon+배경색을 원자적으로 세팅한다(undo 1회). `setCalloutIcon`과 `setBlockBackgroundColor`를 순차 호출하지 않는다 — 두 번 호출하면 undo가 2단계로 쪼개진다. `setCalloutIcon` 단독 명령은 EmojiPicker로 임의 이모지를 고르는 경로(프리셋과 무관)에 그대로 남는다.

프리셋 라벨은 신규 dictionary key가 필요하다(`EXT-009` i18n 계약 — en/ko 둘 다 추가, 네임스페이스는 구현 시점에 기존 11개 중 적합한 곳에 배정하거나 `callout` 네임스페이스를 신설한다).

## 6. 로드맵/inventory 배정

- `docs/product/blocknote-free-feature-inventory.md` §3.2(기본 블록)에 `BLK-020`(가칭) 추가 — 목표 `CUSTOM`, 상태 `NOT_STARTED`.
- 단계는 기존 R2/R4처럼 이미 `PASS` 판정이 난 완료 단계에 끼워 넣지 않는다 — "독자 확장, 1차 릴리즈 UI/UX 버그 수정 패스와 병행 착수(2026-09-18 사용자 지시)"로 별도 각주를 단다. 기존 R2/R4 완료 판정 문서(`r2-basic-block-parity-completion.md`, `r4-extensibility-integration-parity-completion.md`)는 소급 변경하지 않는다.
- `docs/product/roadmap.md`에도 같은 각주로 동기화한다(로드맵 §5 "기준선 갱신" 절차의 "새 기능을 결정하고 인벤토리에 ID를 추가한다" 부분을 준용).
- GitHub Issue를 신규 등록한다. model+core+io+react 4패키지를 관통하므로 착수 시점에 `docs/agents/workflow-shared.md`의 DELTA 크기 규칙으로 qq/roadmap-workflow 레인을 판정한다 — 규모상 roadmap-workflow가 될 가능성이 높다.

## 7. 완료 기준

- [ ] `CalloutBlock`이 `Block` 유니온과 `NestableBlockType`에 포함되고 model unit 테스트(icon 검증 포함)가 통과한다.
- [ ] Slash 생성, Turn into 양방향 변환, 삭제/복제/이동/들여쓰기가 다른 nestable 블록과 동일하게 동작함을 core unit 테스트로 검증한다.
- [ ] `setCalloutIcon`이 undo 1회로 복원됨을 검증한다.
- [ ] HTML round-trip(icon·backgroundColor·children 포함)이 unit 테스트로 고정된다.
- [ ] GFM strict 거절(`CALLOUT_STATE_LOST`)과 lossy 평탄화가 unit 테스트로 고정된다.
- [ ] 4개 색상 프리셋이 `updateBlock` 단일 호출로 icon+backgroundColor를 원자적으로 세팅하고 undo 1회로 복원됨을 Chromium e2e로 검증한다.
- [ ] EmojiPicker를 통한 임의 아이콘 교체가 Chromium e2e로 검증된다.
- [ ] en/ko dictionary에 프리셋 라벨이 채워진다.
- [ ] `blocknote-free-feature-inventory.md`/`roadmap.md`/`current-status.md`가 갱신된다.

## 8. 범위 밖

- Mention — `customInlineContent` 예시로 별도 처리(이 문서 범위 아님, 2026-09-18 결정).
- `variant` 저장 필드 — UI 프리셋으로 대체(§1).
- GitHub 확장 alert 문법(`> [!NOTE]`) GFM round-trip.
- Callout 전용 신규 색상 팔레트 — 기존 8색 재사용으로 대체.
- 접기/펼치기(collapsible) — 요청받지 않았고 toggleListItem이 이미 그 요구를 담당한다.
