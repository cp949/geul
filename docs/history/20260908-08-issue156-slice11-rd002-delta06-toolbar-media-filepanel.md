# Issue #156 슬라이스11 RD-002 DELTA-06 — toolbar.media·toolbar.filePanel 네임스페이스

## 목표

`toolbar.*`는 RD-002.md 원안에서 6개 파일(`editor-content.tsx`는 이미 DELTA-01에서 처리, 나머지 `formatting-toolbar.tsx`/`link-toolbar.tsx`/`media-toolbar.tsx`/`file-panel.tsx`/`table-selection-toolbar.tsx`/`block-selection-toolbar.tsx`)을 하나의 네임스페이스로 묶은 계획이었다. readiness probe 진행 중 6개 파일을 한 DELTA로 묶기엔 diff가 크다고 판단해 이 DELTA(media/filePanel)와 DELTA-07(link/tableSelection/blockSelection/formatting 컨테이너)로 분할했다(RD-002.md "예상 DELTA"는 "확정 아님, 언제든 추가·삭제·수정" 조항에 따라 갱신됨).

이 DELTA는 `media-toolbar.tsx`(16건)와 `file-panel.tsx`(11건)를 함께 처리한다 — 둘 다 동일한 `kindLabel(kind)`(`MediaBlockKind`를 대문자화하는, 완전히 중복된 로컬 함수) 패턴을 공유하고, "{kind} name"/"{kind} URL"/"{kind} file" 같은 동적 aria-label 조합도 같은 모양이기 때문이다.

## 확정 커밋

- `4a5bf35` — feat(core,react): toolbar.media/toolbar.filePanel dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.toolbar` 최상위 네임스페이스 신설. 이 DELTA는 `toolbar.kindNames`(공유, file/image/video/audio 4개 — 두 파일의 중복 `kindLabel` 대체)와 `toolbar.media`/`toolbar.filePanel` 두 하위 네임스페이스를 채운다. `{kind}` 토큰은 `placeholder.heading`의 `{level}` 선례와 동일하게 문자열 치환으로 처리(별도 헬퍼 함수 없음).
  - `toolbar.media`: ariaLabel, replace(AriaLabel), rename, editCaption(AriaLabel)/caption, preview, align×3, delete(AriaLabel), download, nameInputAriaLabel/captionInputAriaLabel(`{kind}` 템플릿), save 계열, cancel, replaceFileInputAriaLabel(`{kind}` 템플릿), retry.
  - `toolbar.filePanel`: ariaLabel, sourceAriaLabel, embedTab, uploadTab, urlInputAriaLabel(`{kind}` 템플릿), saveUrl/save, namePrefix, fileInputAriaLabel(`{kind}` 템플릿), cancel, retry, close(AriaLabel).
- `packages/react/src/media-toolbar.tsx`/`file-panel.tsx` — 완전 중복이던 로컬 `kindLabel` 함수를 각각 제거하고 `dictionary.toolbar.kindNames`로 통합, 각 파일의 문구 전부(16건/11건) 배선(aria-label≠텍스트 쌍은 media 3쌍, filePanel 2쌍 — 별도 key로 분리).
- `packages/react/test/{media-toolbar,file-panel}.test.tsx` — override 검증 3건(컨테이너, aria-label≠텍스트 쌍, `{kind}` 템플릿 치환).

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 589 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean.

## RD-002 진행 상태

DELTA-06 완료. `Dictionary.toolbar`(`kindNames`/`media`/`filePanel`) 신설, 두 파일의 완전 중복 `kindLabel` 함수 제거. 남은 것은 DELTA-07(`toolbar.*` 나머지 4개 컨테이너)~10(handle/codeLanguage/error·status).

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- `toolbar.*` 나머지(link/tableSelection/blockSelection/formatting 컨테이너)는 DELTA-07 소관으로 남는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 4a5bf35`. 위험: 중간 — `media-toolbar.tsx`(77줄)/`file-panel.tsx`(41줄)에서 중복 함수를 제거하고 다수 지점을 dictionary 참조로 바꾼 다중 파일 리팩터링이다. 체인 최신 커밋부터 역순으로 revert해야 DELTA-07 이후와 충돌하지 않는다.
