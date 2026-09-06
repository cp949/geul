# Issue #156 슬라이스2 RD-002 DELTA-19 — `customStyles` registry 배선(PM Mark, addAttributes/renderHTML)

## 목표

roadmap-workflow RD-002의 열아홉 번째 DELTA(DELTA-18 직후 이어서 진행). `CreateEditorOptions.customStyles`(spec §4.4 EXT-003)를 받아 등록된 커스텀 스타일마다 PM Mark를 조건부로 등록하고, 적용/해제 명령(`toggleCustomStyle`)·렌더·model↔PM JSON round-trip을 제공한다. 이 DELTA로 RD-002 완료 조건 1번(`customBlocks`/`customInlineContent`/`customStyles`)이 전부 채워졌다 — DELTA-18이 남긴 마지막 실질 구현 백로그.

착수 전 판단(그릴링 없이 결정, 근거는 `_works/roadmap/result/RD-002-DELTA-19.md` "착수 전 판단"):

1. `CustomStyleDefinition.render`의 반환값(`HTMLElement | {className?, style?}`)을 Mark의 배열 기반 `DOMOutputSpec`(콘텐츠 hole `0` 필수)으로 변환한다 — `HTMLElement`는 태그·속성만 추출하고 자식은 버린다, `{className,style}`은 `["span", {class, style}, 0]`로 직접 구성한다.
2. mark 순서·검증 정책은 model의 기존 결정(DELTA-13, `schema.ts::validateContent`)을 그대로 재사용한다 — model이 이미 "알려진 마크만 canonical 순서를 검사하고 CustomTextMark는 그 판정에 전혀 참여하지 않는다"고 확정해 뒀다.
3. "인접 동일 마크" 판정(core 전용 불변식, model에는 없음)은 커스텀 마크의 `type`+`props`까지 포함해 판정한다 — 순서 무시(결정 2)와 별개로 "동일성" 문제라 따로 결정.
4. `io` 게이트·클립보드/붙여넣기·`insertBlocks`류 우회는 이번에도 건드리지 않는다(DELTA-18과 동일 근거).
5. `toggleCustomStyle` 명령 초기 설계는 `runInlineColorCommand`를 그대로 재사용할 계획이었으나, **착수 중 실측으로 Tiptap `toggleMark`의 attrs 활성 판정이 얕은 비교라는 결함을 발견**했다 — 아래 "발견" 참고.

## 확정 커밋

- `9bc0acf` — feat(core): customStyles registry 배선(PM Mark, addAttributes/renderHTML)(RD-002-DELTA-19)

## 변경한 계약과 파일

- `packages/core/src/editor-controller.ts` — `CustomStyleDefinition` 타입 신설(spec §4.4 그대로), `CreateEditorOptions.customStyles?` 추가, `toggleCustomStyle(type, props?)` 추가(미등록 시 `CUSTOM_STYLE_TYPE_NOT_REGISTERED`).
- `packages/core/src/errors.ts` — `CUSTOM_STYLE_TYPE_NOT_REGISTERED` 코드 추가.
- `packages/core/src/custom-style-mark-extension.ts`(신규) — `createCustomStyleMark(type, definition)`: `Mark.create({addAttributes, renderHTML})`. `editor` 참조가 필요 없어(spec §4.4 `CustomStyleDefinition.render`는 값만 받는다) 지연 바인딩 Proxy 배선이 없다.
- `packages/core/src/model-to-tiptap.ts` — `inlineContentViolation`/`validateEditableContent`/`modelToTiptap`에 `customStyleTypes` threading. `unregisteredMark` 판정을 등록된 커스텀 마크는 통과시키도록 확장, `knownMarks`를 캐스트 대신 필터로 좁혀 canonical 순서·링크 검사가 알려진 마크만 대상으로 하도록 정정, 인접 동일 마크 서명에 커스텀 마크 `type`+`props`(정렬된) 접미사 추가. `inlineContentToTiptap`의 마크 인코드를 `markToTiptapAny`(known/custom 분기)로 교체.
- `packages/core/src/tiptap-to-model.ts` — 마크 디코드 루프를 known/custom 분기로 나눠 등록된 커스텀 마크는 canonicalizeTextMarks(model, TextMark 전용)를 거치지 않고 별도 축적 후 뒤에 붙인다. `customStyleTypes`를 `inlineContentFromTiptap`/`tableBlockFromTiptapJson`/`blockContainerToModel`/`decodeBlock`/`tiptapToModel`에 threading.
- `packages/core/src/production-editor-session.ts`/`production-editor-assembly.ts` — `customBlocks`/`customInlineContent`와 동일한 조건부 스프레드로 `customStyles` 옵션·`modelToTiptap`/`tiptapToModel` 호출의 `customStyleTypes` threading, `extensions` 배열에 `createCustomStyleMark(...)` 항목 추가(Proxy 불필요).
- `packages/core/src/index.ts` — `CustomStyleDefinition` 재수출.
- `packages/core/test/custom-style-registry.test.ts`(신규, 5 tests) — 등록·렌더(알려진 마크와 섞여도 canonical 순서 오판 없음), 인접 다른-props 커스텀 마크 오판 방지, `toggleCustomStyle` round-trip(적용/해제), 미등록 타입 거절, 회귀 없음.

