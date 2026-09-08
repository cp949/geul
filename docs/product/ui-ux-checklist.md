# UI/UX 점검 체크리스트

## 1. 목적과 범위

이 문서는 "기능이 존재하는가"(→ [기능 인벤토리](./blocknote-free-feature-inventory.md))가 아니라 **"실제로 브라우저에서 사람이 쓰듯 조작했을 때 깨지지 않는가"**를 추적하는 단일 기준이다. `BLK-017`(코드 구문 강조) 착수 전 사용자가 실사용 중 직접 발견해 보고한 버그(`QA-011`·`QA-012`·`QA-086`·`QA-087`)를 계기로 2026-09-08 등록했다.

점검은 두 단계로 진행한다 — 먼저 §3~4의 정상 케이스(정상적인 사용자 조작)를 통과시키고, 그 다음 §5의 공격적·경계 케이스(의도적으로 오동작을 유도하는 입력)로 넘어간다. 정상 케이스가 `NOT_RUN`인 상태에서 대응하는 공격적 케이스부터 확인하지 않는다 — 정상 동작 여부를 먼저 알아야 비정상 입력의 결과를 판단할 기준이 생긴다.

- 대상: **배포 표면**뿐이다. [roadmap.md §6](./roadmap.md#6-1차-릴리즈-범위)이 정의한 1차 릴리즈 범위(R0~R4 완료분 + `BLK-017`)에 든 기능만 항목으로 올린다. `NOT_STARTED` 기능(R5 나머지, R6~R8, `IO-010`·`011`)은 실제로 쓸 수 있는 상태가 아니므로 항목을 만들지 않는다 — 구현되면 그때 추가한다(§4).
- 단위: 한 항목(`QA-NNN`)은 "실제로 조작해서 확인할 수 있는 사용자 시나리오 하나"다. 기능 인벤토리처럼 기능 하나에 항목 하나가 아니다 — 기능 하나가 여러 조작 시나리오(겹침·hover·붕괴)를 가지면 각각 별도 항목이다.
- 이 문서가 다루지 않는 것: 코드 정적 분석·단위 테스트 커버리지(→ 각 패키지 테스트), 기능 존재 여부(→ 인벤토리), 릴리스 배정(→ roadmap).

## 2. 상태 값

`docs/process/development-lifecycle.md` §7과 같은 어휘를 쓴다 — 이 문서에서 새로 정의하지 않는다.

- `PASS`: 실제 브라우저 조작으로 재현 확인했고 문제없다.
- `FAIL`: 재현했고 결함이 있다. "발견"열에 근거(스크린샷·재현 절차·수정 커밋)를 남긴다.
- `BLOCKED`: 확인에 필요한 환경(브라우저 연결 등)이 없어 아직 확인할 수 없다.
- `NOT_RUN`: 아직 확인을 실행하지 않았다.

## 3. 공통 패턴 (여러 컴포넌트에 반복되는 원인)

`position: fixed` 오버레이의 겹침·hover 사라짐·잘못된 anchor 위치는 한 컴포넌트에서 고쳐도 같은 구조를 쓰는 다른 컴포넌트에 똑같이 있을 수 있다 — 이 표는 이런 패턴을 컴포넌트별로 반복 점검한다. 정상 구현 경로는 [`G-UI-001`](../guides/G-UI-001-build-dismissible-overlays.md)·[`G-TST-001`](../guides/G-TST-001-test-overlays-and-keyboard-interactions.md)이 소유한다.

| ID       | 확인 항목                                                    | 관련 기능      | 상태      | 발견                                                                                                        |
| -------- | ------------------------------------------------------------- | -------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `QA-001` | SlashMenu가 다른 블록이나 화면 경계를 가리지 않는다            | `UI-001`       | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 문서 상단 근처에서 정상 anchor(아래로), 문서를 여러 줄로 채워 캐럿을 뷰포트 하단까지 밀어도 메뉴가 위로 뒤집혀 화면 밖으로 잘리거나 잘못된 위치에 뜨지 않음. |
| `QA-002` | 서식(formatting) toolbar가 다른 콘텐츠를 가리지 않는다         | `UI-007`       | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 텍스트 선택 위/아래에 정상 anchor, 다른 콘텐츠 겹침 없음. 같은 조사 중 Escape 미동작 결함을 발견·수정(`QA-089` 참고). |
| `QA-003` | 링크 toolbar가 다른 콘텐츠를 가리지 않는다                     | `UI-008`       | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 링크 추가/보기 toolbar 정상 anchor, 겹침 없음. 같은 조사 중 Escape 미동작 결함을 발견·수정(`QA-089` 참고). |
| `QA-004` | emoji picker가 다른 콘텐츠를 가리지 않는다                     | `UI-012`       | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 정상 anchor, 겹침 없음. Escape로 닫히고 텍스트(`:sm`)는 보존됨(의도된 동작, `emoji-picker.tsx` 주석). |
| `QA-005` | 표 행/열 핸들 메뉴가 다른 콘텐츠를 가리지 않는다               | `TBL-002`      | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 핸들 자체(드래그 아이콘)는 hover 시 정상 표시, 다른 콘텐츠 안 가림. **함정**: 행/열 핸들 버튼은 `onPointerDown`+`setPointerCapture` 기반이라 `computer` 도구의 `left_click`(단일 클릭)으로는 열리지 않는다(반응 없이 무시됨, 자동화 한계로 판단 — 프로젝트가 이미 문서화한 "네이티브 drag가 CDP 자동화에서 깨진다"는 전례와 같은 부류) — `double_click`을 쓰면 정상적으로 열린다(실측 확인, 아래 두 항목도 이 방법으로 검증). |
| `QA-006` | 셀 서식 메뉴가 다른 콘텐츠를 가리지 않는다                     | `TBL-007`      | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome, `double_click`으로 열음 — 위 `QA-005` 함정 참고) — 열/행 메뉴(Insert/Delete/Header/Text color/Background color) 핸들 바로 아래 정상 anchor, 페이지 다른 콘텐츠 안 가림. Escape로 닫히고 초점이 셀로 복귀(unit test로도 이미 커버: `table-handle-menu.test.tsx`). |
| `QA-007` | 셀 범위 선택 toolbar가 다른 콘텐츠를 가리지 않는다             | `TBL-004`      | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 일반 마우스 drag(`left_click_drag`, pointer capture 없음)로 셀 범위 선택 시 toolbar(표 아이콘·팔레트 아이콘)가 선택 영역 위에 정상 anchor, 안 가림. Escape로 정상 닫힘·선택 해제. |
| `QA-008` | 미디어 toolbar가 다른 콘텐츠를 가리지 않는다                   | `MED-004`      | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — URL 이미지 삽입 후 Media 예제에서 이미지 클릭 시 toolbar가 이미지 위에 정상 anchor, 페이지 헤더와 안 겹침. Escape로 toolbar만 닫히고 리사이즈 핸들은 유지(블록 선택 상태와 별개 컴포넌트라 의도된 동작으로 보임, `MediaResizeHandles`/`MediaToolbar` 분리 소스 확인). |
| `QA-009` | 파일 패널이 다른 콘텐츠를 가리지 않는다                        | `MED-001`      | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 빈 이미지 블록 생성 시 파일 패널(URL 입력+Save/Close)이 자동으로 열리고 정상 표시. Escape로 닫힘, 크래시 없음. |
| `QA-010` | Turn into(블록 종류 변경) 메뉴가 다른 콘텐츠를 가리지 않는다   | `UI-005`       | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 뷰포트 상단 근처 블록의 거터 클릭 시 메뉴가 페이지 헤더와 겹치지만 뷰포트 밖으로 잘리지 않고 내부 스크롤(max-height)로 처리됨 — QA-086 수정 이후 정상 anchor. Escape로 닫히고 초점이 편집기로 복귀. |
| `QA-086` | 버튼 클릭 등 타이핑이 아닌 경로로 여는 메뉴도 정확한 anchor 위치에 뜬다(화면 구석에 고정되지 않는다) | `UI-002` | `PASS` | 2026-09-08 사용자 실사용 중 발견(스크린샷) — 블록 거터의 Add block(+) 버튼을 클릭하면 새 블록 자리가 아니라 화면 좌측 상단 구석에 블록타입 선택 팝업이 뜸. **근본 원인**: `slash-menu.tsx`의 `readCaretBounds`가 `Range.getBoundingClientRect()`로 캐럿 위치를 읽는데, 방금 삽입된 빈 문단(자식이 `<br class="ProseMirror-trailingBreak">` 하나뿐)에서는 Range 경계가 텍스트 노드가 아니라 엘리먼트+offset이라 Chromium이 `(0,0,0,0)`을 돌려준다(실측 확인) — `openMenuAt`이 이 값을 그대로 써 메뉴가 뷰포트 원점(0,0)에 anchor됨. 수정: Range rect의 height가 0이면 캐럿을 담은 엘리먼트 자신의 rect로 대체(`emoji-picker.tsx`의 동명 함수도 문서화된 바이트 동일성 유지 차원에서 동기화, 단 그쪽은 `:` 트리거가 항상 텍스트를 전제해 현재 도달 불가). 회귀 테스트: `packages/react/test/slash-menu/add-block.test.tsx`. 실브라우저 시각 확인 완료(claude-in-chrome). |
| `QA-011` | 코드 언어 콤보박스가 바로 다음 블록(trailing 빈 문단 등)을 가리지 않는다 | `BLK-011`      | `PASS` | 2026-09-08 사용자 실사용 중 발견(스크린샷) — `fix(react) edbb6b3`로 수정, unit test 8건 통과. 실브라우저 시각 확인 완료(claude-in-chrome) — Slash menu 쇼케이스에서 문서 마지막 블록으로 코드 블록 생성 시 언어 콤보박스가 코드 블록 위로 뒤집혀 뜨고 아래 블록을 가리지 않음 |
| `QA-012` | 블록 거터(드래그 핸들·+)가 hover 이동 중 사라지지 않는다        | `UI-003`       | `PASS` | 2026-09-08 사용자 실사용 중 발견 — `fix(react) edbb6b3`로 수정, unit test 2건 통과. 실브라우저 시각 확인 완료(claude-in-chrome) — 블록에서 add 버튼으로 hover 이동 중 거터가 계속 표시됨 |
| `QA-013` | 표 행/열 핸들이 hover 이동 중 사라지지 않는다(회귀 확인용)      | `TBL-002`      | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 회귀 없음. 기존에 `HANDLE_HOVER_MARGIN` 적용됨(table-handles.tsx). |
| `QA-014` | 모든 메뉴/토toolbar가 바깥 클릭 시 닫히고 초점이 편집기로 돌아온다 | 공통          | `PASS` | 2026-09-08 — `FormattingToolbar`는 실브라우저로 바깥 클릭 직접 확인(claude-in-chrome). 나머지(LinkToolbar/EmojiPicker/SlashMenu/표 메뉴류/MediaToolbar/FilePanel/블록 사이드 메뉴)는 전부 같은 공용 훅 `useDismissOnOutsideOrEscape`를 쓰고(QA-015에서 Escape 경로는 각각 실측), 그 훅의 outside-pointerdown 분기는 `use-dismiss-on-outside-or-escape.test.tsx`가 별도로 고정한다 — 개별 컴포넌트마다 바깥 클릭을 하나하나 다시 실측하지는 않음(사실은 FormattingToolbar 실측 + 공용 훅 단위 테스트, 나머지 컴포넌트에 대한 결론은 "같은 훅을 쓴다"는 소스 확인에 근거한 추론). |
| `QA-015` | 모든 메뉴/toolbar가 Escape로 닫히고 초점이 편집기로 돌아온다    | 공통          | `PASS` | 2026-09-08 실브라우저로 Escape 직접 확인(claude-in-chrome): `FormattingToolbar`(`QA-089`로 신규 배선)·`LinkToolbar`(`QA-089`)·`EmojiPicker`(`QA-004`, 텍스트 보존)·`SlashMenu`(Turn into 메뉴 포함, `QA-010`)·표 열 메뉴(`QA-006`)·표 셀 범위 선택 toolbar(`QA-007`)·`MediaToolbar`(`QA-008`)·`FilePanel`(`QA-009`). 코드 언어 콤보박스는 별도 세션에서 이미 확인됨(`QA-011`). |
| `QA-016` | 좁은 화면·뷰포트 경계에서 메뉴가 잘리지 않는다(공통)            | 공통          | `BLOCKED` | 2026-09-08 — 실제 뷰포트를 좁히는 방법 세 가지를 시도했으나 전부 실패: `resize_window`(380x700 요청 후에도 `window.innerWidth`가 그대로 1237), `window.open` 팝업(즉시 차단, `opened:false`), 브라우저 zoom 단축키(`computer` 도구가 명시적으로 미지원, region 캡처용 `zoom`과는 별개). claude-in-chrome엔 CDP device-metrics override 같은 대체 수단도 없어 실브라우저 재현 자체가 불가능 — `BLOCKED`. 참고(실측 아님, PASS로 올리기엔 근거 부족): `use-clamped-menu-position.test.tsx`의 "메뉴가 뷰포트보다 크면 여백(8px)까지만 허용한다" 단위 테스트(재실행 통과)와 `G-UI-001`의 `max-width`+`overflow-y:auto` 규칙이 같은 클램프 경로를 타는 것으로 소스상 보이나, 실제 좁은 뷰포트에서 확인된 적은 없다. 다음 세션은 다른 narrow-viewport 재현 수단(실기기 연결 등)을 찾을 것. |
| `QA-017` | 터치로 드래그 핸들 재정렬이 동작한다                            | `UI-015`       | `BLOCKED` | 2026-09-08 — claude-in-chrome `computer` 도구에 touch 전용 action이 없음(left_click/left_click_drag/hover 등 마우스 액션뿐). 기존 e2e에도 블록 거터 드래그 핸들의 touch 기반 재정렬 테스트가 없음 — `@mobile` 태그 테스트는 `mobile-touch.spec.ts`(탭-포커스만)와 `media-resize-handle.spec.ts`(MediaResizeHandles의 touch 리사이즈, 별개 컴포넌트) 둘뿐이라 재실행해 둘 다 통과 확인했지만 블록 재정렬은 다루지 않는다. `block-handle.spec.ts`의 재정렬 e2e는 `page.mouse`(마우스) 기반이라 touch가 아니다. `dispatchEvent`로 touch를 흉내내는 우회는 QA-005/006 조사에서 이미 부작용(오판 유발)으로 배제된 방법이라 쓰지 않음. 실제 touch 입력 수단이 생기면 재확인할 것. |
| `QA-018` | 가상 키보드가 뜬 상태에서 메뉴 위치가 가려지지 않는다           | `UI-015`       | `PASS` | 2026-09-08 — 데스크톱 Chromium에선 가상 키보드 자체를 띄울 방법이 없고(`resize_window`도 비기능 확인됨), `UI-015`에 이미 "실제 브라우저 가상 키보드 e2e는 범위 밖으로 확정"(2026-09-06 사용자 승인+그릴링 결정)이라 기록돼 있어 실브라우저 재현은 시도하지 않는다. 대신 구현·단위 테스트로 확인: `useClampedMenuPosition`(`packages/react/src/use-clamped-menu-position.ts`)이 `visualViewport`의 `resize`/`scroll`을 구독해, 가상 키보드가 뜰 때의 정확한 시나리오(레이아웃 뷰포트는 그대로고 `visualViewport`만 줄어듦)에서도 그 경계 기준으로 재클램프함을 `use-clamped-menu-position.test.tsx`(가상 키보드 관련 3건 포함 전체 15건)를 재실행해 통과 확인. `FormattingToolbar`·`LinkToolbar`가 이 훅을 공유(소스 확인). |
| `QA-019` | 키보드만으로(Tab/화살표) 메뉴 탐색·선택이 가능하다              | `UI-016`       | `PASS` | 2026-09-08 — SlashMenu: 실브라우저에서 `/` 입력 후 `ArrowDown` 3회로 하이라이트가 Text→Heading1→Heading2→Heading3로 이동함을 확인, `Enter`로 실제 Heading 3 전환됨(kitchen sink 실측). FormattingToolbar/LinkToolbar: 두 컴포넌트 모두 DOM상 `EditorContent`보다 앞에 렌더되는 설계라(소스 확인, `03-formatting-toolbar`·`04-link-toolbar` 예제 JSX) forward Tab이 아니라 `Shift+Tab` 역방향으로 도달하는 게 의도된 경로 — 직접 실측(텍스트 선택 후 `Shift+Tab` 1회로 툴바 마지막 버튼 "Background color"에 포커스 도달 확인) + 기존 e2e(`e2e/formatting-toolbar.spec.ts`·`e2e/link-toolbar.spec.ts`의 `focusWithShiftTab` 헬퍼, `@core` 태그) 재실행 통과로 이중 확인. Turn into 메뉴(`role="menu"`, `block-side-menu-menu.tsx`)는 화살표 키 탐색을 지원하지 않음(직접 확인: 메뉴가 열린 채 `ArrowDown`을 눌러도 포커스가 계속 editable에 남아 캐럿만 이동, 하이라이트 불변) — 회귀가 아니라 `UI-016` feature 항목에 이미 기록된 의도적 범위 제외("SlashMenu 외 다른 `role=menu`류는 범위 밖", RD-002 그릴링 결정)라 이 항목의 FAIL로 잡지 않는다. 같은 `role="menu"`인 표(table) handle 메뉴(`table-handle-menu.tsx`)도 같은 범위 제외 논리로 화살표 키 탐색을 별도 확인하지 않음. |
| `QA-089` | selection 관측만으로 뜨는 toolbar가 Escape로 닫히고, 닫힌 뒤 같은 selection이 재관측돼도 다시 열리지 않는다 | `UI-007`, `UI-008` | `PASS` | 2026-09-08 QA-002/003 조사 중 발견 — `FormattingToolbar`·`LinkToolbar`(view 모드) 둘 다 Escape를 눌러도 안 닫힘(바깥 클릭은 이미 정상 — selection이 자연히 collapse돼 닫힘). **근본 원인**: 두 컴포넌트 모두 `updateFromSelection`이 `selectionchange`/`scroll`/`keyup` 관측만으로 열고 닫혔고, `useDismissOnOutsideOrEscape`(G-UI-001의 표준 메커니즘)를 툴바 자신에는 배선하지 않았다(각자 내부 색상 팔레트/URL input에만 배선돼 있었음). 수정: 새 공유 훅 `use-range-dismiss-suppression.ts`(Escape 시점의 Range를 기록해 같은 Range 재관측을 무시, 실제로 selection이 바뀌면 자동 해제)를 두 컴포넌트에 배선하고 `useDismissOnOutsideOrEscape`를 툴바 루트에도 연결(색상 팔레트가 열려 있을 때는 `active`를 꺼 Escape 한 번이 팔레트만 먼저 닫게 함). 회귀 테스트: `formatting-toolbar.test.tsx`·`link-toolbar.test.tsx`(둘 다 jsdom `focus()`가 collapsed Selection을 강제로 되돌리는 부작용을 `vi.spyOn(...,'focus')`로 배제해 억제 로직 자체를 검증 — 스텁 없이는 기존 게이트만으로 우연히 통과하는 vacuous pass였음, 실측 확인). 실브라우저 시각 확인 완료(claude-in-chrome) — 두 toolbar 모두 Escape로 닫히고 초점이 편집기로 복귀, 같은 selection 재관측 시 안 열림, 새 selection이면 정상 재오픈. |

