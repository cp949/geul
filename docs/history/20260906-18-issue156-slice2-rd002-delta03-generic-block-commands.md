# Issue #156 슬라이스2 RD-002 DELTA-03 — core generic-block-commands.ts에 top-level CustomBlock 반영

## 목표

roadmap-workflow RD-002의 세 번째 DELTA. `generic-block-commands.ts`가 자체 보유한 module-local `findBlockInTree`(block-tree.ts와 별개 중복 구현, ~20곳 소비)를 `DocumentBlock` 기준으로 정리한다.

## 확정 커밋

- `450c320` — feat(core): generic-block-commands.ts에 top-level CustomBlock 반영

## 변경한 계약과 파일

- `packages/core/src/generic-block-commands.ts` — module-local `findBlockInTree`의 파라미터를 `DocumentBlock`으로 넓히고, 찾은 블록이 `isKnownBlockType`이 아니면 `null`(BLOCK_NOT_FOUND와 동일 판정 경로)을 반환한다(DELTA-02의 `updateBlockInTree`와 동일 근거 — 이 파일의 명령은 전부 알려진 14종 전용 계약). 반환 타입은 `Block` 기반 그대로라 이 함수를 쓰는 나머지 ~19곳은 무변경. `findBlockDepth`/`resolveBlockSelectionRange`는 순수 위젠. `moveBlockBefore`의 "문서 맨 끝으로 이동" 분기만 `session.document.blocks`를 `as Block[]`로 캐스트(length·참조 비교만 쓰는 자리라 안전).

## 검증

- `pnpm --filter @cp949/geul-core test`(전체) — 110/111 파일, 1546 tests passed(변화 없음, 회귀 없음). `public-types.test.ts` 1건은 DELTA-04 대상 나머지 파일 에러로 계속 실패(범위 밖).
- `pnpm --filter @cp949/geul-core typecheck` — `generic-block-commands.ts` clean. 남은 에러는 `production-editor-session.ts`(2)·`model-to-tiptap.ts`(2)·`table-model-codec.ts`(1)·`document-id-factory.ts`(1)·`clipboard-paste-extension.ts`(1)뿐.
- post-fix mutation: 생략 — 신규 가드가 module-private 함수 안에 있고 런타임으로 아직 도달 불가(CustomBlock이 실제 세션에 존재할 수 없음, `model-to-tiptap.ts`가 아직 지원하지 않음), DELTA-02가 이미 동일 패턴을 격리 테스트로 검증했다.

## 등록한 이슈

없음.

## 남은 제한

- `model-to-tiptap.ts`/`production-editor-session.ts`/`table-model-codec.ts`/`document-id-factory.ts`/`clipboard-paste-extension.ts`(DELTA-04)가 이어진다 — CustomBlock의 PM 표현 미설계, `EDITOR_FEATURE_UNAVAILABLE` 패턴 채택 여부 결정 필요.
- `pnpm --filter @cp949/geul-core typecheck`/`pnpm verify`는 DELTA-04까지 끝나야 다시 통과한다.
- GitHub Issue #156에는 댓글을 게시하지 않았다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 450c320`. 위험: 낮음 — 공개 계약 변경 없음, 내부 가드 추가뿐.
