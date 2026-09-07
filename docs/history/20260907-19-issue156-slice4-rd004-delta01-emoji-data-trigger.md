# Issue #156 슬라이스4 RD-004 DELTA-01 — 이모지 데이터셋 + `:` 트리거 감지 + 필터링

## 목표

RD-004(emoji picker, `EXT-006`/`EXT-007`이 아닌 별개 결과 `UI-012`/`UI-013`)의 첫 DELTA. `:` 트리거로 여는 grid suggestion의 데이터층(하드코딩 큐레이션 이모지, 트리거 감지, keyword 필터링)만 만든다 — grid 렌더·키보드 네비게이션·선택 삽입·`portalTarget`은 DELTA-02로 미룬다.

## 확정 커밋

- `6e440a7` — feat(react): 이모지 grid suggestion 데이터셋·트리거 감지·필터링 추가(RD-004 DELTA-01)

## 변경한 계약과 파일

- `packages/react/src/emoji-picker-options.ts`(신규): `EmojiOption`(`id`/`char`/`label`/`keywords`) 타입과 `EMOJI_OPTIONS` 564개. 신규 npm 의존성 없음(roadmap.md "Emoji picker 데이터 소스·트리거·컬럼 수" 결정). 전체 유니코드(emojilib 기준 1906개) 중 국기·ZWJ 다중 인물 합성·keycap·skin tone 변형을 제외하고 자주 쓰는 카테고리(smileys/hearts/people 제스처/animals/nature/food/activities/travel/objects/symbols)를 수동 선별했다. 이모지 문자를 직접 타이핑하는 오타 위험을 없애려고 조사 단계에서만 `emojilib`(https://github.com/muan/emojilib, MIT)의 공개 keyword 데이터를 스크래치패드 스크립트로 조회했다 — 산출물은 리터럴 배열이고 그 스크립트·원본 JSON은 저장소에 남기지 않았다.
- `packages/react/src/emoji-picker.tsx`(신규): `parseEmojiQuery`(`:query` 트리거 감지)와 `filterEmojiOptions`(label/keyword 필터링). `slash-menu.tsx`의 `parseSlashQuery`와 동일한 방식(블록 텍스트 전체가 트리거와 정확히 일치할 때만 연다)을 독자 구현 — 두 파일이 서로 다른 트리거 문자를 다뤄 공유 훅으로 추출하지 않는다(`media-toolbar.tsx`/`file-panel.tsx` 전례와 동일 근거). 아직 React 컴포넌트는 없다 — RD-004.md가 최종 파일명을 `emoji-picker.tsx`로 명시해 DELTA-02가 같은 파일에 컴포넌트를 추가한다.
- `packages/react/test/emoji-picker.test.ts`(신규): `parseEmojiQuery`/`filterEmojiOptions` 순수 함수 단위 테스트 9건. DOM 마운트 불필요(`block-type-options.test.ts`와 같은 자리).

## 핵심 설계 결정 — 인라인 치환 방식(이전 세션이 미해결로 남긴 문제 해소)

이전 세션 핸드오프가 남긴 미해결 질문: "`:query` 트리거 텍스트를 캐럿 위치의 이모지 한 글자로 어떻게 치환하는가?" `SlashMenu`의 `setBlockType(..., { clearContent: true })`/`insertMediaBlock(..., { clearAfterBlockText: true })` 계열은 "블록 전체를 갈아치우거나 블록 콘텐츠 전체를 지운다"는 블록 레벨 계약이라 인라인 부분 치환에 안 맞았다.

백그라운드 조사(`packages/core/src/editor-controller-types.ts`의 `commands` 계약 전체 대조) 결과: 캐럿 앞 트리거 부분 문자열만 골라 치환하는 오프셋 기반 공개 API(`insertText`/`replaceText`/오프셋 `deleteRange` 류)는 core에 없다. `setTextCursorPosition`도 `"start"/"end"` 두 값만 받는다. 남는 유일한 기존 계약은 `getCaretBlockContext().text`(블록 전체 텍스트)를 문자열 치환한 뒤 `commands.setText(blockId, replaced)`(블록 전체 재작성 API)로 다시 쓰는 것.

해소: 트리거 감지를 `parseSlashQuery`와 동일하게 "블록 텍스트 전체가 트리거와 정확히 일치할 때만" 열리도록 제한했다(`parseEmojiQuery`, `/^:(\S*)$/` 전체 매치 — RD-004.md "포함 범위"가 이미 이 방식을 지목). 트리거가 블록 텍스트 전체와 같으면 "부분 치환"이 아니라 "블록 전체 재작성"이 되므로, DELTA-02는 `commands.setText(blockId, char)` + `setTextCursorPosition(blockId, "end")`(controller 최상위 API, `commands` 아래가 아니다)만으로 완결할 수 있다 — 오프셋 기반 신규 core API가 필요 없다. 근거·틀렸을 때 비용은 `result/RD-004-DELTA-01.md` "핵심 설계 결정" 참고.

## 검증

- RED: `emoji-picker.test.ts` 작성 시점에 `../src/emoji-picker.js` 모듈이 없어 suite 자체가 `Cannot find module`로 실패 확인.
- GREEN: `emoji-picker.tsx` 구현 후 9개 테스트 전부 통과.
- `pnpm --filter @cp949/geul-react exec vitest run --root ../.. test/emoji-picker.test.ts` — 9 passed.
- `pnpm --filter @cp949/geul-react test`(패키지 첫 실행) — 39 files / 538 tests passed, 사전 결함 없음.
- `pnpm --filter @cp949/geul-react typecheck` — clean.
- `pnpm exec eslint packages/react/src/emoji-picker-options.ts packages/react/src/emoji-picker.tsx packages/react/test/emoji-picker.test.ts` — 결함 0건.
- 재그룹화: 단일 커밋, `git merge --ff-only`로 바로 이전.

## RD-004 완료 조건 재대조

DELTA-01은 데이터층만 담당 — RD-004 완료 조건(":+쿼리 입력 시 grid가 뜨고 선택 시 캐럿 위치에 삽입", "portalTarget 지원", "test/e2e 통과") 3개 전부 미충족 상태 유지. DELTA-02(grid 렌더·키보드 네비게이션·선택 삽입·portalTarget)가 남았다(`_works/roadmap/RD-004.md` 갱신).

## roadmap 진행 상태

RD-001·RD-002·RD-003 DONE. RD-004(emoji picker) `ACTIVE` — DELTA-01 완료, DELTA-02(예상)만 남았다. DELTA-02 완료 시 RD-004 DONE, roadmap 전체(슬라이스4) 완료.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스4)는 RD-004 DELTA-02가 남아 미완료. Issue #156 완료 댓글은 RD-004까지 끝난 뒤 슬라이스4 전체로 게시한다(슬라이스1~3 전례).

## 남은 위험

- `emoji-picker.tsx`가 아직 React 컴포넌트를 export하지 않는다 — 소비자가 쓸 수 있는 완성 기능이 아니다(DELTA-02 몫, 계획대로).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 6e440a7`. 위험: 낮음 — 신규 파일만 추가했고 기존 파일을 건드리지 않아 다른 컴포넌트에 영향이 없다. `packages/react/src/index.ts`도 아직 이 파일들을 export하지 않아(DELTA-02에서 추가 예정) 공개 API 표면에 노출된 것이 없다.
