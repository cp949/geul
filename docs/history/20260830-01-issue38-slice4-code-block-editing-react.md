# Issue #38 슬라이스 4 RD-004 — CodeBlock 편집·React 통합

## 목표

Workflow A가 연결한 CodeBlock 저장·core 경계 위에 생성·종류 변경·mark guard·keyboard·placeholder·language UI·React/Chromium 통합을 완성한다.

## 확정 커밋

- `c046532` — 코드 블록 종류 변경 테스트 seam 분리
- `5351f52` — CodeBlock 종류·language 변경
- `f4469b4` — CodeBlock mark/link command·DOM shortcut guard
- `501e936` — CodeBlock Tab·Shift+Tab·placeholder
- `2f05311` — React Code option·plain style
- `9824226` — editable language combobox
- `c3aa995` — Chromium React 통합·제품 상태 문서
- `5084351` — overlay anchor·viewport·stacking·E2E race 수정

## 변경 계약과 파일

- core: `setBlockType` CodeBlock 양방향 변환·language setter, `CODE_BLOCK_MARK_NOT_ALLOWED`, DOM mark shortcut no-op, table → CodeBlock → 일반 block Tab 라우팅, `Code` placeholder.
- React: Slash·Turn into·Formatting Code option, plain Code CSS, 12개 language·alias combobox, Enter/click commit, Escape/outside cancel, ARIA·IME·focus·scroll/resize clamp.
- Chromium: `e2e/code-block.spec.ts` 9건과 Slash/Block menu clamp 회귀.
- 문서: `BLK-011=PARTIAL` 유지, `BLK-017`·`UI-009`·`UI-011=PARTIAL`, RD-004 완료 → RD-003 다음.
- 가이드: `G-UI-001`에 fixed overlay anchor scroll/resize 재측정·좁은 viewport 폭 제한, `G-TST-001`에 geometry polling 검증을 보강했다.

## 검증

- 누락 탐지: 구현 누락 0건.
- 결함 탐지: MAJOR 5건을 RED→GREEN으로 수정한 후 세 reviewer 렌즈 CLEAN.
- `pnpm verify`: lint·format·build·Chrome 75 escompat·typecheck·unit 137 files/1,737 tests·package boundaries·licenses·Chromium 99/99 PASS.
- language Escape 20/20, viewport geometry 20/20·10/10 PASS.
- 재그룹화 전후 트리 diff 없음. 8개 그룹 경계 typecheck PASS.

## 남은 제한

- RD-003 HTML/GFM import·metadata warning·완전 round-trip 전이므로 `BLK-011`은 `PARTIAL`이다.
- syntax highlighting은 `BLK-017` R5, Firefox·WebKit 전체 gate는 후속 범위다.
- Issue #38은 댓글 `5464615627`을 게시했고 OPEN을 유지했다. 다음 작업은 RD-003이다.