## 발견(계획에 없던 결함, 착수 중 실측·즉시 수정)

`toggleCustomStyle`을 `runInlineColorCommand`와 동일하게 `session.editor.commands.toggleMark(type, {props})`로 구현했더니, **두 번째 호출(해제 시도)이 계속 "재적용"으로만 동작**하는 버그를 GREEN 시도 중 발견했다. 디버그 테스트로 원인을 특정: Tiptap의 `toggleMark`/`isActive`가 attrs 활성 판정을 **얕은 비교**로 한다 — `color`처럼 값이 primitive string인 경우(`runInlineColorCommand`, textColor/backgroundColor)는 매 호출 리터럴이 원시값이라 우연히 비교가 맞아떨어지지만, `props`처럼 값이 객체인 경우 매 호출마다 새로 만든 리터럴이라 참조가 달라 `isActive`가 항상 `false`를 반환한다. `editor.getAttributes(type).props`를 직접 읽어 `JSON.stringify`로 깊은 비교를 한 뒤 `setMark`/`unsetMark`를 명시적으로 선택하는 방식으로 교체해 해소했다.

## 검증

- 착수 전 재측정(`pnpm --filter @cp949/geul-model build` 후 stale tsbuildinfo 삭제) — DELTA-18 완료 직후라 드리프트 없음, DELTA-11의 지연 바인딩 Proxy·`text-color-mark-extension.ts`(Mark 선례)·`schema.ts::validateContent`(mark 순서 정책) 재확인 후 착수.
- RED→GREEN: 신규 테스트 5개를 구현과 함께 작성 → 1차 실행에서 toggle round-trip 테스트 1건 실패(위 "발견") → 원인 특정·수정 → 5/5 GREEN.
- post-fix mutation 7건(계획 6건 + 방향 착오로 추가 시도한 변형 1건) 실행, 결과를 있는 그대로 기록:
  1. `custom-style-mark-extension.ts`의 `renderHTML` 변환 로직 제거 → 완료 조건 1·3(초기 로드 렌더, toggle 적용 렌더) 2건 실패.
  2. `inlineContentViolation`의 `knownMarks` 필터를 블라인드 캐스트로 되돌림 → **테스트로 구분되지 않음**(V8 `Array.sort`가 comparator의 `NaN`을 스펙상 `+0`으로 취급해, bold+customMark 2개 조합에서는 두 known-mark 사이의 실제 비교가 NaN에 오염되지 않아 우연히 같은 결과가 나옴 — 타입 안전성 문제이지 이 테스트로 관측 가능한 동작 차이는 아니었다). 필터는 유지한다(모델의 명시적 원칙 재사용이 캐스트보다 정확하고, 다른 조합에서 우연에 의존하지 않는다).
  3. 인접 동일 마크 서명의 커스텀 마크 접미사 제거 → 완료 조건 2(다른 props 인접 런) 1건만 정확히 실패(격리 확인).
  4. `markToTiptapAny`의 커스텀 분기 제거 → 초기 로드 경로가 `RangeError: Invalid input for Mark.fromJSON`으로 크래시.
  5. `inlineContentFromTiptap`의 커스텀 마크 디코드 분기 제거 → round-trip 경로 3건 실패(적용·해제·테스트 정리 시점).
  6. `toggleCustomStyle`의 스키마 등록 가드 제거 → 완료 조건 5(미등록 타입 거절)가 Tiptap 내부 `Error: There is no mark type named ...`로 크래시(그레이스풀 실패가 가드에 의존함을 확인, DELTA-18보다 더 명확한 크래시).
  7. `unregisteredMark` 판정에서 `customStyleTypes.has(...)` 조건 제거(블랭킷 허용) → 신규 테스트 1건 + 기존 회귀 테스트(`editor-feature-unavailable.test.ts`) 1건 실패.
