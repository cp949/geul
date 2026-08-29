# BlockNote 무료 기능 인벤토리

## 1. 기준선

이 문서는 제품 목표인 **"BlockNote가 제공하는 무료 기능 + 독자 기능"**의 범위를 고정한다.

- 기준 저장소: `/work/thrd/BlockNote`
- 기준 버전: `v0.54.0`
- 기준 커밋: `ea5d80358f179d1683abcd2e0e3e9d547bf52eef`
- 기준 일자: 2026-08-13
- 포함 라이선스: MPL-2.0 패키지가 제공하는 제품 기능
- 제외 라이선스: 모든 `packages/xl-*` 기능

포함 패키지 기준선:

- `@blocknote/core`
- `@blocknote/react`
- `@blocknote/server-util`
- `@blocknote/code-block`
- `@blocknote/diagram-block`
- `@blocknote/math-block`
- Ariakit, Mantine, shadcn UI 패키지에서 드러나는 공통 제품 기능

제외 패키지 기준선:

- `xl-ai`, `xl-ai-server`
- `xl-multi-column`
- `xl-pdf-exporter`, `xl-docx-exporter`, `xl-odt-exporter`, `xl-email-exporter`

BlockNote의 이후 릴리스는 자동으로 이 범위에 포함하지 않는다. 기준 버전을 올릴 때 별도의 gap review로 기능, 라이선스와 로드맵 영향을 검토한다.

## 2. 분류

### 목표 수준

| 값 | 의미 |
| --- | --- |
| `PARITY` | BlockNote 무료 기능과 동등한 사용자 결과를 제공한다. |
| `ENHANCED` | 동등 기능을 제공하고 명시된 독자 개선을 추가한다. |
| `CUSTOM` | BlockNote 무료 기준선에는 없는 독자 기능이다. |
| `EXCLUDED` | 동일 구현을 만들 필요가 없거나 라이선스 경계상 제외한다. |

### 구현 상태

| 값 | 의미 |
| --- | --- |
| `NOT_STARTED` | 구현 증거가 없다. |
| `IN_PROGRESS` | 구현 중이며 완료 계약을 충족하지 못했다. |
| `PARTIAL` | 일부 기능은 작동하지만 parity 계약 전체는 검증되지 않았다. |
| `VERIFIED` | 기능, 저장 round-trip과 필요한 브라우저 검증을 통과했다. |

R0 기능 ID는 모델·입출력·코어·React·브라우저 및 배포 검증을 통과해 `VERIFIED`다. 후속 단계 기능 중 R0에서 제한된 하위 기능이 구현된 항목은 `PARTIAL`, 구현 증거가 없는 항목은 해당 단계의 완료 계약을 통과하기 전까지 `NOT_STARTED`다.

## 3. 기능 인벤토리