## 4. 기능별

### 4.1 블록 종류

| ID       | 확인 항목                                             | 관련 기능             | 상태      | 발견 |
| -------- | -------------------------------------------------------- | ---------------------- | --------- | ---- |
| `QA-020` | 문단·제목 H1~H6 생성과 편집                              | `BLK-001`~`003`        | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome, kitchen sink) — 슬래시 메뉴 키워드 `/h1`~`/h6`로 각 레벨 생성(폰트 크기 단계적으로 정상 축소 확인), 기존 제목 중간 텍스트 편집(커서 이동 후 삽입)도 정상 반영. **함정**: `/heading 1`처럼 공백 포함 쿼리는 메뉴가 열리지 않고(공백이 쿼리를 리셋/닫음, `parseSlashQuery`의 `/^\/(\S*)$/`가 공백을 거부하는 의도된 동작) 리터럴 텍스트로 남는다 — 키워드는 공백 없는 `h1`~`h6`/`heading`/`title` 단일 토큰만 매칭. |
| `QA-021` | 접이식 제목 펼침/접힘                                    | `BLK-004`              | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — `/toggle`(공백 없이)로 Toggle Heading 1 생성. **확인된 불변식**: 토글 제목 뒤에 그냥 Enter로 만든 새 블록은 형제(sibling)일 뿐 자동으로 자식이 되지 않는다(중첩 없음 → 접어도 안 사라짐, 정상) — `Tab`으로 명시적으로 들여써야 실제 자식이 되고, 그래야 collapse(`data-geul-collapsed="true"`)가 그 블록을 실제로 숨긴다(`display` 등으로 DOM에서 사라짐 확인). 펼침도 정상 복원. |
| `QA-022` | 인용문 생성·편집(**`BLK-005`는 이미 `PARTIAL`로 알려짐**) | `BLK-005`              | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — `/quote`로 생성, 좌측 border 인용문 스타일 정상 렌더, 텍스트 입력 정상. `PARTIAL`의 실제 범위(inventory 확인)는 GFM 마크다운 `>` 중첩 표현 미해결(`IO-007`/markdown round-trip 영역)뿐이라 이 UI 조작 자체와는 무관 — 정상 PASS로 기록. |
| `QA-023` | 구분선 삽입                                              | `BLK-006`              | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — `/divider`로 `<hr>` 삽입 확인. **처음엔 화면에 안 보여 QA-088과 같은 결함으로 오인할 뻔함** — `getBoundingClientRect()`로 재확인하니 `border-top: 1px solid rgb(218,220,224)`(연한 회색) 실제 존재, 확대 캡처(`zoom`)로 가는 선 육안 확인. 일반 스크린샷 압축에서 안 보일 만큼 얇고 연한 스타일일 뿐 결함 아님. |
| `QA-024` | 글머리·번호·체크·토글 목록 생성·중첩·토글                 | `BLK-007`~`010`        | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 4종 전부 슬래시 키워드로 생성(`/bullet`·`/numbered`·`/check`·`/list`→Toggle List 선택): 글머리·번호 목록 모두 `Tab`으로 중첩 시 정상 들여쓰기(번호 목록은 중첩 레벨에서 번호가 1부터 재시작), 체크 목록 체크박스 클릭 시 정상 토글(☑, 확대 캡처로 글리프 확인), 토글 목록은 `Tab`으로 자식을 만든 뒤 collapse 시 자식이 정상적으로 숨겨짐(Toggle Heading과 동일 메커니즘). |
| `QA-025` | 코드 블록 언어 선택                                      | `BLK-011`              | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — `/code`로 코드 블록 생성, 상단 "Code language" 콤보박스에 `javascript` 입력 시 "JavaScript" 옵션이 필터링돼 나타나고 Enter로 선택 반영됨(입력값이 `javascript`로 확정 표시). |
| `QA-026` | 코드 블록 Tab 들여쓰기                                   | `BLK-011`              | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 코드 블록 안에서 `Tab`은 2칸 공백을 삽입(`textContent` 직접 확인: `"function hello() {\n  "`), 편집기 밖으로 초점이 안 새어나감. `Shift+Tab`은 반대로 들여쓰기를 건드리지 않고 초점만 상단 "Code language" 콤보박스(`role="combobox"`)로 이동(inventory가 기록한 "focus escape" 동작과 일치, 실측 확인). |
| `QA-027` | 코드 블록 구문 강조(`BLK-017` 구현 완료 후 점검)          | `BLK-017`              | `NOT_RUN` | 2026-09-08 — `BLK-017`이 아직 `PARTIAL`(inventory 확인: language 선택·Tab 들여쓰기만 완료, syntax highlighting은 "R5 잔여 범위"로 미구현)이라 점검 항목 자체의 전제 조건 미충족. 코드 블록에 색상 강조가 없는 건 미구현 상태의 자명한 결과이지 버그가 아니므로 FAIL로 기록하지 않는다 — `BLK-017` syntax highlighting 구현 완료 후 재방문할 것(체크리스트 지시사항 그대로 따름). |
| `QA-028` | 파일·이미지·비디오·오디오 삽입(URL/업로드/드래그드롭/붙여넣기) | `BLK-013`~`016`, `MED-001`~`003` | `NOT_RUN` |      |
| `QA-029` | 미디어 이름·caption 편집                                 | `MED-004`              | `NOT_RUN` |      |
| `QA-030` | 미디어 교체·삭제                                         | `MED-005`              | `NOT_RUN` |      |
| `QA-031` | 미디어 다운로드·미리보기 전환                            | `MED-006`, `MED-008`   | `NOT_RUN` |      |
| `QA-032` | 미디어 미리보기 크기 조절                                | `MED-007`              | `NOT_RUN` |      |
| `QA-033` | 미디어 텍스트 정렬                                       | `MED-009`              | `NOT_RUN` |      |

