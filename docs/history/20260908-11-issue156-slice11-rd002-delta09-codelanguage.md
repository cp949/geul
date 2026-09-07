# Issue #156 슬라이스11 RD-002 DELTA-09 — codeLanguage.* 네임스페이스

## 목표

`code-block-language-combobox.tsx`의 번역 대상 문구 3건만 추출한다: "Plain Text"(`LANGUAGE_OPTIONS`의 `text` 항목 label), "Code language"(입력 라벨), "Code language suggestions"(listbox aria-label). JavaScript/TypeScript/HTML/CSS/JSON/Bash/Python/Java/Kotlin/SQL/Markdown 11개 언어 고유명사는 RD-002 착수 시 확정된 결정(대부분 로케일이 프로그래밍 언어 고유명사를 번역하지 않는 관례 판단, `RD-002.md` "결정")에 따라 하드코딩 유지 — 이 DELTA는 그 결정을 실행할 뿐 재논의하지 않는다.

## 확정 커밋

- `ce77bee` — feat(core,react): codeLanguage.* dictionary 네임스페이스 배선(EXT-009)

## 변경한 계약과 파일

- `packages/core/src/dictionary.ts` — `Dictionary.codeLanguage` 네임스페이스 신설: `plainText`("Plain Text"), `label`("Code language"), `suggestionsAriaLabel`("Code language suggestions").
- `packages/react/src/code-block-language-combobox.tsx` — `useDictionary()` 추가. 입력 라벨과 listbox aria-label을 dictionary로 치환. suggestion 렌더의 `option.label`은 `option.id === "text" ? dictionary.codeLanguage.plainText : option.label`로 분기(`blockType.*`/`slashMenu.*`와 동일 패턴) — 검색 필터(`suggestions`/`activeSuggestion` 계산)는 `LANGUAGE_OPTIONS`의 고정 `label`을 그대로 쓰고 손대지 않는다.
- `packages/react/test/code-block-language-combobox.test.tsx` — override 검증 1건(검색이 override 후에도 고정 영어로 동작함을 함께 확인).

## 검증

`pnpm --filter @cp949/geul-core build` exit 0, `pnpm --filter @cp949/geul-react test` 596 passed, `pnpm --filter @cp949/geul-react build` exit 0, core/react `typecheck` exit 0, eslint/prettier 전부 clean(첫 시도부터 clean).

## RD-002 진행 상태

DELTA-09 완료. `Dictionary`에 `codeLanguage`(3건) 네임스페이스 추가. 남은 것은 DELTA-10(`error.*`/`status.*`) 하나뿐 — 완료 시 RD-002 전체 완료.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(슬라이스11)가 미완료라 슬라이스1~10 전례대로 통합 완료 시점에 한 번만 Issue #156에 게시한다.

## 남은 위험

- result 문서에 별도 기재된 남은 위험 없음.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert ce77bee`. 위험: 낮음 — 신규 네임스페이스 3개 key와 1개 파일의 렌더 텍스트 치환뿐, 검색·필터 로직은 그대로다. 체인 최신 커밋부터 역순으로 revert해야 DELTA-10과 충돌하지 않는다.