### 3.1 문서 모델과 편집 코어

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `DOC-001` | 안정적인 블록 ID와 블록 트리 | `PARITY` | R0 | `VERIFIED` | `foundations/document-structure.mdx` |
| `DOC-002` | 자식 블록 중첩 모델 | `PARITY` | R2 | `PARTIAL` | `foundations/document-structure.mdx` — 슬라이스 1(Issue #38)이 `paragraph`·`heading` 중첩을 구현(재귀 검증·깊이 상한 64, 컨테이너 스키마, HTML/GFM round-trip). 자식 딸린 블록의 이동·복제(`moveBlockBefore`/`duplicateBlock`)는 하위 트리 미인지로 거절 잔존(Issue #125), 다른 블록 타입의 중첩은 후속 슬라이스 |
| `DOC-003` | 독자 JSON 저장·복원 | `ENHANCED` | R0 | `VERIFIED` | `foundations/supported-formats.mdx` |
| `DOC-004` | 블록 읽기와 순회 API | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/manipulating-content.mdx` |
| `DOC-005` | 블록 삽입·수정·교체·삭제 API | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/manipulating-content.mdx` |
| `DOC-006` | 블록 이동·중첩·중첩 해제 API | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/manipulating-content.mdx` |
| `DOC-007` | 커서 조회·설정 API | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/cursor-selections.mdx` |
| `DOC-008` | 선택 범위 조회·설정 API | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/cursor-selections.mdx` |
| `DOC-009` | lifecycle·selection·change 이벤트 | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/events.mdx` |
| `DOC-010` | 변경 전 검사와 취소 | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/events.mdx` |
| `DOC-011` | 변경 블록과 변경 원인 보고 | `PARITY` | R0 | `VERIFIED` | `reference/editor/events.mdx` |
| `DOC-012` | 트랜잭션 단위 undo/redo | `PARITY` | R0 | `VERIFIED` | `foundations/manipulating-content.mdx` |
| `DOC-013` | 읽기 전용 편집기 | `PARITY` | R4 | `NOT_STARTED` | React editor API와 examples |
| `DOC-014` | Vanilla/headless 코어와 React 어댑터 분리 | `ENHANCED` | R0 | `VERIFIED` | `getting-started/vanilla-js.mdx` + 제품 결정 |

### 3.2 기본 블록

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `BLK-001` | 문단 | `PARITY` | R1 | `VERIFIED` | R0 기본 편집 + R1 slash 메뉴·drag·복제·삭제 메뉴(슬라이스 3-4) 통합 완료 |
| `BLK-002` | 제목 H1-H3 | `PARITY` | R1 | `VERIFIED` | R0 기본 편집 + R1 slash 메뉴·drag·복제·삭제 메뉴(슬라이스 3-4) 통합 완료 |
| `BLK-003` | 제목 H4-H6 | `PARITY` | R2 | `VERIFIED` | 슬라이스 3(Issue #38) — `model`의 `HeadingBlock.level` 1-6 확장, `core` 편집·명령·placeholder·split/join, `io` HTML/GFM/clipboard 3경로 대칭 매핑, `react` 슬래시 메뉴·Turn into·툴바·scss, e2e 계산 스타일까지 전 계층 완결 |
| `BLK-004` | 자식을 접는 토글 제목 | `PARITY` | R2 | `NOT_STARTED` | `features/blocks/typography.mdx` |
| `BLK-005` | 인용문 | `PARITY` | R2 | `PARTIAL` | 슬라이스 3(Issue #38) — `QuoteBlock` 신설, 편집·변환·placeholder·HTML round-trip·GFM(strict 거절/lossy 평탄화) 완료. `TextBlockProps`(색상·정렬)는 슬라이스 8, GFM `>` 중첩(`children`) 표현 재평가는 슬라이스 5로 이월 |
| `BLK-006` | 구분선 | `PARITY` | R2 | `PARTIAL` | 슬라이스 3(Issue #38) — `DividerBlock` 신설, 삽입·삭제(Backspace/Delete, 표 전례)·HTML/GFM round-trip 완료. 종류 변경(Turn into) 비대상은 설계 결정(콘텐츠 없는 블록 — 표 전례와 동일, 잔여 아님), 클립보드 `<hr>` 붙여넣기는 슬라이스 10으로 이월 |
| `BLK-007` | 글머리 목록 | `PARITY` | R2 | `NOT_STARTED` | `features/blocks/list-types.mdx` |
| `BLK-008` | 시작 번호를 지원하는 번호 목록 | `PARITY` | R2 | `NOT_STARTED` | `features/blocks/list-types.mdx` |
| `BLK-009` | 체크 목록 | `PARITY` | R2 | `NOT_STARTED` | `features/blocks/list-types.mdx` |
| `BLK-010` | 자식을 접는 토글 목록 | `PARITY` | R2 | `NOT_STARTED` | `features/blocks/list-types.mdx` |
| `BLK-011` | 코드 블록과 언어 속성 | `PARITY` | R2 | `NOT_STARTED` | `features/blocks/code-blocks.mdx` |
| `BLK-012` | 문서형 테이블 | `ENHANCED` | R1 | `VERIFIED` | R1 슬라이스 6-12: 표 편집·조작(`TBL-*`)에 더해 슬라이스 12가 표 문서 로드 차단을 해제해 저장 round-trip(열 너비·병합·헤더·색상) 완료 |
| `BLK-013` | 일반 파일 블록 | `PARITY` | R3 | `NOT_STARTED` | `features/blocks/embeds.mdx` |
| `BLK-014` | 이미지 블록 | `PARITY` | R3 | `NOT_STARTED` | `features/blocks/embeds.mdx` |
| `BLK-015` | 비디오 블록 | `PARITY` | R3 | `NOT_STARTED` | `features/blocks/embeds.mdx` |
| `BLK-016` | 오디오 블록 | `PARITY` | R3 | `NOT_STARTED` | `features/blocks/embeds.mdx` |
| `BLK-017` | 코드 구문 강조·언어 선택·탭 들여쓰기 | `PARITY` | R5 | `NOT_STARTED` | `@blocknote/code-block`, `features/blocks/code-blocks.mdx` |
| `BLK-018` | Mermaid 다이어그램 블록 | `PARITY` | R5 | `NOT_STARTED` | `@blocknote/diagram-block`, `features/blocks/diagrams.mdx` |
| `BLK-019` | LaTeX 수식 블록 | `PARITY` | R5 | `NOT_STARTED` | `@blocknote/math-block`, `features/blocks/math.mdx` |

### 3.3 인라인 콘텐츠와 스타일

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `INL-001` | 일반 텍스트 | `PARITY` | R1 | `VERIFIED` | `features/blocks/inline-content.mdx` — R0부터 문단·H1-H3 기본 편집으로 동작, R1 slash 메뉴·formatting toolbar와 통합 완료 |
| `INL-002` | 링크와 링크 click 정책 | `PARITY` | R1 | `VERIFIED` | `features/blocks/inline-content.mdx` |
| `INL-003` | 굵게 | `PARITY` | R1 | `VERIFIED` | `defaultStyleSpecs` |
| `INL-004` | 기울임 | `PARITY` | R1 | `VERIFIED` | `defaultStyleSpecs` |
| `INL-005` | 밑줄 | `PARITY` | R1 | `VERIFIED` | `defaultStyleSpecs` |
| `INL-006` | 취소선 | `PARITY` | R1 | `VERIFIED` | `defaultStyleSpecs` |
| `INL-007` | 인라인 코드 | `PARITY` | R1 | `VERIFIED` | `defaultStyleSpecs` |
| `INL-008` | 글자색 | `PARITY` | R2 | `NOT_STARTED` | `defaultStyleSpecs` |
| `INL-009` | 텍스트 배경색 | `PARITY` | R2 | `NOT_STARTED` | `defaultStyleSpecs` |
| `INL-010` | 블록 글자색·배경색 | `PARITY` | R2 | `NOT_STARTED` | default block props, drag handle color menu |
| `INL-011` | 블록 텍스트 정렬 | `PARITY` | R2 | `NOT_STARTED` | default block props, formatting toolbar |
| `INL-012` | 인라인 LaTeX 수식 | `PARITY` | R5 | `NOT_STARTED` | `@blocknote/math-block`, `features/blocks/math.mdx` |

### 3.4 블록 편집 UI

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `UI-001` | 검색 가능한 슬래시 메뉴 | `PARITY` | R1 | `VERIFIED` | `SuggestionMenu`, default slash items |
| `UI-002` | 블록 추가 버튼 | `PARITY` | R1 | `VERIFIED` | `SideMenu/AddBlockButton` |
| `UI-003` | 블록 drag handle과 재정렬 | `PARITY` | R1 | `VERIFIED` | `SideMenu`, drag extension(구현은 Pointer Event 사용) |
| `UI-004` | 여러 블록 선택·이동·삭제 | `PARITY` | R2 | `NOT_STARTED` | `SideMenu/MultipleNodeSelection` |
| `UI-005` | 블록 종류 변경 메뉴 | `PARITY` | R1 | `VERIFIED` | formatting toolbar block type select |
| `UI-006` | 블록 중첩·중첩 해제 UI | `PARITY` | R2 | `PARTIAL` | formatting toolbar nest buttons — 슬라이스 1이 서식 툴바 들여쓰기/내어쓰기 버튼(`indentBlock`/`outdentBlock`)과 중첩 시각 렌더링을 구현. 표(`TableBlock`) 들여쓰기 UI 경로는 아직 없음(Issue #126) |
| `UI-007` | 텍스트 선택 formatting toolbar | `PARITY` | R1 | `VERIFIED` | `FormattingToolbar` |
| `UI-008` | 링크 열기·수정·삭제 toolbar | `PARITY` | R1 | `VERIFIED` | `LinkToolbar` |
| `UI-009` | placeholder와 빈 문서 안내 | `PARITY` | R2 | `PARTIAL` | `Placeholder` extension — 슬라이스 2가 core 자체 데코레이션 확장으로 paragraph(캐럿 위치 시)·heading(빈 상태 상시) placeholder를 구현(표 셀 제외). 슬라이스 3이 인용문 placeholder(상시 "Quote" 표시)를 추가했다. 코드·목록 등 나머지 블록 타입의 placeholder는 각 타입을 추가하는 슬라이스가 완료 기준으로 포함한다 |
| `UI-010` | 마지막 editable trailing block | `PARITY` | R2 | `VERIFIED` | `TrailingNode` extension — 슬라이스 2가 core 자체 불변식(`appendTransaction` + 로드 정규화)으로 구현, Tiptap `TrailingNode` 미사용. 마지막 최상위 블록이 자식 없는 paragraph가 아니면 빈 paragraph 자동 추가(로드 포함, 로드 시 revision·onChange 억제) |
| `UI-011` | 기본 키보드 단축키와 입력 규칙 | `PARITY` | R2 | `NOT_STARTED` | keyboard shortcuts, block input rules |
| `UI-012` | emoji picker | `PARITY` | R4 | `NOT_STARTED` | grid suggestion menu, emoji items |
| `UI-013` | 메뉴·popover portal target 제어 | `PARITY` | R4 | `NOT_STARTED` | React component portal API |
| `UI-014` | 블록 복제·삭제 menu | `ENHANCED` | R1 | `VERIFIED` | 삭제 parity + 승인된 복제 계약(복제본 바로 다음 삽입, 포커스 이동) |
| `UI-015` | BlockNote 지원 범위의 mobile·touch UI | `PARITY` | R4 | `NOT_STARTED` | mobile formatting toolbar, touch resize handlers |
| `UI-016` | 키보드 focus와 ARIA 접근성 계약 | `PARITY` | R4 | `NOT_STARTED` | suggestion menu ARIA, keyboard navigation |

### 3.5 강화 테이블

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 또는 독자 계약 |
| --- | --- | --- | --- | --- | --- |
| `TBL-001` | 행·열 추가와 삭제 | `PARITY` | R1 | `VERIFIED` | table handle menus |
| `TBL-002` | 행·열 drag 재정렬 | `PARITY` | R1 | `VERIFIED` | table handles extension |
| `TBL-003` | 열 경계 drag 너비 조절 | `ENHANCED` | R1 | `VERIFIED` | table column widths + 독자 안정성 계약 |
| `TBL-004` | 직사각형 셀 범위 선택 | `PARITY` | R1 | `VERIFIED` | table cell selection |
| `TBL-005` | 셀 병합과 분할 | `PARITY` | R1 | `VERIFIED` | `features/blocks/tables.mdx` |
| `TBL-006` | 첫 헤더 행과 첫 헤더 열 | `PARITY` | R1 | `VERIFIED` | `features/blocks/tables.mdx` |
| `TBL-007` | 셀 글자색·배경색 | `PARITY` | R1 | `VERIFIED` | 행/열/셀 단위 모두 지원(슬라이스 9b, table cell format menu) |
| `TBL-008` | 셀 텍스트 정렬 | `PARITY` | R1 | `VERIFIED` | 셀 단위 정렬 지원(슬라이스 9b, table cell format menu) |
| `TBL-009` | 빠른 행·열 확장 control | `PARITY` | R1 | `VERIFIED` | table extend buttons |
| `TBL-010` | Tab/Shift+Tab 셀 탐색 | `PARITY` | R1 | `VERIFIED` | table keyboard behavior(슬라이스 10) |
| `TBL-011` | 마지막 셀 Tab의 새 행 생성 | `PARITY` | R1 | `VERIFIED` | table keyboard behavior(슬라이스 10) |
| `TBL-012` | 단일 표 10,000 논리 셀 보장 | `CUSTOM` | R1 | `VERIFIED` | 승인된 성능 계약 |
| `TBL-013` | Excel/Google Sheets HTML·TSV 붙여넣기 | `CUSTOM` | R1 | `VERIFIED` | 승인된 클립보드 계약 |
| `TBL-014` | 기존 표 덮어쓰기와 자동 확장 | `CUSTOM` | R1 | `VERIFIED` | 승인된 클립보드 계약 |

### 3.6 파일과 미디어

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `MED-001` | URL 기반 파일·미디어 삽입 | `PARITY` | R3 | `NOT_STARTED` | `features/blocks/embeds.mdx` |
| `MED-002` | 소비자 제공 upload callback | `PARITY` | R3 | `NOT_STARTED` | file panel and upload API |
| `MED-003` | 파일 drag/drop과 paste | `PARITY` | R3 | `NOT_STARTED` | paste handling, file extensions |
| `MED-004` | 파일 이름과 caption | `PARITY` | R3 | `NOT_STARTED` | file block props and toolbar |
| `MED-005` | 파일 교체와 삭제 | `PARITY` | R3 | `NOT_STARTED` | file panel and formatting toolbar |
| `MED-006` | 파일 다운로드와 preview | `PARITY` | R3 | `NOT_STARTED` | file formatting toolbar |
| `MED-007` | 이미지·비디오 preview 너비 조절 | `PARITY` | R3 | `NOT_STARTED` | image/video block props and toolbar |
| `MED-008` | preview와 링크 표시 전환 | `PARITY` | R3 | `NOT_STARTED` | embed block props |

### 3.7 입출력과 clipboard

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 또는 독자 계약 |
| --- | --- | --- | --- | --- | --- |
| `IO-001` | 독자 JSON 무손실 round-trip | `ENHANCED` | R0 | `VERIFIED` | BlockNote JSON 저장 권장 + 독자 모델 |
| `IO-002` | 고충실도 HTML import/export | `ENHANCED` | R0 | `VERIFIED` | Full HTML parity + 독자 sanitizer 계약 |
| `IO-003` | 표준 HTML 상호운용 | `PARITY` | R0 | `VERIFIED` | `features/import/html.mdx`, HTML export docs |
| `IO-004` | GFM Markdown import | `PARITY` | R0 | `VERIFIED` | `features/import/markdown.mdx` |
| `IO-005` | GFM strict/lossy export와 손실 보고 | `ENHANCED` | R0 | `VERIFIED` | Markdown lossy parity + 독자 strict 계약 |
| `IO-006` | HTML sanitize와 안전 URL 정책 | `ENHANCED` | R0 | `VERIFIED` | 독자 보안 계약 |
| `IO-007` | 파일·HTML·Markdown·plain text paste | `PARITY` | R2 | `NOT_STARTED` | `reference/editor/paste-handling.mdx` |
| `IO-008` | 사용자 정의 paste handler | `PARITY` | R4 | `NOT_STARTED` | `reference/editor/paste-handling.mdx` |
| `IO-009` | 서버 측 parse/render | `PARITY` | R4 | `NOT_STARTED` | `@blocknote/server-util`, server docs |
| `IO-010` | XLSX 파일 import/export | `CUSTOM` | R7 | `NOT_STARTED` | 제품 결정 |
| `IO-011` | CSV 손실형 import/export와 경고 | `CUSTOM` | R7 | `NOT_STARTED` | 제품 결정 |

### 3.8 확장성과 제품 통합

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `EXT-001` | 사용자 정의 블록 schema | `PARITY` | R4 | `NOT_STARTED` | `features/custom-schemas/custom-blocks.mdx` |
| `EXT-002` | 사용자 정의 인라인 콘텐츠 schema | `PARITY` | R4 | `NOT_STARTED` | `features/custom-schemas/custom-inline-content.mdx` |
| `EXT-003` | 사용자 정의 style/mark schema | `PARITY` | R4 | `NOT_STARTED` | `features/custom-schemas/custom-styles.mdx` |
| `EXT-004` | schema 확장과 처음부터 구성 | `PARITY` | R4 | `NOT_STARTED` | `features/custom-schemas/index.mdx` |
| `EXT-005` | 사용자 정의 extension과 command 등록 | `PARITY` | R4 | `NOT_STARTED` | `features/extensions.mdx` |
| `EXT-006` | 사용자 정의 slash·suggestion menu | `PARITY` | R4 | `NOT_STARTED` | suggestion menu components |
| `EXT-007` | formatting/link/side/table UI 교체 | `PARITY` | R4 | `NOT_STARTED` | React component APIs |
| `EXT-008` | CSS 변수·theme·DOM 속성·style override | `PARITY` | R4 | `NOT_STARTED` | React styling/theming docs |
| `EXT-009` | i18n dictionary와 사용자 번역 | `PARITY` | R4 | `NOT_STARTED` | `features/localization.mdx` |
| `EXT-010` | v0.54.0 기본 locale 사전 전체 | `PARITY` | R4 | `NOT_STARTED` | `features/localization.mdx` |
| `EXT-011` | source-with-preview 확장 패턴 | `PARITY` | R5 | `NOT_STARTED` | `features/custom-schemas/source-with-preview.mdx` |
| `EXT-012` | Ariakit·Mantine·shadcn별 별도 UI 배포 | `EXCLUDED` | - | - | 동일 기능의 대체 구현체; 독자 React UI 하나로 대체 |
| `EXT-013` | Next.js 등 SSR framework의 client-only 통합 | `PARITY` | R4 | `NOT_STARTED` | `getting-started/nextjs.mdx` |

`EXT-010`의 기준 locale은 로컬 v0.54.0 소스에 존재하는 다음 23개다: `ar`, `de`, `en`, `es`, `fa`, `fr`, `he`, `hr`, `is`, `it`, `ja`, `ko`, `nl`, `no`, `pl`, `pt`, `ru`, `sk`, `uk`, `uz`, `vi`, `zh`, `zh-tw`.

### 3.9 공동 편집, 댓글과 버전

| ID | 기능 | 목표 | 단계 | 상태 | BlockNote 근거 |
| --- | --- | --- | --- | --- | --- |
| `COL-001` | Yjs 문서 어댑터 | `PARITY` | R6 | `NOT_STARTED` | `@blocknote/core/yjs`, collaboration docs |
| `COL-002` | 실시간 원격 변경 동기화 | `PARITY` | R6 | `NOT_STARTED` | `features/collaboration/index.mdx` |
| `COL-003` | 사용자 cursor·selection presence | `PARITY` | R6 | `NOT_STARTED` | collaboration docs |
| `COL-004` | 사용자 조회와 표시 정보 cache | `PARITY` | R6 | `NOT_STARTED` | collaboration/comments docs |
| `COL-005` | comment thread와 reply | `PARITY` | R6 | `NOT_STARTED` | `features/collaboration/comments.mdx` |
| `COL-006` | comment reaction | `PARITY` | R6 | `NOT_STARTED` | `features/collaboration/comments.mdx` |
| `COL-007` | comment 권한과 외부 ThreadStore | `PARITY` | R6 | `NOT_STARTED` | `features/collaboration/comments.mdx` |
| `COL-008` | 버전 생성·목록·복원 | `PARITY` | R6 | `NOT_STARTED` | `Versioning` extension and components |
| `COL-009` | CRDT에서 테이블 명령 충돌 정책 | `ENHANCED` | R6 | `NOT_STARTED` | 독자 TableGrid/CRDT 계약 |

### 3.10 최종 독자 기능

| ID | 기능 | 목표 | 단계 | 상태 | 근거 |
| --- | --- | --- | --- | --- | --- |
| `CUS-001` | 안전한 범용 iframe 블록 | `CUSTOM` | R8 | `NOT_STARTED` | 제품 목표 |
| `CUS-002` | iframe allow-origin과 sandbox 정책 | `CUSTOM` | R8 | `NOT_STARTED` | 제품 보안 요구 |
| `CUS-003` | p5.js 실행·preview 통합 | `CUSTOM` | R8 | `NOT_STARTED` | 제품 목표 |
| `CUS-004` | iframe 크기 조절과 로딩 실패 UI | `CUSTOM` | R8 | `NOT_STARTED` | 제품 목표 |
| `CUS-005` | iframe/p5.js JSON·HTML 직렬화 | `CUSTOM` | R8 | `NOT_STARTED` | 제품 목표 |

## 4. 명시적 제외 기능

다음 기능은 BlockNote에 존재하지만 이 기준선의 parity 목표가 아니다.

| 기능 | 제외 이유 |
| --- | --- |
| 생성형 AI | `xl-ai*` GPL-3.0/상용 경계 |
| 다중 컬럼 layout | `xl-multi-column` GPL-3.0/상용 경계 |
| BlockNote PDF/DOCX/ODT/Email exporter | 각 `xl-*-exporter` GPL-3.0/상용 경계 |
| BlockNote API와 JSON 호환 | 제품이 호환성보다 독자 공개 계약을 선택함 |
| BlockNote의 픽셀·아이콘·CSS 복제 | 동작 parity와 독자 시각 디자인 원칙에 어긋남 |
| 세 가지 UI 프레임워크용 동일 컴포넌트 세트 | 사용자 기능이 아닌 대체 배포 구현이며 독자 React UI로 대체 |

## 5. 검증과 갱신 규칙

- 기능은 코드가 존재한다는 이유만으로 `VERIFIED`가 되지 않는다.
- 저장 가능한 기능은 독자 JSON round-trip을 통과해야 한다.
- HTML/GFM으로 표현되는 기능은 각 포맷의 보존·손실 계약을 검증해야 한다.
- 포인터·키보드 조작은 실제 브라우저 테스트를 통과해야 한다.
- 공개 API는 타입 계약과 fixture 소비자 앱에서 검증한다.
- BlockNote 기준 버전을 올릴 때 새 기능, 제거 기능, 의미 변경과 라이선스 이동을 별도 문서로 검토한다.
- 기능의 단계 변경은 이 인벤토리와 `roadmap.md`를 같은 변경에서 갱신한다.
