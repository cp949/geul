# Issue #156 슬라이스11 RD-003 DELTA-01 — KO_DICTIONARY 한국어 번역 완성

## 목표

RD-003(ko 번역 완성 + 완료 판정/문서 동기화)의 첫 DELTA. en(`DEFAULT_DICTIONARY`)은 RD-001/RD-002가 하드코딩 영어 문구를 그대로 key 값으로 옮기며 이미 완성돼 있다 — 이 DELTA의 실제 작업은 `Dictionary` 전체(placeholder/editor/blockType/slashMenu/menu/color/toolbar/handle/codeLanguage/error/status, leaf 약 250개)의 ko 사전 신규 작성뿐이다. `Dictionary` 타입이 전 필드 필수라 `KO_DICTIONARY: Dictionary` 선언 자체가 누락 key를 기계적으로 잡는다(readiness probe 판정: `READY`).

## 확정 커밋

- `ef098f7` — feat(core): KO_DICTIONARY 한국어 번역 완성 (Issue #156 RD-003-DELTA-01)

## 변경한 계약과 파일

- `packages/core/src/dictionary-ko.ts`(신규) — `KO_DICTIONARY: Dictionary` export, en 대비 leaf 약 250개 전부 번역. 번역 원칙: `{level}`/`{kind}` 토큰은 그대로 유지하고 주변 문구만 번역(예: "Heading {level}" → "제목 {level}"), 색상 이름은 표준 한국어(Gray→회색 등), 에러·상태 메시지(`error.*`/`status.*`)는 하십시오체("~습니다") 완결형, 메뉴·버튼 라벨(`menu.*`/`toolbar.*`/`handle.*` 등)은 존댓말 어미 없는 명사형·동사 어간형("삭제"/"취소"/"저장"), BlockNote 번역은 참조하지 않음(spec §8.2). 기존 파일 구조 관례(`packages/core/src` 평면 구조)를 따라 `locales/` 서브디렉터리 없이 `dictionary.ts`와 같은 자리에 둠.
- `packages/core/src/index.ts` — `KO_DICTIONARY` export 추가(`Dictionary`/`DEFAULT_DICTIONARY`와 같은 자리).
- `packages/core/test/dictionary-ko.test.ts`(신규) — 타입 만족 확인, en 대비 leaf 동일값 없음(번역 누락 가드), 대표 값 스팟체크, 토큰 보존 4건.
- `packages/react/test/dictionary-ko-integration.test.tsx`(신규) — `dictionary={KO_DICTIONARY}` override 시 `editor`/`placeholder`/`blockType`·`menu`·`handle`/`slashMenu` 6개 네임스페이스가 실제 마운트에서 한국어로 렌더됨을 통합 검증 4건(214건 전부를 다시 개별 검증하지 않음 — RD-002가 이미 배선 자체를 전량 검증했으므로 이 DELTA는 "ko 값이 정확히 대입되는지"만 재확인).

## 검증

- `pnpm --filter @cp949/geul-core build` — 성공(exit 0), `KO_DICTIONARY: Dictionary` 선언이 타입 에러 없이 컴파일됨.
- `pnpm --filter @cp949/geul-core test` — 140 test files / 1626 tests 전부 통과(신규 `dictionary-ko.test.ts` 4건 포함).
- `pnpm --filter @cp949/geul-react test` — 44 test files / 605 tests 전부 통과(신규 `dictionary-ko-integration.test.tsx` 4건 포함, 기존 601건에서 증가).
- core/react `typecheck` 통과, eslint/prettier 전부 clean(react 테스트 파일 1개 포맷 자동 반영).
- 리뷰 중 초안의 `toolbar.filePanel.urlInputAriaLabel` 번역 누락 1건(en과 동일한 `"{kind} URL"`로 남아 있던 것)을 `dictionary-ko.test.ts`의 leaf-diff 가드로 발견해 `"{kind} URL 입력"`으로 수정. `mountBlockEditor` 헬퍼가 `getByRole("textbox", { name: "Editor" })`로 host를 찾는 제약 때문에 `editor.ariaLabel` 검증은 헬퍼를 거치지 않는 별도 마운트로 분리(공유 테스트 헬퍼 76개 호출부는 이번 DELTA 범위 밖이라 수정하지 않음). `BlockSideMenu`가 react 패키지 공개 export가 아니어서 초안의 `../src/index.js` import가 런타임 에러를 냈고, 기존 선례대로 `../src/block-side-menu.js` 직접 import로 수정.

## RD-003 진행 상태

DELTA-01 완료로 RD-003 완료 조건 1("en(기본)·ko 번역이 완성되고 두 언어 모두 override 검증을 통과한다") 충족 — roadmap.md 전체 완료 조건 3번째 항목도 함께 충족. 남은 것은 DELTA-02(인벤토리 `EXT-009` `VERIFIED`·`EXT-010` `PARTIAL` 갱신, `docs/product/roadmap.md` R4 절 이월 조항, `R4-03` 별도 판정 회차 문서 동기화) — 아직 미착수.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- ko 번역은 기계적으로 "en과 다름"만 보장된다 — 자연스러움·용어 일관성(예: "삭제" vs "지우기")은 사람 리뷰를 거치지 않았다. 사용자가 표현을 조정하고 싶으면 `dictionary-ko.ts`를 직접 고치면 된다(별도 override 메커니즘 불필요).
- 20개 비영어·비한국어 로케일은 이 DELTA 범위 밖(승인된 이월, `roadmap.md` 참고) — RD-003-DELTA-02에서 인벤토리·문서만 갱신하고 실제 번역은 후속 이슈로 넘어간다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert ef098f7`. 위험: 낮음 — 신규 파일(`dictionary-ko.ts`, 테스트 2건) 추가와 `index.ts` export 1줄뿐, 기존 파일 수정·삭제가 없어 순수 추가형 변경이다.