### 4.2 인라인 서식

| ID       | 확인 항목                                | 관련 기능        | 상태      | 발견 |
| -------- | ------------------------------------------- | ----------------- | --------- | ---- |
| `QA-034` | 굵게·기울임·밑줄·취소선·인라인 코드·링크    | `INL-001`~`007`   | `NOT_RUN` |      |
| `QA-035` | 텍스트 글자색·배경색                       | `INL-008`~`009`   | `NOT_RUN` |      |
| `QA-036` | 블록 글자색·배경색                          | `INL-010`         | `NOT_RUN` |      |
| `QA-037` | 블록 텍스트 정렬                            | `INL-011`         | `NOT_RUN` |      |

### 4.3 문서 조작·UI

| ID       | 확인 항목                                                        | 관련 기능 | 상태      | 발견 |
| -------- | --------------------------------------------------------------------- | ---------- | --------- | ---- |
| `QA-038` | 여러 단계 undo/redo                                                  | `DOC-012`  | `NOT_RUN` |      |
| `QA-039` | 여러 블록 선택 후 이동·삭제                                          | `UI-004`   | `NOT_RUN` |      |
| `QA-040` | 문서 끝 trailing 빈 문단이 정확히 하나만 유지된다(`QA-011` 원인 불변식, 회귀 특히 주의) | `UI-010`   | `NOT_RUN` |      |
| `QA-041` | 마크다운 단축 입력(`#`·`>`·`-`·`1.`·`[]`·` ``` `)                     | `UI-011`   | `NOT_RUN` |      |
| `QA-042` | 슬래시 메뉴 검색·필터링                                              | `UI-001`   | `NOT_RUN` |      |
| `QA-043` | 블록 추가(+) 버튼                                                    | `UI-002`   | `NOT_RUN` |      |
| `QA-044` | Turn into(블록 종류 변경) 동작                                       | `UI-005`   | `NOT_RUN` |      |
| `QA-087` | 서식 toolbar의 블록 타입(Text ▾) select가 클릭·선택에 반응한다        | `UI-007`   | `PASS`    | 2026-09-08 사용자 실사용 중 발견(스크린샷) — 텍스트 선택 시 뜨는 서식 toolbar의 블록 타입(Text) select를 클릭해도 옵션이 선택되지 않음. **근본 원인**: `formatting-toolbar.tsx:349` 부근 `<select>`가 `IconButton` 형제들과 같은 `onMouseDown={preventDefault}`를 그대로 복제해 갖고 있었다 — 네이티브 `<select>`는 mousedown의 기본 동작이 곧 드롭다운을 여는 것이라(Chromium 실측) 막으면 드롭다운 자체가 안 열린다. `IconButton`의 이 패턴은 "mousedown이 contenteditable 초점을 훔치지 않는다"는 불변식을 위한 것인데, 이 select에 실제로 초점이 옮겨가도 편집기의 `window.getSelection()`은 collapse되지 않아(Chromium 실측) 지킬 불변식이 없다. 수정: `onMouseDown` 제거. 회귀 테스트: `formatting-toolbar.test.tsx`(mousedown이 `preventDefault`되지 않는지 직접 확인). 실브라우저 시각 확인 완료(claude-in-chrome) — select 클릭 후 방향키+Enter로 Heading 1 선택 시 실제 변환됨. |
| `QA-045` | 블록 중첩·중첩 해제 UI                                               | `UI-006`   | `NOT_RUN` |      |
| `QA-046` | placeholder·빈 문서 안내 문구 표시                                   | `UI-009`   | `NOT_RUN` |      |
| `QA-047` | emoji picker 삽입                                                    | `UI-012`   | `PASS` | 2026-09-08 실브라우저 확인(claude-in-chrome) — 실제 트리거는 "빈 문단에서 `:query` 전체 입력"(블록 텍스트 전체 일치, `parseEmojiQuery` `/^:(\S*)$/`)인데 쇼케이스 설명 문구는 "텍스트 중간에 ':'를 입력하면"으로 반대로 안내해 사용자가 문구대로 따라 하면(`"hi :smi"`처럼 기존 텍스트 뒤에 입력) 피커가 절대 안 뜬다. 기능 자체는 정상 — 설명 문구만 오도함. 수정: `08-emoji-picker/page.tsx`의 `description`을 slash menu 문구("빈 줄에서 '/'를...")와 같은 패턴("빈 줄에서 ':'를...")으로 교정. 회귀 테스트는 없음(카피 전용, 이 문구를 고정하는 테스트가 원래 없었음) — 실브라우저로 새 문구대로 조작해 `:sm` 입력 시 피커가 뜨는 것 확인. |

### 4.4 표

| ID       | 확인 항목                                       | 관련 기능        | 상태      | 발견 |
| -------- | ---------------------------------------------------- | ----------------- | --------- | ---- |
| `QA-048` | 행·열 추가·삭제                                     | `TBL-001`         | `NOT_RUN` |      |
| `QA-049` | 행·열 drag 재정렬                                    | `TBL-002`         | `NOT_RUN` |      |
| `QA-050` | 열 너비 조절                                         | `TBL-003`         | `NOT_RUN` |      |
| `QA-051` | 셀 범위 드래그 선택                                 | `TBL-004`         | `NOT_RUN` |      |
| `QA-052` | 셀 병합·분할                                        | `TBL-005`         | `NOT_RUN` |      |
| `QA-053` | 헤더 행·열 토글                                     | `TBL-006`         | `NOT_RUN` |      |
| `QA-054` | 셀 글자색·배경색                                    | `TBL-007`         | `NOT_RUN` |      |
| `QA-055` | 셀 텍스트 정렬                                      | `TBL-008`         | `NOT_RUN` |      |
| `QA-056` | 빠른 행·열 확장 버튼                                | `TBL-009`         | `NOT_RUN` |      |
| `QA-057` | Tab/Shift+Tab 셀 탐색, 마지막 셀 Tab 새 행 생성      | `TBL-010`~`011`   | `NOT_RUN` |      |
| `QA-058` | Excel/Google Sheets 붙여넣기, 기존 표 덮어쓰기       | `TBL-013`~`014`   | `NOT_RUN` |      |
| `QA-088` | 슬래시 메뉴로 표를 삽입하면 실제로 grid(셀 테두리)가 보인다(그냥 빈 문단처럼 보이지 않는다) | `TBL-001`         | `PASS` | 2026-09-08 §3 점검 중 발견 — Slash menu 쇼케이스에서 `/table`로 표를 삽입하면 셀은 실제로 생성되는데(3x3 `<table><tbody><tr><td>`, 행/열 핸들도 정상 동작) 화면엔 아무것도 안 보임 — 빈 문단 placeholder만 그대로 보여 "명령이 아무 효과도 없다"로 오인하기 쉬움. **근본 원인**: `table-extension.ts`는 구조만 렌더하고, `_editor.scss`(`.geul-editor`)엔 blockquote·code block·hr 등 다른 모든 블록 종류와 달리 `table`/`td`에 border 규칙이 아예 없었다(`getComputedStyle(td).border` 실측 `"0px none"`) — 헤더 행/열 배경색 규칙만 있고 그 배경이 강조할 기본 grid 자체가 없었다. 수정: `.geul-editor table { border-collapse: collapse; }` / `table td { box-sizing: border-box; padding: 0.375rem 0.5rem; border: 1px solid var(--geul-color-border, #dadce0); vertical-align: top; }` 추가(box-sizing: border-box로 colgroup의 픽셀 폭 계약을 border·padding이 밀어내지 않게 함). 회귀 테스트: `style-build.test.ts`. 실브라우저 시각 확인 완료(claude-in-chrome) — grid 선 표시, 행/열 핸들·add row/column 버튼 정상 동작 유지. |

### 4.5 입출력

| ID       | 확인 항목                               | 관련 기능 | 상태      | 발견 |
| -------- | ------------------------------------------- | ---------- | --------- | ---- |
| `QA-059` | 파일·HTML·마크다운·일반 텍스트 붙여넣기 각각 | `IO-007`   | `NOT_RUN` |      |

### 4.6 확장성·테마·i18n (쇼케이스 예제)

| ID       | 확인 항목                                                     | 관련 기능        | 상태      | 발견 |
| -------- | ------------------------------------------------------------------ | ----------------- | --------- | ---- |
| `QA-060` | 커스텀 블록·슬래시메뉴 예제                                       | `EXT-001`~`006`   | `NOT_RUN` |      |
| `QA-061` | formatting/link/side/table UI 교체 예제(**`EXT-007`은 이미 `PARTIAL`로 알려짐**) | `EXT-007`  | `NOT_RUN` |      |
| `QA-062` | 테마·CSS 변수·다크모드 override 예제                              | `EXT-008`         | `NOT_RUN` |      |
| `QA-063` | i18n(ko/en) override 시 문구 넘침·레이아웃 붕괴 없음(`QA-011`과 같은 성격) | `EXT-009`~`010` | `NOT_RUN` |      |

## 5. 공격적·경계 케이스 테스트

§3~4의 정상 케이스를 통과한 뒤에만 진행한다(2026-09-08 사용자 지시 — "정상적인 케이스를 통과한 후에는 의도적으로 오동작하도록 공격적인 UI/UX 테스트가 필요하다"). 정상 동작을 모르면 비정상 입력의 결과가 "의도된 실패"인지 "버그"인지 판단할 수 없다.

### 5.1 동시성·타이밍

| ID       | 확인 항목                                                          | 관련 기능 | 상태      | 발견 |
| -------- | ------------------------------------------------------------------- | ---------- | --------- | ---- |
| `QA-064` | 메뉴가 열리는 도중 빠르게 다른 곳을 클릭해도 중복 오픈·고스트 메뉴가 남지 않는다 | 공통 | `NOT_RUN` |      |
| `QA-065` | 드래그(블록 재정렬·표 리사이즈) 중 Escape를 누르면 취소되고 원래 위치로 복원된다 | `UI-003`, `TBL-003` | `NOT_RUN` |      |
| `QA-066` | 업로드 진행 중 해당 블록을 삭제·이동해도 크래시 없이 처리된다        | `MED-002`  | `NOT_RUN` |      |
| `QA-067` | undo/redo를 빠르게 연타해도 문서가 깨지지 않는다                    | `DOC-012`  | `NOT_RUN` |      |
| `QA-068` | 같은 단축키를 연타해도(예: bold 토글) 상태가 예상대로 반전된다       | `UI-011`   | `NOT_RUN` |      |

### 5.2 IME·한글 입력(조합 중 타이밍)

한글은 자소가 완성되기 전까지 조합 상태를 거친다 — 입력 규칙(마크다운 단축, 슬래시 트리거)이 조합 도중의 미완성 문자에 반응하면 안 된다.

| ID       | 확인 항목                                                              | 관련 기능 | 상태      | 발견 |
| -------- | ------------------------------------------------------------------------- | ---------- | --------- | ---- |
| `QA-069` | 한글 조합 중 Enter/Backspace가 입력 규칙을 오작동시키지 않는다             | `UI-011`   | `NOT_RUN` |      |
| `QA-070` | 조합 중 문자에 ` ``` `·`#`·`-` 등 트리거 문자가 섞여도 완성 전에는 규칙이 발동하지 않는다 | `UI-011`   | `NOT_RUN` |      |
| `QA-071` | IME 조합 창이 뜬 상태에서 슬래시 메뉴·서식 toolbar가 겹치지 않는다         | `UI-001`, `UI-007` | `NOT_RUN` |      |

### 5.3 극단적 콘텐츠 크기

| ID       | 확인 항목                                                        | 관련 기능 | 상태      | 발견 |
| -------- | ----------------------------------------------------------------- | ---------- | --------- | ---- |
| `QA-072` | 한 블록에 매우 긴 텍스트(수천~수만 자)를 넣어도 타이핑 반응이 눈에 띄게 느려지지 않는다 | `DOC-001`  | `NOT_RUN` |      |
| `QA-073` | 목록을 최대 중첩 깊이(64단계)까지 만들어도 UI가 깨지지 않는다        | `DOC-002`  | `NOT_RUN` |      |
| `QA-074` | 표를 10,000셀 근접까지 채워도 스크롤·편집이 정상 동작한다(`TBL-012` 성능 계약과 별개로 렌더 확인) | `TBL-012`  | `NOT_RUN` |      |
| `QA-075` | 매우 긴 파일명·URL·언어명을 넣어도 레이아웃이 넘치거나 깨지지 않는다  | `MED-004`, `BLK-011` | `NOT_RUN` |      |

### 5.4 특수·비정상 입력

| ID       | 확인 항목                                                         | 관련 기능 | 상태      | 발견 |
| -------- | -------------------------------------------------------------------- | ---------- | --------- | ---- |
| `QA-076` | 이모지·서로게이트 쌍·RTL(아랍어 등) 텍스트에서 커서 이동·삭제가 깨지지 않는다 | `INL-001`  | `NOT_RUN` |      |
| `QA-077` | 코드 블록 언어 필드에 HTML 태그·따옴표·백틱을 넣어도 escape돼 안전하게 표시된다(XSS 없음) | `BLK-011`  | `NOT_RUN` |      |
| `QA-078` | 닫히지 않은 코드 펜스 등 비정상 마크다운을 붙여넣어도 크래시 없이 처리된다 | `IO-004`   | `NOT_RUN` |      |
| `QA-079` | 지원하지 않는 파일 형식·매우 큰 파일 업로드가 명확한 오류로 처리되고 앱이 멈추지 않는다 | `MED-002`  | `NOT_RUN` |      |
| `QA-080` | 클립보드에 이미지+텍스트가 섞여 있을 때 붙여넣기 결과가 예측 가능하다 | `IO-007`   | `NOT_RUN` |      |

### 5.5 경계 위치·화면 조건

| ID       | 확인 항목                                                     | 관련 기능 | 상태      | 발견 |
| -------- | ------------------------------------------------------------------ | ---------- | --------- | ---- |
| `QA-081` | 문서 첫 블록 Backspace, 마지막 블록 Tab/Enter 등 경계 조작이 예외를 던지지 않는다 | `UI-010`   | `NOT_RUN` |      |
| `QA-082` | 브라우저 확대(200%)·축소(50%) 상태에서 오버레이 위치가 깨지지 않는다 | 공통       | `NOT_RUN` |      |
| `QA-083` | 매우 좁은 뷰포트(모바일보다 좁게)에서도 메뉴가 화면 밖으로 밀려나거나 조작 불가능해지지 않는다 | `UI-015`   | `NOT_RUN` |      |

### 5.6 네트워크·업로드 실패

| ID       | 확인 항목                                              | 관련 기능 | 상태      | 발견 |
| -------- | ----------------------------------------------------------- | ---------- | --------- | ---- |
| `QA-084` | 업로드 콜백이 실패(reject)하면 실패가 사용자에게 보이고 문서가 깨지지 않는다 | `MED-002`  | `NOT_RUN` |      |
| `QA-085` | 업로드 도중 네트워크가 끊기거나 느려도 취소·재시도가 가능하다 | `MED-002`  | `NOT_RUN` |      |

## 6. 항목 추가 절차

1. `roadmap.md`·인벤토리에 새 기능이 `VERIFIED`/`PARTIAL`로 올라와 1차 릴리즈(또는 그 다음 릴리즈) 배포 표면에 들어오면, 그 기능이 실제로 조작 가능한 시나리오 수만큼 `QA-NNN`을 이어서 추가한다. 정상 케이스는 §4에, 의도적 오동작 유도 케이스는 §5에 추가한다.
2. ID는 순번을 이어 붙인다 — 항목을 빼거나 통합해도 기존 ID를 재사용하거나 다시 매기지 않는다(`docs/guides`의 ID 안정성 원칙과 동일). 나중에 발견해 추가한 항목은 논리적으로 속하는 표에 넣되 번호는 그 표의 다른 행보다 클 수 있다 — 표 안 번호가 연속이 아닌 것은 정상이다.
3. 같은 원인(예: `position: fixed` 오버레이 겹침·잘못된 anchor)이 새 컴포넌트에서 또 나오면 §3 "공통 패턴" 표에 새 행을 추가한다 — 원인 설명을 표 앞 문단에 중복 기록하지 않는다.
4. 항목을 확인했으면 상태와 "발견" 열(결함이면 재현 절차·근거, 수정했으면 커밋 해시)을 갱신한다. 과거 확인 이력을 별도로 보존하지 않는다 — 회차별 이력이 필요해지면 `docs/reviews/`로 옮기는 것을 검토한다.
