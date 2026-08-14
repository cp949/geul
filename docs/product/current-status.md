# Current project status

## 현재 단계

- 마지막 완료 단계: R0 — 프로젝트 기반
- 다음 진행 단계: R1 — 강화 테이블 중심 MVP
- R1 실행 상태: 구현 계획 Issue 미작성, phase 구현 미시작

R0에서 문단, H1-H3와 지원 인라인 mark의 기본 편집은 구현됐다. 따라서 `BLK-001`, `BLK-002`는 `PARTIAL`이다. R1의 Notion형 block UI, 메뉴, drag interaction과 전체 table 편집 계약은 아직 완료되지 않았다.

기능별 정확한 상태는 `docs/product/blocknote-free-feature-inventory.md`, R1 범위와 완료 조건은 `docs/product/roadmap.md`를 기준으로 한다.

## 바로 다음 작업

R1 코드를 바로 구현하지 않는다.

다음 문서를 입력으로 R1을 실행 가능한 vertical slice와 의존 순서로 분해한 구현 계획을 GitHub Issue에 작성하고 사용자 승인을 받는다.

1. `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md`
2. `docs/product/roadmap.md`의 R1 범위와 완료 조건
3. `docs/product/blocknote-free-feature-inventory.md`의 R1 기능 ID와 상태
4. 현재 `model`, `io`, `core`, `react`, `demo` 코드와 테스트

Issue에는 목표, 포함·제외 범위, vertical slice별 구현 순서, 완료 기준과 검증 명령을 기록한다. 계획 승인 전에는 R1 구현 파일을 변경하지 않는다.

## R1 계획에서 확정할 사항

1. 사용자 여정 기준 vertical slice와 구현 순서
2. table model, core command와 React UI의 책임 경계
3. R0의 `EDITOR_FEATURE_UNAVAILABLE` table 거절을 해제하는 정확한 시점
4. slash menu, block 추가·drag·메뉴 interaction의 선행 조건
5. table 조작별 undo, 저장 round-trip과 pointer/keyboard browser 검증
6. Excel/Google Sheets HTML·TSV paste와 10,000-cell 성능 검증 순서
7. Chromium, Firefox, WebKit 검증을 도입하는 시점

## 운영 경계

- 현재 문서는 다음 제품 작업의 진입점을 지정하며 구현 계획을 대신하지 않는다.
- 새 branch 또는 worktree 생성은 승인된 계획이나 사용자 요청이 있을 때만 수행한다.
- commit, merge, push, publish와 PR 생성은 각각 별도 요청이 필요하다.
- 프로젝트 자체 배포 라이선스 결정은 공개 배포 전 [GitHub Issue #2](https://github.com/cp949/geul/issues/2)에서 수행한다.
