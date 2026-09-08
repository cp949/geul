# Issue #162 BLK-017 RD-001 DELTA-01 — SyntaxHighlighter 타입 + prosemirror-highlight 동기 배선

## 목표

RD-001(core 구문 강조 seam + prosemirror-highlight 배선)의 첫 DELTA. spec
(`docs/specs/2026-09-08-blk-017-code-highlighting-seam-design.md`) §3의
`SyntaxHighlighter`/`SyntaxHighlightToken` 공개 타입을 `packages/core`에
신설하고, `prosemirror-highlight`(exact 0.16.0, MIT)를 내부 배관으로
채택해 `CreateEditorOptions.syntaxHighlighter`로 연결한 **동기** 파서
함수가 코드 블록에 실제로 decoration을 그리게 한다(RD-001 완료 조건 1).
비동기 경로·stale 방지(DELTA-02)와 edge case 5종·package boundary 공식
검증(DELTA-03)은 이 DELTA 범위 밖이다.

## 확정 커밋

- `88ef8bc` — feat(core): 코드 블록 구문 강조 seam 타입 신설 +
  prosemirror-highlight 동기 배선

## 변경한 계약과 파일

- `packages/core/package.json` — `prosemirror-highlight: "0.16.0"`을
  `dependencies`에 추가(exact version, 2026-09-08 조사 시점 최신·MIT
  재확인).
- `docs/product/dependency-licenses.md` — `prosemirror-highlight` 행
  추가(용도: PM decoration 연결 배관, 하이라이터 아님).
- `packages/core/src/syntax-highlight.ts`(신규) — 공개 타입
  `SyntaxHighlightToken`(`from`/`to`/`className?`)·`SyntaxHighlighter`
  (spec §3 shape). PM·`prosemirror-highlight` 타입을 참조하지 않는다
  (ADR-0002).
- `packages/core/src/code-block-highlight-extension.ts`(신규) — 비공개
  Tiptap `Extension`(`CodeBlockHighlightExtension`, `index.ts`가 재수출
  하지 않음). 내부 어댑터 `createParserFromHighlighter`가
  `SyntaxHighlighter`를 `prosemirror-highlight`의 `Parser` 계약
  (`{content,pos,language,size} => Decoration[] | Promise<void>`, 실측
  0.16.0 `dist/types-*.d.ts`)으로 감싼다. 동기 반환(배열)만
  `Decoration.inline(pos + 1 + from, pos + 1 + to, {class})`로 변환하고,
  Promise 반환은 이 DELTA에서 빈 배열로 취급한다(DELTA-02가 대체).
  `createHighlightPlugin`의 `nodeTypes`(`['code_block','codeBlock']`)·
  `languageExtractor`(`node => node.attrs.language`) 기본값이 geul
  codeBlock 스키마와 이미 일치해 별도 `configure` 없이 그대로 쓴다.
- `packages/core/src/editor-controller-types.ts` —
  `CreateEditorOptions.syntaxHighlighter?: SyntaxHighlighter` 필드
  추가(`dictionary`와 동일 자리·패턴).
- `packages/core/src/production-editor-session.ts`/
  `production-editor-assembly.ts` — `syntaxHighlighter` 옵션을
  `attributeOverrides`/`dictionary`와 동일한
  `...(x === undefined ? {} : {x})` 관용구로 매 재구성(`replaceDocument`
  포함)마다 전달, `production-editor-assembly.ts`는 지정된 경우에만
  `CodeBlockHighlightExtension.configure(...)`를 extensions 배열에
  포함한다.
- `packages/core/src/index.ts` — `SyntaxHighlighter`/`SyntaxHighlightToken`
  공개 export 추가.
- `packages/core/test/code-block-highlight-extension.test.ts`(신규) —
  동기 파서 연결 시 decoration 적용, 미연결 시 plain text 유지(무회귀)
  두 characterization.

## 검증

- RED: 동기 `syntaxHighlighter` 연결 테스트가 배선 전 강조 `span`을
  찾지 못해 실패 확인(`expected undefined to be 'const'`).
- GREEN: `pnpm --filter @cp949/geul-core test` 141 files/1630 tests
  passed(회귀 0건, 기준선 대비 신규 파일 1개·신규 테스트 2개),
  `pnpm --filter @cp949/geul-core typecheck` exit 0,
  `pnpm --filter @cp949/geul-core build` exit 0,
  `pnpm check:licenses`("License allowlist verified across 7 manifests
  and 145 external transitive production packages"),
  `pnpm check:boundaries`("Package boundaries verified across 8
  manifests and 14 public core declarations"),
  `pnpm check:escompat`(Chrome ≥75 기준 213개 파일 통과),
  eslint(변경 파일 대상 clean)·prettier(3개 파일 미포맷 → `--write` 후
  재검증 clean).
- 재조립(ff-workflow "재그룹화 실행 명령"): 단일 커밋이라 그룹 1개,
  `git diff <pre-squash> <tip> --stat` 빈 출력으로 무결성 확인, `dev`에
  `--ff-only` 병합 성공.

## RD-001 진행 상태

DELTA-01 완료로 RD-001 완료 조건 1("동기 파서 함수를 연결하면 코드
블록에 decoration이 적용된다")·조건 3("파서 함수를 연결하지 않으면
plain text로 렌더된다")을 충족(증거는 위 GREEN 테스트 2건). 조건
2(비동기·stale 방지)·4(edge case 5종)·5(package boundary 공식 검증)는
미충족으로 남았다. RD-001은 `ACTIVE` 유지. 다음 DELTA(백로그, 확정
아님): DELTA-02 — 비동기 파서 경로 + stale-비동기 회귀 테스트.

## 등록한 이슈

없음.

## 게시

없음 — roadmap 전체(RD-001~003)가 미완료라 Issue #156 슬라이스1~11
전례대로 통합 완료 시점에 한 번만 Issue #162에 게시한다.

## 남은 위험

- 어댑터가 Promise를 받으면 빈 배열을 돌려주는 임시 동작은 의도된
  것이다 — DELTA-02가 대체할 때까지 소비자가 비동기 하이라이터를
  연결하면 조용히 강조가 나타나지 않는다(에러 없음). spec §5의
  "미연결 시 plain text"와 겉보기 동작이 같아 사용자에게 오해를 주지
  않는다.
- push·tag·PR·`dev` → `main` 병합은 실행하지 않았다.

## rollback

`git revert 88ef8bc`. 위험: 낮음 — 이 커밋 하나가 RD-001 결과 전체의
유일 착수 지점이라 이후 DELTA가 아직 이 위에 쌓이지 않았다(다음
DELTA는 이 세션 이후).
