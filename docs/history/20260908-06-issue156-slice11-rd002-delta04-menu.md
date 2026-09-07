# Issue #156 슬라이스11 RD-002 DELTA-04 — menu.* 네임스페이스(block-side-menu-menu·table-handle-menu·table-cell-format-menu)

## 목표

3개 팝업 메뉴(`block-side-menu-menu.tsx`, `table-handle-menu.tsx`, `table-cell-format-menu.tsx`)의 색상 관련이 아닌 문구(컨테이너 aria-label, 섹션 제목, 항목 텍스트, 정렬 버튼)를 `Dictionary.menu`로 추출한다. 색상 이름·"Text color"/"Background color" property 라벨은 `color.*`(DELTA-05) 소관이라 이 DELTA는 건드리지 않는다.

## 확정 커밋

- `84ebd84` — feat(core,react): menu.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.menu` 네임스페이스 신설(21개 flat key): `blockMenuAriaLabel`/`turnInto`/`indent`/`outdent`/`duplicate`/`delete`, `align`/`alignLeft`/`alignCenter`/`alignRight`/`alignNone`(block-side-menu-menu.tsx와 table-cell-format-menu.tsx가 각자 하드코딩으로 중복 소유하던 5개를 하나의 key로 통합), `tableRowMenuAriaLabel`/`tableColumnMenuAriaLabel`, `insertRowAbove`/`insertRowBelow`/`insertColumnLeft`/`insertColumnRight`/`deleteRow`/`deleteColumn`/`headerRow`/`headerColumn`(table-handle-menu.tsx의 8개 row/column 3항 분기), `cellFormattingAriaLabel`. `DEFAULT_DICTIONARY.menu`에 현재 하드코딩 값 채움.
- `packages/react/src/block-side-menu-menu.tsx` — 위 문구를 `dictionary.menu.*`로 치환(색상 섹션은 DELTA-05 소관, 그대로 둠).
- `packages/react/src/table-handle-menu.tsx` — `useDictionary()` 추가, 8개 3항 분기를 `dictionary.menu.*`로 치환.
- `packages/react/src/table-cell-format-menu.tsx` — `useDictionary()` 추가, "Cell formatting"·Align 5종을 `dictionary.menu.*`로 치환(block-side-menu-menu.tsx와 같은 key 재사용).
- `packages/react/test/{block-side-menu,table-cell-format-menu,table-handle-menu}.test.tsx` — 3개 소비처 override 검증 3건, `mount-editor.tsx` dictionary passthrough를 `table-handle-menu.test.tsx`까지 연장.

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 583 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean.

## RD-002 진행 상태

DELTA-04 완료. `Dictionary`에 `menu`(21개 key) 네임스페이스 추가, Align 5개 key를 2개 파일이 공유해 기존 하드코딩 중복 제거. 남은 것은 DELTA-05~10(color/toolbar×2/handle/codeLanguage/error·status).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서에 별도 기재된 남은 위험 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 84ebd84`. 위험: 낮음 — 3개 소비처의 렌더 텍스트 치환과 신규 네임스페이스 추가뿐, 로직 변경은 없다. DELTA-07이 `dictionary.menu.cellFormattingAriaLabel`을 재사용하므로 단독 revert 시 이후 커밋과 충돌 가능 — 체인 최신 커밋부터 역순으로 revert해야 한다.
