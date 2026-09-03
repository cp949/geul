# Issue #38 슬라이스 8 RD-001 DELTA-02 — 글자색/배경색/정렬 저장 계약(core) 완성, RD-001 DONE

## 목표

roadmap-workflow RD-001(저장 계약 파운데이션)의 두 번째이자 마지막 DELTA. DELTA-01이 끝낸 model 계약·core 인코드(`markToTiptap`)를 이어받아 PM mark extension 신설·등록, model↔PM codec 나머지 2지점(`tiptap-to-model.ts:markFromTiptap`, `table-model-codec.ts` 표 셀 라이브 PM 노드 경로), `blockContainer` PM 노드의 `TextBlockProps` attrs를 완성하고 production `createEditor`/`replaceDocument`/`getDocument` round-trip을 검증한다. 이 DELTA로 RD-001 완료 조건 3개가 모두 충족돼 RD-001이 `DONE`으로 전환된다.

## 확정 커밋

- `5039bd4` — core PM mark extension + codec 왕복 + blockContainer attrs 추가 (Issue #38 슬라이스 8, RD-001 DELTA-02)

## 변경한 계약과 파일

- `packages/core/src/text-color-mark-extension.ts`(신규): `TextColorMark`/`BackgroundColorMark` Tiptap `Mark.create`. `color` attr(`default: null, rendered: false`), `renderHTML`은 인라인 `style`(color/background-color)만 구성. `parseHTML` 미선언(HTML 입출력·비정규 색상값 유입 차단은 RD-004 몫).
- `packages/core/src/production-editor-assembly.ts`: `extensions` 배열에 두 mark 등록.
- `packages/core/src/block-container-extension.ts`: `BlockContainerExtension.addAttributes`에 `textColor`/`backgroundColor`/`textAlignment`(각 `default: null, rendered: false`) 추가 — 7개 nestable 타입이 이 컨테이너 하나를 공유하므로 attrs도 한 곳에만 둔다. `codeBlock`도 이 컨테이너를 쓰지만 이 필드를 받지 않는다.
- `packages/core/src/model-to-tiptap.ts`: `blockToTiptapJson`의 codeBlock/table/divider 이후 공통 분기(7개 타입)에서 `blockContainer` attrs에 `TextBlockProps` 3필드를 `?? null`로 추가.
- `packages/core/src/tiptap-to-model.ts`: `markFromTiptap`의 `decodeTextMark` 호출에 `color: mark.attrs?.color` 추가. `blockContainerToModel`에서 `node.attrs`의 `TextBlockProps` 3필드를 한 번 읽어 7개 반환 분기(paragraph/heading/quote/목록 4종) 전체에 공통 스프레드.
- `packages/core/src/table-model-codec.ts`: `inlineContentFromNode`의 `decodeTextMark` 호출에 `color: mark.attrs.color` 추가(표 셀 라이브 PM 노드 인라인 mark 경로).
- `packages/core/test/table-test-support.ts`: `TABLE_FIXTURE_EXTENSIONS`에 `TextColorMark`/`BackgroundColorMark` 등록(표 fixture 스키마가 production과 같은 mark 집합을 갖게 함).
- 기존 PM shape 고정 테스트 6개(`check-list-item-codec`·`code-block-codec`·`list-item-codec`·`toggle-list-item-codec`·`editor-controller-heading-levels`·`editor-controller-quote`)를 새 attrs에 맞춰 갱신 — 앞 4개는 `expectedPmDocument` 픽스처에 새 null 키 3개 추가, 뒤 2개는 그 파일 자신의 명시된 partial-match 의도에 맞춰 `attrs`를 `expect.objectContaining`으로 교정.
- 테스트(신규): `packages/core/test/text-block-props-round-trip.test.ts`(블록 수준 7개 타입 + `replaceDocument` + codeBlock 비영향 회귀), `text-color-mark-round-trip.test.ts`(인라인 mark 단독·6종 혼합). 테스트(확장): `table-model-codec.test.ts`의 "정규형 mark를 양방향 변환해도 순서와 값을 보존한다"에 `textColor`/`backgroundColor` 추가.

## 검증

- TDD RED→GREEN: 신규 6개(round-trip 4 + 2)와 확장 1개(table-model-codec) 전부 RED(예상 실패 사유 확인) 후 구현으로 GREEN. 파급으로 깨진 기존 6개는 attrs 픽스처 보정으로 GREEN 복귀.
- `pnpm --filter @cp949/geul-core test`(86 files, 1106/1106 — 기존 1100 + 신규 6)·`typecheck` — 통과.
- `pnpm --filter @cp949/geul-model test`(337/337, 무변경 확인용), `pnpm --filter @cp949/geul-io test`(449/449, 무변경 확인용), `pnpm --filter @cp949/geul-react test`(391/391, 무변경 확인용) — 전부 통과.
- 루트 `pnpm typecheck`(전체 10 task) — 전부 통과.
- 변경·신규 파일 16개 전체 `eslint` — 0 findings.
- 단일 커밋이라 재그룹화 대상 없음. `git diff <pre-squash 백업 ref> feat/38-rd001-delta02 --stat` 빈 출력으로 트리 무결성 확인 후 ff-only 병합.
- RD-001 완료 재대조(roadmap-workflow "RD 완료와 roadmap 종료"): 완료 조건 3개 전부 충족 확인, `RD-001.md` D9에 재대조 근거 기록.

## 등록한 이슈

- 완료 댓글: roadmap-workflow의 "경량 DELTA 사이클"은 issue-tracker.md "게시 승인"의 workflow 완료 자동 게시 예외(ff-workflow 트랙-8/qq-workflow 단계-4 한정) 대상이 아니라고 판단해 초안만 준비하고 사용자에게 게시 여부를 물었다. 사용자가 게시를 지시해 RD-001(DELTA-01+02 통합 요약) 완료 댓글을 게시함: https://github.com/cp949/geul/issues/38#issuecomment-5530484358 — Issue #38은 후속 RD-002~004와 슬라이스가 다수 남아 `OPEN` 유지, 닫지 않음.
- 범위 밖 신규 이슈 등록 없음.

## 남은 제한

- `blockContainer` 색상/정렬 attrs는 저장 전용이다(`rendered: false`) — 편집기 내 시각 렌더(인라인 style 적용)는 이 DELTA 범위 밖이다. `TextColorMark`/`BackgroundColorMark`의 `parseHTML`(클립보드·문서 HTML `style="color"` 인식)도 비워 뒀다 — 둘 다 사용자가 실제로 이 값을 만들 명령(RD-002)·UI(RD-003)가 아직 없어 오늘은 도달 불가능하고, RD-004(HTML/GFM 입출력)가 채울 자리로 문서화돼 있다.
- 사용자 명령(toggle/set)·React UI·HTML/GFM 입출력은 각각 RD-002·RD-003·RD-004 몫으로 전혀 착수하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

위 확정 커밋 1개를 `dev`에서 `git revert`한다. 위험: 낮음 — PM mark·attrs 추가는 전부 optional/새 확장이라 기존 문서·편집 동작을 바꾸지 않는다. 기존 6개 codec 테스트의 attrs 픽스처 보정도 같은 커밋에 포함돼 되돌리면 함께 원상복구된다.
