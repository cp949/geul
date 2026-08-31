# 제품 로드맵

## 1. 목표

최종 제품은 다음의 합집합이다.

```text
BlockNote v0.54.0의 MPL-2.0 제품 기능
+ 강화된 테이블과 스프레드시트 상호운용
+ 독자 입출력·확장 기능
+ 최종 iframe/p5.js 기능
```

기능 범위의 단일 기준은 [BlockNote 무료 기능 인벤토리](./blocknote-free-feature-inventory.md)다. 로드맵은 구현 순서만 결정한다.

## 2. 운영 원칙

- 모든 무료 기능을 최종 목표로 하되 단계적으로 출시한다.
- 내부 의존성은 기반 우선으로 만들고, 각 릴리스는 실제 사용 가능한 사용자 여정으로 끝낸다.
- 단계 완료는 기능 존재가 아니라 테스트와 round-trip 증거로 판정한다.
- 이후 단계의 기능을 위해 현재 단계를 추상화하지 않는다. 현재 공개 경계가 후속 확장을 막지 않는지만 확인한다.
- `xl-*` 기능은 이 로드맵에 추가하지 않는다.
- iframe/p5.js는 모든 parity와 파일 상호운용 단계 뒤인 마지막 R8에서 구현한다.

## 3. 단계

### R0 — 프로젝트 기반

**사용자 결과:** 소비자 앱이 빈 편집기를 생성하고 독자 문서를 안전하게 저장·교환할 수 있다.

범위:

- pnpm workspace와 Turborepo
- `model`, `io`, `core`, `react`, `demo` 패키지 경계
- 안정 ID가 있는 독자 JSON 문서 모델
- 명령 결과, 트랜잭션, revision과 undo/redo 기반
- 변경 블록과 변경 원인 이벤트
- HTML import/export와 sanitizer
- GFM import, strict/lossy export
- ESM, 타입 선언과 fixture 소비자 앱
- 라이선스 인벤토리와 CI

기능 ID:

`DOC-001`, `DOC-003`, `DOC-011`, `DOC-012`, `DOC-014`, `IO-001`~`IO-006`

완료 조건:

- `model`, `io`, `core`가 React 없이 import된다.
- 독자 JSON과 지원 HTML이 무손실 round-trip된다.
- GFM 손실이 구조화된 오류 또는 경고로 보고된다.
- 위험 HTML fixture가 실행 가능한 내용을 남기지 않는다.
- 빌드 결과를 별도 fixture 앱이 소비한다.

### R1 — 강화 테이블 중심 MVP

**사용자 결과:** 문단과 제목으로 문서를 작성하고, BlockNote와 유사한 조작감을 가진 안정적인 표를 편집하며 스프레드시트에서 붙여넣을 수 있다.

범위:

- 문단과 H1-H3
- 텍스트, 링크, 굵게, 기울임, 밑줄, 취소선, 인라인 코드
- 슬래시 메뉴, 블록 추가와 drag 재정렬
- 텍스트 selection toolbar와 link toolbar
- TableGrid와 전체 테이블 조작 계약
- Excel/Google Sheets HTML·TSV 붙여넣기
- 단일 표 10,000 논리 셀 성능 계약

기능 ID:

`BLK-001`, `BLK-002`, `BLK-012`, `INL-001`~`INL-007`, `UI-001`~`UI-003`, `UI-005`, `UI-007`, `UI-008`, `UI-014`, `TBL-001`~`TBL-014`

완료 조건:

- 모든 표 조작이 실제 pointer/keyboard 브라우저 테스트를 통과한다.
- 각 조작은 undo 한 번으로 정확히 원복된다.
- 열 너비, 병합, 헤더와 색상이 저장 후 복원된다.
- Excel과 Google Sheets fixture가 표 밖/안에서 계약대로 붙는다.
- Chromium, Firefox, WebKit에서 핵심 시나리오가 통과한다.

### R2 — 기본 블록 parity

**사용자 결과:** 일반적인 Notion형 문서를 BlockNote 무료 기본 블록 수준으로 작성할 수 있다.

범위:

- H4-H6와 토글 제목
- 인용문, 구분선과 코드 블록
- 글머리·번호·체크·토글 목록
- 중첩 블록과 들여쓰기
- 여러 블록 선택·이동·삭제
- 글자색, 배경색과 텍스트 정렬
- placeholder, trailing block
- 키보드 단축키와 입력 규칙
- 일반 파일·HTML·Markdown·plain text clipboard

