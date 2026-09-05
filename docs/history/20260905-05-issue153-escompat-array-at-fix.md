# 20260905-05 Issue #153 `extract-name-from-url.ts` escompat 수정

## 목표

`packages/react/src/extract-name-from-url.ts`의 `Array.prototype.at(-1)`(ES2022)이 `check:escompat` 게이트를 Chrome 75 미지원으로 실패시키던 문제를 고친다.

## 확정 커밋 해시

`b41af76` (fix/153-escompat-array-at → dev fast-forward)

## 바꾼 계약과 파일

- `packages/react/src/extract-name-from-url.ts:19` — `segments.at(-1)` → `segments[segments.length - 1]`. 공개 계약·타입 변경 없음, 순수 함수 내부 표현만 교체.
- 기존 관용구(`block-side-menu.tsx`, `table-handles.tsx`, `generic-block-commands.ts`)와 통일. Issue #122 결정(Chrome 75 polyfill을 core-js에 위임하지 않고 사용처 대체)에 부합.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-react test -- extract-name-from-url` — 33 files, 489 tests, 전부 PASS.
- `pnpm --filter @cp949/geul-react build` — 성공.
- `pnpm check:escompat` — 138개 파일 Chrome >= 75 기준 통과, 에러 없음.
- `grep -rn '\.at(' packages/react/src packages/core/src` — 빈 결과(이 파일 외 잔여 없음).
- 결함 탐지(읽기 전용 subagent): `segments.at(-1)`과 `segments[segments.length - 1]`은 `noUncheckedIndexedAccess: true` 아래 타입·edge case(빈 배열) 양쪽에서 동일 동작. 다른 ES2022+ API(`findLast`, `Object.hasOwn`, `toSorted` 등) 잔존 없음. 결함 없음.
- `pnpm verify` 전량 — exit 0 (E2E chromium 178 passed 포함).

## 남은 제한

없음. 이슈 본문이 "사실 확인 필요"로 남긴 R3 슬라이스2·3의 과거 `check:escompat`/`pnpm verify` 실행 여부 재확인은 제품 동작·게이트 구멍·거짓 통과에 해당하지 않아 별도 이슈로 등록하지 않았다(범위 밖으로 처리).

## 등록한 이슈 번호

없음(신규 이슈 없음). 대상 이슈 #153은 이 작업으로 종료.
