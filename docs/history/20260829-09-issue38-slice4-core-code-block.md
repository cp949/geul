# Issue #38 슬라이스 4 Workflow A — 코드 블록 저장과 production 경계

- 일자: 2026-08-30
- 레인: ff-workflow
- 확정 커밋: `a5945ba` (`docs(workflow): DELTA diff 상한을 3000줄로 완화`), `8bbf692` (`feat: 코드 블록 저장과 production 경계 연결`)
- 종료 이슈: 없음

## 목표

슬라이스 4 Workflow A로 CodeBlock 저장 계약, ProseMirror schema·codec, core production load/save와 일반 명령 경계를 완성했다. Workflow B가 편집·React 통합을 이어받을 수 있는 기반을 제공한다.

## 바꾼 계약과 파일

- `model`: `packages/model/src/code-block.ts`, `schema.ts`, `types.ts`, `index.ts`에 안정 ID, plain-text `source`, optional `language`를 가진 leaf `CodeBlock`과 validation/canonicalization을 추가했다.
- `core`: `code-block-extension.ts`, model↔PM codec, production assembly/session, 일반 블록 명령, selection·keyboard·join guard와 중첩 경계를 연결했다.
- `io`: HTML/GFM export와 Markdown loss exhaustiveness를 추가했다. GFM language entity를 exact 보존하며 Chrome 75에서 지원되는 정규식 전역 치환을 사용한다.
- `react`: CodeBlock selection descriptor가 block conversion command 입력을 넓히지 않도록 command 입력 타입을 분리했다.
- `docs`: R2 CodeBlock 계약과 ff-workflow DELTA diff 상한을 정정하고 `BLK-011`을 `PARTIAL`로 동기화했다.
- 외부 런타임 의존성 변경과 테스트 삭제는 없다.

## 리뷰와 검증

- 트랙-5 체크리스트 R01~R21 전부 `PASS`.
- 트랙-6은 model Prettier 위반과 Chrome 75 미지원 `String.prototype.replaceAll`을 발견해 수정했다. 최종 판정은 `BLOCKER 0 / MAJOR 0 / MINOR 0`이다.
- 트랙-6 최종 `pnpm verify`: lint, format, build, escompat, typecheck, unit 134 files / 1,649 tests, package boundary, license, Chromium E2E 90/90 통과.
- 재그룹화 후 원본 tip 대비 tree diff 0. 문서 그룹 root typecheck, 최종 그룹 build·model 235/235·core focused 70/70·io focused 6/6·react focused 5/5·root typecheck를 통과했다.

## 남은 제한

- Workflow B/RD-004: 생성·종류 변경, mark guard, `Code` placeholder, language UI, CodeBlock keyboard와 React/Chromium 통합.
- RD-003: HTML/GFM import, metadata warning과 완전 round-trip.
- Issue #38의 후속 슬라이스가 남아 있어 이슈를 닫지 않았다.

## 이슈 등록과 종료

- Issue #38에 Workflow A 완료 댓글을 등록했다(`issuecomment-5463879204`).
- Issue #38은 완료 기준이 남아 있어 열린 상태를 유지한다.