기능 ID:

`DOC-002`, `BLK-003`~`BLK-011`, `INL-008`~`INL-011`, `UI-004`, `UI-006`, `UI-009`~`UI-011`, `IO-007`

완료 조건:

- 모든 기본 블록이 생성, 종류 변경, 중첩, 이동, 저장과 복원된다.
- 목록 번호·체크·토글 상태가 round-trip된다.
- 다중 선택 조작과 undo가 브라우저에서 검증된다.
- 일반 clipboard 우선순위와 fallback이 fixture로 고정된다.

`IO-007`의 파일 붙여넣기 부분은 R3로 이월되어 R2 완료 시점에 `PARTIAL`로 남는다(사용자 승인 완료 2026-08-27, Issue #38, spec §2.2). 위 4개 완료 조건과 별개로, §4의 이월 예외 조항에 따라 `IO-007`은 이 `PARTIAL` 상태로 R2 완료 판정에 포함된다.

### R3 — 파일·미디어 parity

**사용자 결과:** 이미지, 비디오, 오디오와 파일을 문서에 추가하고 관리할 수 있다.

범위:

- 파일, 이미지, 비디오와 오디오 블록
- URL 삽입과 소비자 제공 upload callback
- 파일 drag/drop과 paste
- 이름, caption, 교체, 삭제와 다운로드
- preview와 링크 표시 전환
- 이미지·비디오 크기 조절

기능 ID:

`BLK-013`~`BLK-016`, `MED-001`~`MED-008`

완료 조건:

- 업로드 성공·실패·취소가 구조화된 결과로 전달된다.
- 소비자 callback 외의 특정 파일 서버에 의존하지 않는다.
- media props가 JSON/HTML round-trip된다.
- resize, replace와 delete가 실제 브라우저에서 검증된다.

### R4 — 확장성과 제품 통합 parity

**사용자 결과:** 라이브러리 소비자가 자체 schema, UI, 번역과 서버 처리를 연결할 수 있다.

범위:

- 블록/인라인/style 사용자 정의 schema
- schema 확장과 처음부터 구성
- extension과 command 등록
- 사용자 정의 slash/suggestion menu
- formatting/link/side/table UI 교체
- CSS 변수, theme, DOM attribute와 style override
- i18n과 BlockNote v0.54.0 기본 locale 사전 전체
- emoji picker와 portal target
- BlockNote가 지원하는 mobile·touch UI
- 키보드 focus와 ARIA 접근성
- 읽기 전용 모드
- Next.js 등 SSR framework의 client-only 통합
- 블록·커서·선택·이벤트 공개 API
- 사용자 정의 paste handler
- 서버 측 parse/render

기능 ID:

`DOC-004`~`DOC-010`, `DOC-013`, `UI-012`, `UI-013`, `UI-015`, `UI-016`, `IO-008`, `IO-009`, `EXT-001`~`EXT-010`, `EXT-013`

완료 조건:

- 별도 fixture extension이 사용자 정의 block/inline/style을 등록한다.
- 소비자 UI가 기본 메뉴 중 하나를 교체해 동일 command를 실행한다.
- v0.54.0 기본 locale 전체와 사용자 번역 override가 검증된다.
- mobile viewport의 formatting·file resize 등 기준 동작을 touch 입력으로 검증한다.
- 핵심 menu와 editor flow를 keyboard-only 및 접근성 assertion으로 검증한다.
- Next.js fixture가 SSR 중 editor DOM을 평가하지 않고 client에서 정상 mount된다.
- server 환경에서 DOM 전역 없이 지원 변환을 수행한다.
- 공개 API에 Tiptap/ProseMirror 타입이 노출되지 않는다.

### R5 — 고급 무료 콘텐츠

**사용자 결과:** 코드, 다이어그램과 수식을 작성하고 preview 및 교환 포맷으로 내보낼 수 있다.

범위:

- 코드 구문 강조, 언어 선택과 tab 들여쓰기
- source-with-preview 확장 패턴
- Mermaid 다이어그램 블록
- LaTeX 수식 블록과 인라인 수식
- HTML/GFM 변환

기능 ID:

`BLK-017`~`BLK-019`, `INL-012`, `EXT-011`

완료 조건:

- source와 preview 전환이 편집 내용을 잃지 않는다.
- 잘못된 Mermaid/LaTeX 입력은 문서를 깨뜨리지 않고 오류 UI를 제공한다.
- 코드, Mermaid와 수식의 HTML/GFM 계약이 fixture로 고정된다.

### R6 — 공동 편집, 댓글과 버전 parity

**사용자 결과:** 여러 사용자가 같은 문서를 편집하고 댓글을 주고받으며 버전을 복원할 수 있다.

범위:

- Yjs 문서 어댑터와 원격 동기화
- 사용자 cursor와 selection presence
- 사용자 정보 resolver/cache
- comment thread, reply와 reaction
- 외부 ThreadStore와 권한 경계
- 버전 생성, 목록과 복원
- 테이블 구조 명령의 동시 편집 충돌 정책

기능 ID:

`COL-001`~`COL-009`

완료 조건:

- 두 개 이상의 브라우저 context에서 텍스트와 테이블 변경이 수렴한다.
- 병합·이동·삭제 충돌이 깨진 격자를 만들지 않는다.
- 권한 없는 comment 변경이 거부된다.
- 버전 복원이 독자 JSON과 CRDT 상태를 일관되게 만든다.

### R7 — 파일 기반 표 상호운용

**사용자 결과:** 편집한 표를 XLSX/CSV 파일과 교환할 수 있다.

범위:

- XLSX import/export
- 병합, 표시값, 지원 서식과 열 너비 보존
- CSV RFC 4180 import/export
- CSV의 병합·리치 텍스트·색상·너비 손실 경고
- import preview와 원자적 적용

기능 ID:

`IO-010`, `IO-011`

완료 조건:

- XLSX round-trip의 보존 속성이 명시적으로 검증된다.
- CSV의 구분자, 따옴표와 줄바꿈 셀이 round-trip된다.
- 손실형 export는 손실 위치와 종류를 반환한다.
- 10,000셀 제한과 취소가 문서를 부분 변경하지 않는다.

### R8 — iframe/p5.js 최종 확장

**사용자 결과:** 허용된 외부 페이지와 p5.js 작품을 문서 안에 안전하게 삽입하고 편집할 수 있다.

범위:

- 범용 iframe 블록
- allow-origin과 sandbox capability 정책
- p5.js 실행과 preview
- 크기 조절, loading과 error UI
- JSON/HTML 직렬화
- CSP, 메시지 통신과 브라우저 격리 테스트

기능 ID:

`CUS-001`~`CUS-005`

완료 조건:

- 허용되지 않은 origin과 capability가 실행되지 않는다.
- iframe 내용이 호스트 editor DOM과 권한을 획득하지 않는다.
- resize, reload, error recovery와 저장·복원이 검증된다.
- p5.js lifecycle이 block 이동·삭제·undo에서 자원을 남기지 않는다.

## 4. 릴리스 판정

각 단계는 다음 조건을 모두 만족해야 완료된다.

- 단계에 배정된 모든 기능 ID가 `VERIFIED`다. 단, 후속 단계로 이월이 사용자 승인되고 그 승인 근거(Issue 번호·일자)와 이월 조건이 해당 단계 절에 기록된 기능 ID는 `PARTIAL`로 완료 판정에 참여한다.
- 요구되는 unit, property, integration과 browser test가 통과한다.
- 독자 JSON round-trip이 통과한다.
- 관련 HTML/GFM 보존 또는 손실 계약이 통과한다.
- 공개 API와 패키지 의존 방향을 fixture 앱에서 검증한다.
- 새 런타임 의존성의 라이선스가 기록된다.
- 알려진 제한과 다음 단계 범위를 release note에 기록한다.

단계 일부만 구현된 배포는 가능하지만 해당 단계는 완료로 표시하지 않으며 기능 인벤토리의 개별 상태만 갱신한다.

## 5. 기준선 갱신

BlockNote 기준 버전을 올릴 때 다음 순서로 갱신한다.

1. MPL과 `xl-*` 패키지 경계를 다시 확인한다.
2. block, inline, style, UI, API와 collaboration 기능 차이를 수집한다.
3. 기존 기능의 의미 변경과 제거를 확인한다.
4. 새 기능을 `PARITY`, `ENHANCED`, `EXCLUDED` 중 하나로 결정한다.
5. 인벤토리에 ID를 추가하고 정확히 한 로드맵 단계에 배정한다.
6. 현재 구현과의 gap을 테스트 가능한 요구사항으로 기록한다.
