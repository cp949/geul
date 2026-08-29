# Issue #129 — 중첩 블록 split/join 계약 영속화

- 일자: 2026-08-29
- 레인: qq-workflow
- 확정 커밋: `3a6bba5` (`docs(spec): 중첩 블록 split join 계약을 기록한다`)
- 종료 이슈: #129

## 목표

슬라이스 1 실측으로 확정된 중첩 블록 Enter split과 Backspace/Delete join 계약을 R2 spec의 장기 기술 계약으로 기록했다.

## 바꾼 계약과 파일

- `docs/specs/2026-08-19-r2-basic-block-parity-design.md`: 커스텀 `blockContainer` split, 스키마 유효성, 원본 ID·기존 자식 귀속 보존, append transaction 신규 `blockId`, 결정적 캐럿과 undo 계약을 추가했다.
- 자식 없는 블록은 다음 형제, 기존 자식이 있는 블록은 기존 자식 앞의 첫 자식으로 분할한다. 보편적 첫-자식 규칙과 반증된 StarterKit 기본 split 전제는 현재 계약에 포함하지 않았다.
- Backspace/Delete의 시각적 인접 병합, 제거 블록 자식 승격, divider/table 선택·삭제 경계를 추가했다.
- 표 셀에서는 일반 블록 split/join이 관여하지 않고 table keyboard와 `tableEditing`이 키별 동작을 소유함을 명시했다.
- 제품 코드와 테스트는 변경하지 않았다.

## 리뷰와 검증

- 독립 리뷰에서 append transaction 경계 오기 1건(MAJOR)과 빈 블록 split 판정 모호성 1건(MINOR)을 발견해 수정했다. 재검토 결과 미해결 `BLOCKER`·`MAJOR`·`MINOR` 0건이다.
- focused core: 4 files, 79/79 통과. 최초 구현, 리뷰 수정, 재그룹화 후 각각 확인했다.
- `pnpm verify`: lint, format, build, ES compatibility, typecheck, unit 124 files / 1,513 tests, package boundaries, licenses, Chromium E2E 90/90 통과.
- `git diff --check` 통과. 재그룹화 전후 tree diff 없음.

## 남은 제한

미충족 완료 기준과 범위 밖 후속 작업 없음.

## 이슈 등록과 종료

- Issue #129에 완료 댓글을 등록했다(`issuecomment-5460187695`).
- 열린 sub-issue와 미등록 초안이 없고 완료 기준을 모두 충족해 Issue #129를 종료했다.
