# 20260905-06 Issue #154 미디어 정렬 명령·toolbar 신설

## 목표

spec §6.2(media 정렬 toolbar 항목)와 §5.1(명령 목록)의 불일치를 해소한다 — image/video 미디어 블록의 `textAlignment`를 편집 중 설정하는 core 명령이 없었다.

## 확정 커밋 해시

`dec9fb9` (feat/154-media-text-alignment → dev fast-forward)

## 바꾼 계약과 파일

- `packages/core/src/editor-controller.ts` — `setMediaTextAlignment(blockId, "left" | "center" | "right" | null)` 명령 신설(image/video만 허용, audio/file은 `MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED`로 거절, `null`은 속성 제거). `getSelectionMediaBlock()`에 `textAlignment` 필드 추가.
- `packages/core/src/errors.ts` — `EditorError`에 `MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED` 추가.
- `packages/react/src/media-toolbar.tsx` — image/video 전용 정렬 버튼 3개(좌/중/우, `aria-pressed`, 같은 값 재클릭 시 해제).
- `docs/specs/2026-09-04-r3-file-media-parity-design.md` §5.1·§8 — 신규 명령·에러 코드 반영.
- `docs/product/blocknote-free-feature-inventory.md` — `MED-009`(이미지·비디오 텍스트 정렬) `VERIFIED` 신규 행, `BLK-014`/`BLK-015` 서술 갱신.
- 테스트: `editor-controller-media-commands.test.ts`, `editor-controller-selection.test.ts`, `media-toolbar.test.tsx`, `slash-menu.test.tsx`(collateral 단언 갱신), `e2e/media-toolbar.spec.ts`.

## 실행한 검증과 결과

- `pnpm --filter @cp949/geul-core test` — 104 files, 1459 tests, 전부 PASS.
- `pnpm --filter @cp949/geul-react test` — 33 files, 495 tests, 전부 PASS.
- `pnpm --filter @cp949/geul-core typecheck` / `pnpm --filter @cp949/geul-react typecheck` — 각 패키지 복합 스크립트(PIT-0038) 그대로 실행, 통과.
- `pnpm test:e2e --project=chromium -g "media"` — 신규 5개 격리 실행 전부 PASS. 배치 실행에서 관측된 `insertFilledImage` 고정 timeout flake(이 diff 무관, 기존 테스트도 동일 비율 포함)는 `CI=true`(retries:2) 재현으로 무관함을 확인.
- 결함 탐지(읽기 전용 subagent, G-EDT-001·PIT-0038·공개 계약 파급 기준): 확정 결함 없음.
- `pnpm verify` 전량 — exit 0(E2E chromium 183 passed 포함).

## 남은 제한

- media 편집 DOM 시각 투영(`text-align` 스타일)은 이 작업 범위 밖이다 — 텍스트 블록의 `textColor`/`backgroundColor`/`textAlignment`(`INL-008`~`011`)도 편집 DOM 시각 렌더 없이 `VERIFIED`인 저장소 전역 컨벤션과 동일(`block-container-extension.ts`·`media-block-extension.ts` 주석). HTML/GFM round-trip은 Issue #152 슬라이스6 소유로 이 작업에서 손대지 않았다.

## 등록한 이슈 번호

없음(신규 이슈 없음). 대상 이슈 #154는 이 작업으로 종료. Issue #152에 크로스 레퍼런스 댓글(슬라이스6 참고용)만 남겼다.
