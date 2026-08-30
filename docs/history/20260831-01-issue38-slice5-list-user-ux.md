# Issue #38 슬라이스 5 RD-005 — React 목록 생성·변환 UX

## 목표

사용자가 Slash·Turn into·formatting toolbar로 글머리·번호 목록을 생성·변환한다.

## 확정 커밋

- `f862b42` — 목록 block type output descriptor 공개
- `82303fc` — 목록 공용 option과 Slash 생성 연결
- `ed96083` — Turn into·formatting toolbar 목록 변환 연결
- `feddc3c` — overlay·Chromium 회귀 검증

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts`, `fixtures/consumer/src/index.ts`: public `BlockTypeDescriptor`가 `bulletListItem`·`numberedListItem`과 optional `startNumber`를 PM/Tiptap type 노출 없이 보고한다. PM `null`은 생략하고 `0`과 명시 값은 보존한다.
- `packages/react/src/block-type-options.ts`, `slash-menu.tsx`, `block-side-menu.tsx`, `formatting-toolbar.tsx`: 목록 공용 option·Code/list 문맥 filter를 세 UI 표면이 공유한다. Slash는 `clearContent: true`로 생성하고 Turn into·toolbar는 content를 보존한다.
- `packages/react/src/slash-menu.tsx`, `block-side-menu.tsx`, `_formatting-toolbar.scss`: overlay가 scroll·resize에서 anchor를 재측정하고 outside·Escape dismiss와 좁은 viewport 크램프를 유지한다.
- core·React·consumer·E2E 회귀 테스트를 17파일에서 추가·보강했다. 신규 런타임 의존성과 저장 형식 변경은 없다.
- `docs/product/current-status.md`: RD-005 `DONE`, RD-003·RD-006 `READY`, RD-006 다음 후보를 동기화했다.

## 검증

- 트랙-5: R01~R10 `PASS`.
- 트랙-6: `PASS` — `BLOCKER 0 / MAJOR 1 / MINOR 1`. MAJOR는 cleanup 회귀 테스트로 수정했다.
- 트랙-6 최종 `pnpm verify`: unit 152 files / 1,933 tests, package boundary, license, Chromium 112/112 포함 `PASS`.
- 재그룹화 경계 1: core 5/5, React 6/6, core·React typecheck, build, consumer typecheck, package boundary, `git diff --check` `PASS`.
- 재그룹화 경계 2: React 47/47, React typecheck, `git diff --check` `PASS`.
- 재그룹화 경계 3: React 58/58, React typecheck, `git diff --check` `PASS`.
- 재그룹화 경계 4: React 61/61, React typecheck, build, E2E typecheck, Chromium 112/112, `git diff --check` `PASS`.
- 재그룹화 전후 tree diff: 빈 출력.

## 상태와 남은 위험

- RD-005는 `DONE`. RD-003·RD-006은 `READY`다. 다음 후보는 RD-006이다.
- RD-003에 HTML/GFM import·중첩 round-trip, RD-006에 exact `- `·`1. ` native shorthand가 남았다.
- Firefox·WebKit은 기본 `pnpm verify` 범위 밖이라 실행하지 않았다.
- rollback: `dev`에서 완료 문서 커밋과 `feddc3c`, `ed96083`, `82303fc`, `f862b42`를 역순으로 `git revert`한다.

## GitHub

- Issue #38 완료 댓글: `#issuecomment-5469483696`
- Issue #140: 목록 block type test support cleanup 실패 집계
- Issue #141: 열린 Turn into 메뉴의 외부 block type 변경 동기화
- Issue #38은 RD-003·RD-006과 후속 R2 슬라이스가 남아 `OPEN` 유지.
