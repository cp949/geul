# Issue #38 슬라이스 3 — H4-H6, 인용문, 구분선

## 목표

R2 기본 블록 parity의 세 번째 vertical slice로 H4-H6, 인용문, 구분선을 저장 모델부터 편집 UI와 HTML/GFM 변환까지 연결한다.

## 확정 커밋

- `f74e054` `feat(model): H4-H6·인용문·구분선 저장 계약을 추가한다`
- `19c41b9` `feat(editor): H4-H6·인용문·구분선 편집 표면을 구현한다`
- `5aab396` `feat(io): H4-H6·인용문·구분선 HTML 변환을 구현한다`
- `148d091` `feat(io): H4-H6·인용문·구분선 GFM·clipboard 변환을 구현한다`
- `91c78a5` `test(e2e): 새 블록 UI·스타일을 검증하고 제품 상태를 갱신한다`
- `58f3204` `fix(io): 중첩 HTML의 지원 블록 경계를 보존한다`
- `5f856a1` `docs(guides): 비포장 PM 블록 노드 계약을 보강한다`

## 변경한 계약과 파일

- model: `HeadingBlock.level`을 1~6으로 확장하고 `QuoteBlock`·`DividerBlock` 타입과 검증을 추가했다.
- core: quote/divider PM 노드, model↔PM 왕복, quote 종류 변경·split/join/placeholder, `insertDivider`, divider 명령·selection 정합을 추가했다.
- io: HTML `h4`~`h6`/`blockquote`/`hr`, GFM heading depth 4~6/blockquote/thematic break, clipboard heading 4~6을 매핑했다. 안전 조상과 heading 안의 지원 블록 경계도 보존한다.
- react/e2e: Heading 4~6·Quote·Divider 메뉴와 스타일을 추가하고 Chromium에서 divider hover, slash-menu clamp와 계산 스타일을 검증한다.
- product: `BLK-003=VERIFIED`, `BLK-005=PARTIAL`, `BLK-006=PARTIAL`, `UI-009=PARTIAL`로 갱신하고 다음 작업을 슬라이스 4 코드 블록으로 지정했다.
- guide: `G-EDT-003`에 비포장 그룹 멤버의 id·DOM·인접 selection·공개 command 계약과 priority 동률/변이 규칙을 추가했다.
- 외부 런타임 의존성 변경 없음.

## 검증

- 트랙-5 완료 체크리스트 85/85 `PASS`.
- 트랙-6 최종 `pnpm verify`: lint, format, build, escompat, 전체 typecheck, unit test 123 files / 1,482 tests, package boundary, license, Chromium E2E 90/90 통과.
- 트랙-8 재그룹화: 6개 커밋 경계마다 `pnpm typecheck` 통과. 원본 작업 tip과 재조립 tip의 tree diff 0.
- 트랙-8 문서 검증: `pnpm lint`, `git diff --check` 통과.

## 남은 제한

- quote `TextBlockProps`는 슬라이스 8, quote/list `children` GFM 표현 재평가는 슬라이스 5, quote/divider clipboard 의미 계약은 슬라이스 10 범위다.
- Issue #38은 슬라이스 4~11과 7a·7b가 남아 있어 열어 뒀다.

## 등록

- Issue #38에 슬라이스 3 완료 댓글 등록: `issuecomment-5459289679`.
- Issue #138: 중첩 위치의 표 인접 Backspace/Delete 데이터 손실 경로.
- Issue #139: HTML import의 거짓 `SAFE_BLOCK_DOWNGRADED` 경고.
