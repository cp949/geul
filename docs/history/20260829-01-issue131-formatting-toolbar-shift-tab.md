# Issue #131 — Shift+Tab 서식 툴바 접근 복구

## 목표

최상위 블록에서 적용할 수 없는 `Shift+Tab`이 브라우저 기본 순차 포커스로 이어져 서식 툴바의 Bold 버튼에 키보드만으로 도달하게 한다.

## 확정 커밋

- `5eebe36` — core shortcut 반환 계약과 R2 spec 갱신
- `d75acf7` — Shift+Tab 포커스 효과의 Chromium·Firefox·WebKit 검증

## 변경한 계약과 파일

- `docs/specs/2026-08-19-r2-basic-block-parity-design.md`: 표 밖 `Tab`/`Shift+Tab`은 `indentBlock`/`outdentBlock` 성공 시에만 소비하고, 적용 불가면 브라우저 기본 순차 포커스 이동을 허용한다.
- `packages/core/src/indent-keyboard-extension.ts`: `routeToBlockCommand`가 command 결과의 `.ok`를 반환한다.
- `packages/core/test/indent-keyboard-extension.test.ts`: 적용 불가 shortcut의 `false` 반환과 문서 무변경을 고정한다.
- `e2e/formatting-toolbar.spec.ts`: 실제 Shift+Tab으로 Bold에 도달하는 `@core` 시나리오를 3엔진에서 검증하고, 기존 Chromium Enter 토글·`aria-pressed` 단언은 유지한다.

## 검증

- RED: core focused 7건 중 적용 불가 반환 계약 1건 실패 — `expected true to be false`.
- GREEN: core focused 7/7, core 전체 33 files / 539 tests, core typecheck.
- focused E2E: Chromium 기존 토글 1/1, Chromium·Firefox·WebKit 포커스 도달 3/3.
- `pnpm verify`: lint, format, build, ES compatibility, typecheck, unit 106 files / 1,340 tests, package boundaries, licenses, Chromium E2E 88/88 통과.
- 재그룹화 경계: core focused+typecheck, E2E typecheck+3엔진 focused 통과. 재그룹화 전후 tree diff 없음.

## 남은 제한

- WebKit에서 Bold 버튼을 Enter로 활성화하면 굵게 적용은 성공하지만 툴바가 사라지는 별도 결함이 남는다. Issue #137로 등록했다.

## 이슈 등록과 종료

- Issue #131에 완료 댓글을 등록하고 종료했다.
- 후속 Issue #137을 등록했다.