- `pnpm --filter @cp949/geul-core test` 1579 passed(기존 1574+신규 5) · `pnpm --filter @cp949/geul-io test` 648 passed(변화 없음) · `pnpm --filter @cp949/geul-react test` 505 passed(변화 없음).
- `pnpm --filter @cp949/geul-core typecheck`/`io typecheck`/`react typecheck` 전부 0건(project reference 전량 포함) — 세 패키지 전부 typecheck clean 유지.
- `npx eslint`(변경 9파일) 0 문제. `git diff --check` 0건.

## 등록한 이슈

없음.

## 남은 위험

- `io`(`exportHtml`/`exportMarkdown`)와 클립보드·붙여넣기 경로, `insertBlocks`/`updateBlock`/`replaceBlocks` 우회는 여전히 `customStyles`를 모른다 — `customBlocks`/`customInlineContent`와 동일한 기존 위험 범주로 남겨 두었다(의도적).
- Mark exclusivity(`excludes`) 규칙을 두지 않았다 — 두 개 이상의 커스텀 스타일을 같은 텍스트에 동시 적용할 수 있다(spec이 배타 규칙을 요구하지 않아 기본 Tiptap 동작 그대로 둠).
- mutation 2(`knownMarks` 필터)가 테스트로 구분되지 않은 것은 V8의 `Array.sort` NaN 처리가 우연히 안전망 역할을 했기 때문이다 — 다른 마크 조합(예: 이미 순서가 잘못된 known marks + custom mark 혼합)에서는 관측 가능한 차이가 날 수 있어 필터 자체는 유지했지만, 이 특정 안전성을 독립적으로 증명하는 테스트는 이번에 만들지 못했다. 후속 세션이 mark 순서 관련 회귀를 다룰 때 참고.
- **RD-002 완료 조건 1번이 이 DELTA로 전부 충족됐다**(`customBlocks`+`customInlineContent`+`customStyles` 모두 등록·렌더·round-trip 확인). 남은 것은 완료 조건 3번(회귀 없음 전체 재대조)뿐 — RD-002가 `DONE` 전환 가능한 마지막 단계에 도달했다. 다음 세션은 roadmap-workflow "RD 완료와 roadmap 종료" 절차(완료 조건 전체를 실측 증거와 재대조)부터 시작한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다 — RD-002가 아직 `DONE`이 아니다(완료 조건 재대조 남음).
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 9bc0acf`. 위험: 낮음 — 신규 파일 1개(`custom-style-mark-extension.ts`)와 기존 파일의 추가적 옵션 필드·조건부 분기뿐이다. 기존 옵션(`customStyles` 미지정)에서는 모든 조건부 분기가 빈 집합/undefined로 접혀 DELTA-18 이전과 동일하게 동작한다(`pnpm --filter @cp949/geul-io test`/`core test`/`react test`가 기존 개수 그대로 통과함을 확인). 되돌리면 `customStyles` 옵션 자체가 사라지고 커스텀 마크는 다시 무조건 `EDITOR_FEATURE_UNAVAILABLE`로 거절된다(DELTA-14 상태로 복귀).
