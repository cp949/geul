# Issue #137 — WebKit 서식 툴바 키보드 활성화 복구

- 일자: 2026-08-29
- 레인: qq-workflow (자동 선택 — React toolbar와 E2E 1개 파일의 단일 DELTA)
- 확정 커밋: `7cf2cdc` (`fix(react): WebKit 키보드 mark 적용 시 선택을 유지한다`)
- 종료 이슈: #137

## 목표

WebKit에서 실제 `Shift+Tab`으로 서식 툴바의 Bold 버튼에 도달하고 `Enter`로 활성화한 뒤에도 텍스트 선택과 툴바를 유지하며 같은 선택에 다른 mark를 연속 적용한다.

## 바꾼 계약과 파일

- `packages/react/src/formatting-toolbar.tsx`: 툴바가 자기 editor의 유효한 DOM Range를 추적하고 keyboard 합성 click(`event.detail === 0`) 직전에만 복원한다. Range 양 끝점이 현재 editor DOM에 남은 경우만 적용하며 pointer click, core command와 공개 API는 변경하지 않았다.
- `e2e/formatting-toolbar.spec.ts`: 기존 전체 keyboard 토글 시나리오를 `@core` 3엔진 게이트로 전환했다. Bold 적용 뒤 toolbar·`aria-pressed` 유지와 실제 `Shift+Tab` → Underline → `Enter` 연속 적용을 검증한다. 같은 helper 호출만 하던 도달 전용 진부분집합 테스트는 통합했고 `toBeFocused()` 단언은 helper에 유지했다.
- browser sniffing과 신규 의존성 없음. React unit test는 변경하지 않았다 — keyboard click 뒤 WebKit selection 동작은 ADR-0007에 따라 브라우저가 가장 낮은 증명 계층이다.

## 실행한 검증과 결과

- RED: WebKit에서 `<strong>Hello R1</strong>` 적용 뒤 Bold locator가 사라져 `toHaveAttribute("aria-pressed", "true")`가 `element(s) not found`로 실패했다.
- GREEN focused: Chromium·Firefox·WebKit keyboard/pointer E2E 6/6, React 27 files / 263 tests, React 복합 typecheck 통과.
- 독립 결함 탐지: `BLOCKER` 0, `MAJOR` 0, `MINOR` 0. WebKit 반복 실행과 `git diff --check` 통과.
- 최초 `pnpm verify`: Prettier 불일치 1건으로 실패. 대상 E2E 파일만 포맷한 뒤 재실행했다.
- 최종 `pnpm verify`: lint, format, build, ES compatibility, typecheck, unit 123 files / 1,482 tests, package boundaries, licenses, Chromium E2E 89/89 통과.
- 재그룹화 전후 tree diff 없음. 재그룹화 경계 React typecheck와 3엔진 focused E2E 6/6 통과.

## 남은 제한

- 미충족 완료 기준과 범위 밖 후속 작업 없음.
- stale Range는 현재 editor DOM 포함 여부로 제한한다. 지원 사용자 경로는 3엔진 실제 keyboard 입력 테스트가 고정한다.

## 이슈 등록과 종료

- Issue #137에 완료 댓글을 등록했다(`issuecomment-5459379281`).
- 열린 sub-issue와 미등록 초안이 없고 완료 기준을 모두 충족해 Issue #137을 종료했다.
