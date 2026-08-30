# Issue #38 슬라이스 5 RD-001 — 목록 저장 기반

## 목표

글머리·번호 목록을 검증된 독자 저장 타입과 production editor load/save 경로에 연결하고, 현재 공용 명령과 flat HTML/GFM outbound가 목록 값을 보존하게 한다.

## 확정 커밋

- `fd8a7fe` — 목록 저장 타입, PM schema·codec, production load/save, HTML/GFM outbound
- `d4aeb01` — 목록 공용 명령과 무효 inline text 원자성 보장

## 변경한 계약

- `BulletListItemBlock`, `NumberedListItemBlock`을 공개 `Block` union에 추가했다. 명시적 `startNumber`는 정수 `0..999999999`다.
- 목록에 strict shape, 안정 ID, inline content/mark, 재귀 `children`, 깊이 64와 공통 canonicalization·validation 계약을 적용했다.
- core에 자체 `bulletListItem`/`numberedListItem` PM node를 등록하고 model↔PM codec과 production `createEditor`·`replaceDocument`·`getDocument`에 연결했다.
- `setText`, delete, duplicate, move-before, insert-after, indent/outdent의 기존 지원 범위에서 목록 값·selection·revision·event·undo 원자성을 보존했다. 무효 inline text는 dispatch 전 `COMMAND_NOT_APPLICABLE`로 거절한다.
- HTML outbound는 연속 flat 목록을 `<ul>/<ol>/<li>`로 묶고 `ol start`를 보존한다. GFM outbound는 9자리 상한 뒤 marker 오파싱 없이 시작값·항목 수 의미를 보존한다.
- `BLK-007`, `BLK-008`은 `PARTIAL`로 바뀌었다.

## 검증

- 트랙-5 R01~R14: 전부 `PASS`.
- 트랙-6: `PASS` — `BLOCKER 0 / MAJOR 0 / MINOR 0`.
- `pnpm verify`: unit 147 files / 1,802 tests, package boundary, license, Chromium E2E 99/99 포함 `PASS`.
- 재그룹화 경계: 첫 그룹 model/core/io typecheck, 둘째 그룹 core typecheck `PASS`.
- 재그룹화 전후 트리 diff와 `git diff --check`: `PASS`.

## 상태와 남은 위험

- RD-001은 `DONE`. RD-002·RD-003 readiness probe는 둘 다 `READY`.
- RD-002에 입력 규칙, Slash·Turn into, placeholder, split/join, 번호 표시, selection descriptor와 React UX가 남았다.
- RD-003에 HTML/GFM import·warning·중첩 `children`·strict export/re-import round-trip이 남았다.
- Issue #125가 자식을 가진 블록 복제와 부모를 넘는 이동을 소유한다.
- 트랙-5·6이 공개 저장 계약, production 원자성, package 경계와 후속 RD 범위를 검토했고 열린 `BLOCKER`·`MAJOR`·`MINOR`는 없다.

## GitHub

- Issue #38 완료 댓글: `#issuecomment-5466059959`
- Issue #38은 RD-002·RD-003과 후속 R2 슬라이스가 남아 `OPEN` 유지.
- 신규 이슈·가이드·pitfall 등록 없음.
