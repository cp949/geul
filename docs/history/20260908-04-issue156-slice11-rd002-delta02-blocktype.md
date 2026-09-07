# Issue #156 슬라이스11 RD-002 DELTA-02 — blockType.* 네임스페이스 + 소비 3곳 배선

## 목표

`block-type-options.ts`의 `BLOCK_TYPE_OPTIONS`(19항목, label·description 38건)를 `Dictionary.blockType`으로 추출하고, 이를 소비하는 3곳(slash-menu 팝업, formatting-toolbar "Block type" select, block-side-menu-menu "Turn into" 목록)에서 override가 실제로 렌더되게 배선한다.

## 확정 커밋

- `a695f05` — feat(core,react): blockType.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.blockType` 네임스페이스 추가(19개 key, 각 `{label, description}`). key는 `BLOCK_TYPE_OPTIONS`의 기존 `id` 문자열을 그대로 quoted key로 쓴다(`"heading-1"` 등). `DEFAULT_DICTIONARY.blockType`에 현재 하드코딩 값 19쌍을 채움(회귀 없음).
- `packages/react/src/block-type-options.ts` — `blockTypeText(dictionary, id): { label; description }` 헬퍼 export. `BLOCK_TYPE_OPTIONS` 자체의 `label`/`description`은 검색 매칭(`matchesQuery`)용으로 그대로 둔다(아래 "결정").
- `packages/react/src/slash-menu.tsx` — `useDictionary()` 추가, `item.kind === "blockType"`이면 `blockTypeText(dictionary, item.id)`로 렌더 텍스트를 바꾼다. 검색(`matchesQuery`)은 건드리지 않는다.
- `packages/react/src/formatting-toolbar.tsx` — "Block type" `<option>` 텍스트를 `blockTypeText(dictionary, option.id).label`로 치환.
- `packages/react/src/block-side-menu-menu.tsx` — "Turn into" 목록 항목 텍스트를 `blockTypeText(dictionary, option.id).label`로 치환.
- `packages/react/test/mount-editor.tsx` — `MountBlockEditorOptions`/`MountTableEditorOptions`에 `dictionary?: CreateEditorOptions["dictionary"]` 조건부 스프레드 추가(이후 DELTA-03~10 테스트 전부가 재사용하는 공용 확장).
- `packages/react/test/formatting-toolbar-test-support.tsx` — `getDictionary` fake 추가.
- `packages/react/test/{block-side-menu,formatting-toolbar,slash-menu/popup,slash-menu/slash-menu-test-support}` 테스트 — override 검증 4건 신규 + 기존 `editor-provider-extensibility.test.tsx` dictionary 리터럴 케이스를 `...DEFAULT_DICTIONARY` 스프레드로 견고화(DELTA-01이 남긴 기술 부채 정리, 향후 네임스페이스 추가마다 매번 깨지는 것을 방지).

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 579 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean.

## RD-002 진행 상태

DELTA-02 완료. `Dictionary`에 `blockType`(19항목 38건) 네임스페이스와 소비 3곳 배선이 추가됨. 남은 것은 DELTA-03~10(slashMenu/menu/color/toolbar×2/handle/codeLanguage/error·status).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- `BLOCK_TYPE_OPTIONS`(react)와 `DEFAULT_DICTIONARY.blockType`(core) 사이에 문구 중복이 생겼다 — 향후 기본 영어 문구를 바꾸면 두 곳을 함께 고쳐야 한다(RD-002.md "결정"에 이미 기록).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert a695f05`. 위험: 낮음 — 신규 네임스페이스 추가와 3개 소비처의 렌더 텍스트 치환뿐, 검색·필터 로직은 그대로다. 다만 DELTA-03이 이 DELTA의 `blockTypeText` 헬퍼를 `slashMenuItemText`로 통합하므로, 단독 revert 시 이후 커밋과 충돌할 수 있다(체인을 최신 커밋부터 역순으로 revert해야 안전).
