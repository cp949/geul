# Issue #156 슬라이스11 RD-002 DELTA-10 — error.*·status.* 네임스페이스 (RD-002 마지막 DELTA)

## 목표

`table-command-error-messages.ts`(표 명령 실패 7건)와 업로드·URL 검증 상태 문구 4건("Uploading…"/"Upload could not start." — media-toolbar.tsx·file-panel.tsx 공유, "Unsupported link URL" — link-toolbar.tsx, "Unsupported media URL" — file-panel.tsx)을 추출한다. 이것으로 RD-002(react 문구 추출)가 완료된다.

## 확정 커밋

- `f838aa9` — feat(core,react): error.*/status.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.error`(7개: lastRow/lastColumn/cellNotFound/invalidColor/invalidAlign/notRectangular/actionFailed)와 `Dictionary.status`(4개: uploading/uploadCouldNotStart/unsupportedLinkUrl/unsupportedMediaUrl) 신설.
- `packages/react/src/table-command-error-messages.ts` — `tableCommandErrorMessage`가 순수 함수(컴포넌트 아님, 훅 사용 불가)라 시그니처에 `dictionary: Dictionary` 매개변수를 추가. 내부 `ERROR_MESSAGES`/`FALLBACK_ERROR_MESSAGE`의 `Record` 조회를 `switch`로 교체.
- `packages/react/src/{table-handle-menu,table-cell-format-menu,table-selection-toolbar}.tsx` — 호출부 3곳, 이미 `useDictionary()` 보유(DELTA-04/07)하므로 호출에 `dictionary` 인자만 추가.
- `packages/react/src/media-toolbar.tsx`/`file-panel.tsx` — "Uploading…"/"Upload could not start." 완전 중복 리터럴을 `dictionary.status.*`로 통합(이미 `useDictionary()` 보유, DELTA-06). `file-panel.tsx`는 "Unsupported media URL"도 함께.
- `packages/react/src/link-toolbar.tsx` — "Unsupported link URL" → `dictionary.status.unsupportedLinkUrl`(이미 `useDictionary()` 보유, DELTA-07).
- `packages/react/test/{file-panel,link-toolbar,media-toolbar,table-cell-format-menu}.test.tsx` — 5개 소비처 override 검증(공유 함수 재사용 확인 포함).

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 601 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean. 리뷰 중 `media-toolbar.tsx`/`file-panel.tsx`의 `startReplaceUpload`/`startUpload`(`useCallback`)가 `dictionary.status.uploadCouldNotStart`를 참조하게 되면서 `react-hooks/exhaustive-deps` 경고 2건이 발생 — 두 콜백의 의존성 배열에 `dictionary` 추가로 해결(값 자체는 마운트 시점 고정이라 동작 변화 없음).

## RD-002 진행 상태

DELTA-10 완료로 **RD-002 전체 완료** — 9개 네임스페이스(placeholder는 RD-001, editor/blockType/slashMenu/menu/color/toolbar/handle/codeLanguage/error/status는 RD-002) 전량 배선, react 구조적 하드코딩 문구 214건(emoji-picker-options.ts 564건·언어 고유명사 11종 제외, 승인된 이월)이 key 추출·override 검증됨. RD-001 `DONE`, RD-002 `DONE`. 다음은 RD-003(en/ko 번역 완성) readiness probe.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서에 별도 기재된 남은 위험 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert f838aa9`. 위험: 중간 — `tableCommandErrorMessage`의 `Record` 조회를 `switch`로 바꾸는 리팩터링과 8개 파일에 걸친 다중 소비처 변경이 한 커밋에 있다. 체인 최신 커밋(RD-003-DELTA-01)이 이 커밋의 `error`/`status` 네임스페이스에 대응하는 ko 번역을 포함하므로, 단독 revert 시 `dictionary-ko.ts`의 타입 검사가 깨진다 — 역순으로 먼저 revert해야 한다.
