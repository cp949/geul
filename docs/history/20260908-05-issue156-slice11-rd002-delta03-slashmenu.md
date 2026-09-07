# Issue #156 슬라이스11 RD-002 DELTA-03 — slashMenu.* 네임스페이스

## 목표

`slash-menu.tsx`의 슬래시 메뉴 자체 문구(컨테이너 aria-label "Slash menu", 빈 상태 "No matches", 삽입 전용 6항목 Table/Divider/File/Image/Video/Audio의 label·description 12건 — 합 14건)를 `Dictionary.slashMenu`로 추출하고 렌더에 배선한다. `BLOCK_TYPE_OPTIONS`(`blockType.*`, DELTA-02에서 이미 완료)는 이 DELTA의 대상이 아니다.

## 확정 커밋

- `4ce8a15` — feat(core,react): slashMenu.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.slashMenu` 네임스페이스 추가: `ariaLabel`, `noMatches`, `table`/`divider`/`file`/`image`/`video`/`audio`(각 `{label, description}`). `file`/`image`/`video`/`audio` key는 `MediaBlockKind` 리터럴과 정확히 일치시켜 `item.mediaKind`로 직접 인덱싱 가능하게 했다. `DEFAULT_DICTIONARY.slashMenu`에 현재 하드코딩 값 채움(회귀 없음).
- `packages/react/src/slash-menu.tsx` — 모듈 상수(`TABLE_SLASH_ITEM` 등)의 `label`/`description`은 검색 매칭 전용으로 그대로 둔다. 새 헬퍼 `slashMenuItemText(dictionary, item)`을 추가해 `item.kind`별 분기(`blockType`→`blockTypeText`, `insertTable`→`dictionary.slashMenu.table`, `insertDivider`→`.divider`, `insertMedia`→`dictionary.slashMenu[item.mediaKind]`, `custom`→`item.label`/`item.description` 그대로)를 통합 — DELTA-02가 남긴 인라인 3항 분기를 이 헬퍼로 정리했다. 컨테이너 `aria-label`과 "No matches"도 dictionary로 치환.
- `packages/react/test/slash-menu/popup.test.tsx` — 컨테이너 aria-label·No matches·Table 항목을 동시에 확인하는 override 검증 1건 추가.

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 580 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean. 기존 DELTA-02 override 테스트가 `slashMenuItemText` 통합 리팩터링 이후에도 그대로 통과해 안전성을 확인했다.

## RD-002 진행 상태

DELTA-03 완료. `Dictionary`에 `slashMenu`(14건) 네임스페이스 추가. 남은 것은 DELTA-04~10(menu/color/toolbar×2/handle/codeLanguage/error·status).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- `slash-menu.tsx` 모듈 상수(`TABLE_SLASH_ITEM` 등)와 `DEFAULT_DICTIONARY.slashMenu` 사이 문구 중복은 DELTA-02와 동일한 이미 알려진 트레이드오프다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 4ce8a15`. 위험: 낮음 — `slash-menu.tsx` 렌더 헬퍼 통합과 신규 네임스페이스 추가뿐, 검색·필터 로직은 그대로다. 다만 이후 DELTA가 같은 파일(`dictionary.ts`)을 계속 확장하므로 체인 최신 커밋부터 역순으로 revert해야 충돌이 없다.
