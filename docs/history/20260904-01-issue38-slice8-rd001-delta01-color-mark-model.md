# Issue #38 슬라이스 8 RD-001 DELTA-01 — 글자색/배경색/정렬 저장 계약(model)

## 목표

roadmap-workflow RD-001(저장 계약 파운데이션)의 첫 DELTA. model에 인라인 `TextMark` 2종(`textColor`/`backgroundColor`, `color: string`)과 블록 수준 `TextBlockProps`(`textColor?`/`backgroundColor?`/`textAlignment?`)를 추가하고, `parseDocument`가 정규형·multiplicity·대상 블록 제한을 검증한다. core PM mark extension·프로덕션 round-trip은 DELTA-02로 남긴다.

## 확정 커밋

- `03ce2ab` — model TextMark textColor/backgroundColor + TextBlockProps 추가 (Issue #38 슬라이스 8, RD-001 DELTA-01)

## 변경한 계약과 파일

- `packages/model/src/types.ts`: `TextMark` union에 `textColor`/`backgroundColor` 추가. `TextBlockProps` 신설, `paragraph`/`heading`/`quote`/목록 4종(7개 타입)에 `& TextBlockProps` 편입. `table`/`divider`/`codeBlock`은 제외(spec §3.3).
- `packages/model/src/mark-canonicalization.ts`: `storedMarkOrder`에 `textColor: 6`/`backgroundColor: 7`(기존 6종 뒤에 추가, 기존 순서 불변). `decodeTextMark`에 `color` 필드를 요구하는 분기 추가. multiplicity(타입당 최대 1개)는 기존 `seenTypes` 제네릭 로직이 그대로 커버 — 전용 함수 신설 없음.
- `packages/model/src/schema.ts`: `textMarkSchema`에 두 변형 추가. `validateContent`에 인라인 mark 색상 정규형(`isCanonicalCellColor` 재사용) 검사 추가. 7개 nestable 블록 zod 스키마에 `TextBlockProps` 필드 추가. `validateCells`와 동형인 `validateTextBlockProps`(재귀 순회) 신설해 `parseDocument`에 조립.
- `packages/model/src/index.ts`: `TextBlockProps` export 추가.
- **범위 확장(구현 중 발견)**: model `TextMark` 확장이 core `model-to-tiptap.ts`의 `markToTiptap`과 io `html/inline-content.ts`(`htmlWrapperMarkOrder`/`wrapMark`)·`markdown/export-markdown.ts`(`markOrder`/`wrapNodes`)의 exhaustive switch를 컴파일 오류로 깨뜨렸다(readiness probe가 core만 확인, io는 놓침). 세 지점을 함께 처리해 `dev`를 계속 green으로 유지했다:
  - `packages/core/src/model-to-tiptap.ts`: `markToTiptap`에 `{ type, attrs: { color } }` 최종 인코드 추가(link 패턴과 동형). PM mark extension 미등록이라 아직 라이브 에디터엔 도달하지 않는다(DELTA-02가 등록).
  - `packages/io/src/html/inline-content.ts`: `wrapMark`에 명시 `throw`(RD-004 예정) — `sanitize-schema.ts`가 아직 `span`/`style`을 허용하지 않아 인코드만 열면 재파싱에서 사라지는 반쪽 round-trip이 되기 때문. `htmlWrapperMarkOrder`는 값만 추가.
  - `packages/io/src/markdown/export-markdown.ts`: `wrapNodes`에 `underline`/`code`와 동일한 pass-through(값 통과, 손실) 추가 — GFM에 색상 구문이 없어 최종 동작이다(스텁 아님). `markOrder`는 값만 추가.
- 테스트(신규): `packages/model/test/text-block-props-validation.test.ts`, `packages/core/test/text-color-mark-to-tiptap.test.ts`. 테스트(확장): `packages/model/test/text-mark-decode.test.ts`, `document-mark-ordering.test.ts`.

## 검증

- TDD RED→GREEN: 신규 16개 model 테스트 전부 RED(예상 실패 사유 확인) 후 구현으로 GREEN. core 신규 1개 테스트도 동일 절차.
- `pnpm --filter @cp949/geul-model test`(337/337), `pnpm --filter @cp949/geul-core test`(1100/1100), `pnpm --filter @cp949/geul-io test`(449/449, 무변경 확인용), `pnpm --filter @cp949/geul-react test`(391/391, 무변경 확인용) — 전부 통과.
- 루트 `pnpm typecheck`(`turbo run typecheck` 6패키지 + configs/e2e/tests/scripts) — 전부 통과.
- 변경 파일 전체 `eslint` — 0 findings.
- 단일 커밋이라 재그룹화 대상 없음. `git diff <pre-squash 백업 ref> dev --stat` 빈 출력으로 트리 무결성 확인 후 ff-only 병합.

## 등록한 이슈

- 완료 댓글: 게시하지 않음. RD-001 자체가 아직 미완료(완료 조건 3개 중 2개만 충족 — core production round-trip은 DELTA-02 몫)이고, 기존 이력(예: RD-003 완료)은 RD 단위 이상에서 게시한 전례라 이 DELTA 단위에서는 보고할 완료 단위가 아니라고 판단했다. Issue #38은 후속 RD·슬라이스가 다수 남아 있다.
- 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- RD-001 완료 조건 2(core `createEditor` color/align round-trip)는 DELTA-02가 담당 — PM mark extension 등록, `tiptap-to-model.ts`/`table-model-codec.ts`의 color attr 포워딩, blockContainer attrs 추가가 남았다.
- io의 두 지점(`wrapMark` throw, `wrapNodes` pass-through)은 RD-004(HTML/GFM 입출력)가 대체한다 — 오늘은 이 mark를 만드는 프로덕션 경로가 없어(RD-002 미착수) 도달 불가능.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — model 저장 계약 확장은 전부 optional 필드라 하위 호환을 깨지 않는다. core `markToTiptap`·io 두 switch의 case 추가도 함께 되돌아가(같은 커밋) 컴파일이 되돌린 시점의 상태로 일관되게 유지된다.
