# Issue #38 슬라이스 5 RD-002 — 목록 구조 편집·표시 UX

## 목표

load된 글머리·번호 목록을 중첩·분할·결합하고 번호 marker와 placeholder를 production browser에서 표시한다.

## 확정 커밋

- `4855665` — 목록 Enter split·exit, Backspace/Delete join, Tab/Shift+Tab 중첩과 selection 원자성
- `a18488f` — 목록 marker·placeholder decoration, React CSS와 Chromium interaction

## 변경한 계약

- non-empty 목록 Enter는 같은 타입으로 split하고 신규 번호 항목에 `startNumber`를 복제하지 않는다. 빈 목록 Enter와 문서 최선두 목록 Backspace는 ID·children·깊이를 보존한 paragraph exit다.
- 목록 Backspace/Delete는 시각적 인접 text block join을 사용하고 제거 항목 children을 같은 위치에 승격한다.
- Tab/Shift+Tab은 table → CodeBlock → 일반 block 우선순위를 유지하며 기존 indent/outdent 경로로 목록을 중첩한다.
- core decoration은 각 `doc`/`blockGroup` 형제 scope에서 bullet, 명시 `startNumber`, 자동 연속 번호와 비목록 reset을 계산한다. React CSS는 marker와 빈 목록 `List item` placeholder를 표시한다. 파생 표시값은 저장 JSON에 남지 않는다.
- native DOM selection과 live ProseMirror selection 재동기화가 CellSelection/NodeSelection 연속 삭제와 표 선택 직후 목록 클릭 Enter/Tab을 보존한다.
- `BLK-007`, `BLK-008`, `UI-009`, `UI-011`은 후속 RD 범위 때문에 `PARTIAL`을 유지한다.

## 검증

- 트랙-5: 최종 체크리스트 F01~F18 `PASS`.
- 트랙-6: `PASS` — `BLOCKER 0 / MAJOR 0 / MINOR 0`.
- `pnpm verify`: unit 150 files / 1,853 tests, package boundary, license, Chromium E2E 106/106 포함 `PASS`.
- 재그룹화 경계: 첫 그룹 4 files / 81 tests와 core typecheck, 둘째 그룹 core 5/5·React style 12/12와 core·React typecheck `PASS`.
- 재그룹화 전후 트리 diff와 `git diff --check`: `PASS`.

## 상태와 남은 위험

- RD-002는 `DONE`. RD-003·RD-004는 모두 `READY`다.
- 다음 작업은 RD-004 목록 생성·변환 UX다. `setBlockType`, descriptor, `- `·`1. ` input rule, Slash·Turn into를 연결한다.
- RD-003에 HTML/GFM import·warning·중첩 round-trip이 남았다.
- 체크·토글 목록과 후속 keyboard parity는 Issue #38의 다음 슬라이스 범위다.
- 트랙-5·6이 완료 조건과 횡단 회귀를 검토했고 열린 `BLOCKER`·`MAJOR`·`MINOR`는 없다.

## GitHub

- Issue #38 완료 댓글: `#issuecomment-5466785678`
- Issue #38은 RD-003·RD-004와 후속 R2 슬라이스가 남아 `OPEN` 유지.
- 신규 이슈·가이드·pitfall 등록 없음.
