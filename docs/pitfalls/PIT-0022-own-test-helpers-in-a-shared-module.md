# PIT-0022 테스트 헬퍼는 두 번째 파일에서 복제하지 말고 공용 모듈이 단독 소유한다

- 상태: `ACTIVE`
- 적용 영역: 전 패키지, e2e, test
- 최초 근거: Issue #50

## 상황과 징후

테스트 파일을 파일 단위로 전환하는 대규모 작업(Issue #50의 편집 영역 획득, Issue #76의 실제 편집기 마운트)에서는 새 기법이 한 파일에서 태어난다. 다음 파일이 같은 기법을 필요로 하면 그 코드를 **복사**하고, 주석에 원본 파일 이름(때로는 행 번호)을 적어 출처를 남긴다. 개별 파일의 diff만 보면 각 사본이 정당해 보이고, 테스트도 전부 통과한다.

징후는 두 가지다.

- 같은 본문의 헬퍼가 여러 파일에 있다. Issue #50에서는 마운트된 editable 노드 획득이 5벌, Issue #81에서는 `tableBlockOf` 3벌·`placeCaret` 2벌·`focusOutsideEditor` 2벌이었다.
- 주석이 다른 테스트 파일을 이름으로 가리킨다. `slash-menu.test.tsx:77`의 `table-selection-toolbar.test.tsx의 placeCaret과 같은 기법이다.`가 그 형태이고, Issue #50에서는 행 번호까지 인용해 더 나빴다.

## 근본 원인

전환 작업이 파일 단위로 쪼개지고, 각 작업의 시야가 그 파일 하나다. 파일 하나만 보는 리뷰는 구조적 중복을 **볼 수 없다** — Issue #81은 #76의 개별 Task 리뷰를 전부 통과한 뒤 최종 전체 브랜치 리뷰에서야 발견됐다.

기능 결함이 없다는 점이 이 함정을 오래 살려 둔다. 사본들이 서로 일치하는 동안에는 아무 테스트도 실패하지 않는다. 비용은 나중에 한쪽만 고쳐 갈라질 때 발생하고, 그때는 어느 쪽이 옳은지 판단할 근거가 없다.

특히 위험한 것은 **비자명한 규칙을 인코딩한 헬퍼**다. `placeCaret`은 "자신이 쏘는 `selectionchange`는 편집기 내부 상태를 동기화하고, 오버레이가 그걸 읽게 하려면 테스트가 두 번째 이벤트를 따로 쏴야 한다"는 2단계 규칙을 담는다. 이런 헬퍼의 사본이 둘이면 규칙의 주인이 둘이 되고, 규칙 자체가 맞는지 검증할 단일 지점도 사라진다.

## 예방 규칙

- **두 번째 파일이 같은 헬퍼를 필요로 하는 순간 공용 모듈로 올린다.** 사본 2벌이 임계값이다 — 3벌이 될 때까지 기다리지 않는다. 공용 모듈은 패키지마다 있다.

  - `packages/react/test/` — `mount-editor.tsx`(마운트와 캐럿·문서 조작), `query-mounted-editable.ts`(편집 영역 획득)
  - `packages/core/test/` — `table-test-support.ts`(격리 에디터·문서 fixture·셀 위치와 캐럿), `editor-controller-support.ts`(컨트롤러 계열)
  - `e2e/` — `support/demo.ts`(데모 열기, 표 삽입)

- **다른 테스트 파일 이름을 인용하는 주석을 쓰지 않는다.** 행 번호 인용은 특히 금지한다 — 인용 대상이 움직여도 아무것도 실패하지 않는다. 기법의 근거를 적을 필요가 있으면 그 기법을 공용 모듈로 올리고, 근거는 그 모듈의 주석이 단독으로 소유한다. `query-mounted-editable.ts`가 표준 형태다.
  - 예외 1: 파일 **책임 경계**를 알리는 안내(`핸들 클릭 메뉴는 table-handle-menu.test.tsx가 맡는다`)는 심볼을 인용하지 않아 갈라지지 않는다. 이건 유지한다.
  - 예외 2: 공용 모듈의 계약 테스트가 **누가 그 전제에 기대는지** 밝히는 주석은 유지한다. 원본이 소비자를 가리키는 방향이라 사본이 원본을 가리키는 이 함정과 반대이고, 그 계약 테스트가 왜 존재하는지를 설명하는 유일한 근거다.
- **공용 모듈이 소유하는 주석은 호출부 표현에 매이지 않게 쓴다.** 사본을 합칠 때 각 파일의 로컬 헬퍼 이름(`fireCaretUpdate`, `triggerSelectionChange`)이나 UI 이름("툴바 버튼")을 그대로 옮기면 다른 호출부에서 뜻이 어긋난다.
- **옮긴 주석이 주장하는 규칙은 실측으로 확인한다.** 사본이 여럿일 때는 각 주석의 주장 범위가 그 파일로 좁았지만, 공용 모듈로 올리는 순간 모든 호출부에 대한 권위가 된다. 실측하지 않은 주장을 단독 소유 문서에 넣지 않는다.
- **파일 단위 전환 작업은 마지막에 전체 브랜치 리뷰를 반드시 한 번 돌린다.** 개별 Task 리뷰로는 이 결함을 잡을 수 없다는 것이 #76에서 실증됐다.
- **탐지 결과를 "중복이 없다"의 증거로 쓰기 전에 탐지기 자신이 무엇을 놓치는지 확인한다.** 이 함정은 탐지 도구가 조용히 통과시키는 형태로 살아남는다. Issue #87은 내용 기반 탐지기를 믿고 집계를 냈지만 그 탐지기에 결함이 셋 있었고(Issue #92 실측), 그중 하나는 서로 다른 헬퍼를 같은 본문으로 보이게 만드는 오탐이었다. Issue #92의 구현 세션이 다섯을 고친 뒤 리뷰 세션이 **넷을 더** 찾았고, 그 수정이 만든 미탐 1건을 같은 세션에서 다시 잡았다 — 라운드마다 새 결함이 나왔다. 아래 "검증 방법"의 세 명령은 서로 다른 것을 놓치므로 하나만 깨끗한 것으로 닫지 않는다.
- **탐지기를 고칠 때는 반례를 먼저 코드로 쓴다.** Issue #92의 결함 9건은 전부 "이 형태를 넣으면 어떻게 되는가"를 실행해서 나왔고, 코드를 읽어서 나온 것은 하나도 없다. 헤더 주석의 "알려진 한계"는 실행해 본 것만 적는다.

## 검증 방법

전환 작업을 닫기 전에 실행한다.

```bash
# 1. 본문이 같은 헬퍼가 여러 파일에 정의돼 있는지 (이름이 달라도 잡는다)
pnpm scan:test-helpers

# 2. 다른 테스트 파일을 이름으로 가리키는 주석
grep -rnE '(test|spec)\.(tsx|ts)`?[가-힣]' packages/*/test e2e tests

# 3. 행 번호까지 인용하는 주석 (가장 나쁜 형태)
grep -rnE '(test|spec)\.(tsx|ts):[0-9]+' packages/*/test e2e tests
```

1번은 `scripts/find-duplicate-test-helpers.mjs`다. 이름이 아니라 **정규화한 본문 해시**로 비교한다. 무엇을 헬퍼로 세는지, 오탐 기준을 어디에 두는지, 알려진 한계가 무엇인지는 그 파일의 헤더 주석이 단독 소유한다 — 여기에 복제하지 않는다. 게이트가 아니라 진단 도구라 중복을 찾아도 exit 0이고 `pnpm verify`에 넣지 않는다. 잡힌 그룹은 사람이 다시 판정한다.

### 1번이 대체한 명령과 그 사각지대

예전 1번은 이름 기반 grep이었다.

```bash
grep -rhoP '^(export )?const \K\w+' packages/react/test/*.ts packages/react/test/*.tsx | sort | uniq -d
```

사각지대가 셋이고 셋 다 실측으로 확인됐다(Issue #92).

- **대상 glob이 react 전용이었다.** `packages/core/test/`는 스캔 범위 밖이다. Issue #87이 core에서 헬퍼 7종을 찾은 것은 glob을 손으로 바꿔 돌렸기 때문이지 이 명령이 core를 덮어서가 아니다.
- **`^` 앵커가 컬럼 0을 요구했다.** `describe` 안에 들여쓴 정의를 통과시킨다. Issue #87에서 `oneByOneData` 1벌, `findCellBoundaryPosition` 2벌, `placeCaretInCell` 1벌, `activeCellId` 1벌이 이 형태로 집계에서 빠졌다.
- **이름 기반이었다.** 본문이 같아도 이름이 다르면 못 잡는다. `slash-menu.test.tsx`의 `fireCaretUpdate`와 `table-selection-toolbar.test.tsx`의 `triggerSelectionChange`는 본문이 `act(() => { document.dispatchEvent(new Event("selectionchange")); });`로 바이트 단위 동일하지만 이름이 달라 통과했다.

앵커만 `^\s*`로 낮추는 것은 처방이 못 된다 — Issue #87 실측에서 core 결과가 7 → 50개가 되고 증가분이 대부분 `it` 본문 지역 변수였다. 신호가 사라진다.

**1번이 깨끗해도 중복이 없다는 증거로 삼지 않는다.** 본문 해시도 반환 규약이 다르면 놓친다. Issue #87의 `cellBoundaryPosition`은 순회 본문이 같은데 `null` 대신 throw해서 이름 기반과 본문 해시 **양쪽**을 통과했고, 헬퍼가 인코딩한 *지식*을 질의로 쓰는 grep(`grep -rn 'attrs.cellId ===' packages/core/test/`)으로 잡혔다. 헬퍼가 무엇을 안다고 주장하는지를 직접 질의하는 것이 세 번째 도구다.

### 기준선

1번이 잡은 그룹은 본문이 같은지, 같은 규칙을 각자 소유하는지 대조한다. 이 문서를 마지막으로 갱신한 커밋 기준(2026-08-22)은 다음과 같다.

| 대상 | 중복 그룹 |
| --- | --- |
| `packages/model/test` | 0 |
| `packages/io/test` | 0 |
| `packages/core/test` | 0 |
| `packages/react/test` | 4 |
| `e2e` | 1 |
| `tests` | 0 |
| 전체(디렉터리 교차 포함) | **6** |

전체가 5가 아니라 6인 것은 `sequentialIds`가 core와 react에 걸쳐 있기 때문이다 — 패키지 경계 때문에 core의 export를 react가 쓸 수 없어 별개 소유라고 Issue #87이 이미 판단했다. react 4건의 처리 방침은 Issue #84가 단독 소유한다. e2e 1건(`dragSelectCells`)은 아직 소유자가 없다.

2번과 3번의 대상은 `packages/*/test`, `e2e`, `tests` 전부다. react만 보던 좁은 형태는 `.spec.ts`를 인용하는 주석을 통과시켰고, 실제로 e2e에 기법 인용 1건과 **행 번호 인용** 1건이 그렇게 숨어 있었다(Issue #92). 패턴이 파일 이름 뒤의 한글 조사 전체와 닫는 백틱을 받는 것도 같은 이유다 — `[의와가]`만 받던 형태는 `…test.ts로`·`…test.ts는`과 백틱으로 감싼 인용(`` `x.test.ts`가 ``)을 놓쳤다.

2번은 같은 시점 34**줄**을 잡는다. 매번 전부 다시 분류한다 — 아래는 그 시점의 기준선이지 불변값이 아니다.

- `afterEach(cleanup)` 설명 주석 복제 9줄(react) — Issue #84가 정리를 소유한다.
- 다른 파일 심볼을 기법 근거로 인용 3줄(react) — Issue #84가 정리를 소유한다.
- 파일 **책임 경계** 안내(위 예외 1) 17줄 — 유지한다. react 3, core 6, io 5, model 1, e2e 2.
- 공용 모듈이 **소비자**를 가리키는 주석(위 예외 2) 3개가 4줄에 걸쳐 잡힌다 — 유지한다. `mount-editor.test.tsx` 1개(2줄), `e2e/support/demo.ts` 2개(2줄).
- 다른 **패키지**의 관례를 예로 드는 인용 1줄(`tailwind-build.test.ts`) — 유지한다. 패키지 경계를 넘는 안내라 지역 규칙으로 대체할 수 없다.

**분류 수를 셀 때는 grep이 세는 단위(줄)로 센다.** 주석 1개가 여러 줄에 걸치면 그만큼 여러 줄로 잡힌다 — 위 합이 34가 되는 것은 예외 2 항목이 주석 3개에 4줄이기 때문이고, 주석 개수로는 33이다. 두 단위를 섞으면 합만 맞고 항목별 수가 틀린 기준선이 만들어진다(실제로 한 번 그렇게 됐다).

2번이 잡은 줄은 위 예외 1·2에 해당하는지 하나씩 판단하고, 아니면 기법을 공용 모듈로 올린다. 3번은 예외 없이 전부 제거한다. 3번은 같은 시점 빈 출력이다.

### 추출 후 확인

추출 후에는 순수 이동임을 테스트 제목 목록으로 확인한다 — 개수만 세면 제목이 바뀐 것을 놓친다. 아래는 react 예시다. 대상 패키지에 맞춰 `--filter`를 바꾸고, 여러 패키지를 건드렸으면 `pnpm test`로 전량을 뜬다.

```bash
pnpm --filter @cp949/geul-react test --reporter=json --outputFile=/tmp/after.json
node -e 'const r=require("/tmp/after.json");console.log(r.testResults.flatMap(f=>f.assertionResults.map(a=>a.fullName)).sort().join("\n"))' > /tmp/after-titles.txt
diff /tmp/before-titles.txt /tmp/after-titles.txt
```

## 실제 근거

- Issue #50 — react 테스트 5개 파일이 마운트된 편집 영역 획득을 복제하고 `block-side-menu.test.tsx`의 **행 번호**를 인용했다. 커밋 `4886b27`이 `query-mounted-editable.ts`를 만들어 해결했고, 그 주석이 근거를 단독 소유하는 형태가 됐다.
- Issue #76 — 같은 전환 작업이 `tableBlockOf`·`placeCaret`·`focusOutsideEditor` 헬퍼 3개의 새 사본 7벌을 낳았다. 개별 Task 리뷰 전부를 통과했고 최종 전체 브랜치 리뷰에서 발견됐다. 즉 #50의 수정이 같은 작업 안에서 같은 결함을 다시 만들었다.
- Issue #81 — 커밋 `7da46fe`가 세 헬퍼를 `mount-editor.tsx`로 옮겼다. 기준선 165건 제목 목록 diff 0줄로 순수 이동을 확인했다. 이 과정에서 `mountTableEditor` 안에 있던 `blocks[1]` 표 블록 조회의 **네 번째 사본**도 함께 사라졌다 — 공용 모듈 자신도 같은 중복을 갖고 있었다.
- Issue #81 구현 중 — `placeCaret`의 2단계 규칙을 계약 테스트로 고정하려다 그 규칙이 시나리오 의존적임을 실측했다(`setText` 직후 구성에서는 두 번째 이벤트 없이도 오버레이가 캐럿을 본다). 사본이 둘일 때는 드러나지 않던 문제가 단독 소유로 만드는 순간 드러났다 — "옮긴 주석의 주장을 실측한다" 규칙의 근거다. 조건이 아직 다 밝혀지지 않아 Issue #85로 분리했다.
- Issue #87 — 같은 클래스의 **네 번째**다. `packages/core/test/`의 헬퍼 8종이 복제돼 있었고, 집계가 이슈 본문 → 구현 세션 → 리뷰 세션으로 가며 세 번 커졌다. `findCellBoundaryPosition`의 순회 본문은 2 → 4 → **5벌**이었고, "셀 경계 + 1" 규칙을 각자 인코딩한 곳이 4군데였다. 다섯 번째 사본은 이름과 반환 규약이 달라(`cellBoundaryPosition`, `null` 대신 throw) 이름 기반 grep도 본문 해시도 구조적으로 못 잡는 형태였다. 커밋 `460e9f4`가 `table-test-support.ts` 단독 소유로 합쳤다.
- Issue #92 — 검증 명령 1번 **자체**를 고쳤다. Issue #87이 검증 도구로만 쓰고 저장소에 남기지 않은 내용 기반 탐지기를 `scripts/find-duplicate-test-helpers.mjs`로 편입하면서 그 프로토타입의 결함 셋이 드러났다. (1) 다른 헬퍼 본문 안의 지역 변수를 헬퍼로 셌다. (2) `it.each([...])( ... )`의 두 번째 호출 그룹을 제외 범위에 넣지 않아 테스트 지역 변수를 헬퍼로 셌다. (3) 선언의 끝을 depth 0의 개행으로 판정해, `=>` 다음 줄에서 본문이 시작하면 **파라미터 목록만** 해시했다 — `renderBlockMenu`·`renderRealBlocks`·`renderRealTable`이 서로 다른 함수인데 같은 본문으로 보였다. 셋을 고치자 react+core 결과가 22그룹에서 8그룹으로 줄었고 남은 8건이 전부 실제 중복이었다. 파라미터 타입 주석을 지우고 이름을 위치 토큰으로 치환하는 정규화를 더하자 `editor-content.test.tsx`의 `externalProvider`가 `withProvider` 3벌에 붙어 4벌이 됐다 — 이름도 타입 표기도 달라 예전 1번과 단순 본문 해시가 **둘 다** 놓치던 사본이고, Issue #84의 본문 표에도 없었다.
- Issue #92 리뷰 세션 — **같은 탐지기에서 결함 4건이 더 나왔다.** 구현 세션이 다섯을 찾아 고친 뒤였다. (1) 본문이 문자열·템플릿 리터럴로 시작하면 그 리터럴을 건너뛰고 **빈 본문**을 해시했다 — 여러 줄 템플릿 fixture가 통째로 안 보이고(미탐), 앞 문자열만 다른 선언이 같은 해시로 붙었다(오탐). 여백 건너뛰기를 리터럴이 공백으로 덮인 사본에서 한 것이 원인이다. (2) `function`·`class` 본문과 설정 훅 콜백 안의 지역 선언을 헬퍼로 셌다 — 구현 세션이 고친 "중첩 지역 선언" 결함이 감싸는 것이 `const`가 아닐 때 그대로 남아 있었고, `micromark-table-patch-integrity.test.ts`의 지역 변수 1건이 실제로 집계에 들어 있었다. (3) 파라미터명 치환이 식별자를 이스케이프 없이 정규식에 넣어, `$`가 든 이름에서 정규화가 조용히 무효가 됐다. (4) `return /[{]/`를 나눗셈으로 읽어 괄호 깊이가 무너지고 **그 파일의 뒤따르는 헬퍼가 통째로** 사라졌다. 넷 다 "중복이 없다"는 잘못된 증거를 만드는 방향이다. 더해 대상 목록이 좁아지는 것을 막는 장치(`findUnlistedTestDirectories`)가 훑는 workspace 루트 자체가 리터럴이라 `pnpm-workspace.yaml`과 어긋나도 아무것도 지지 않았다 — 감시 장치의 감시 범위가 조용히 좁아지면 감시 장치가 없는 것과 같다. 지금은 회귀 테스트가 두 목록을 대조한다.
- Issue #92 리뷰 세션 — **제외 목록을 넓힌 수정이 그 자리에서 미탐을 하나 만들었다.** 위 (2)를 고치려고 `function`·`class` 토큰을 중첩 스코프로 보게 하자, 프로퍼티 이름 `class`(`editor-controller-links.test.ts:174`의 `class: null`)까지 선언으로 읽고 뒤의 아무 `{`나 블록 시작으로 잡아 42줄을 제외 범위에 넣었다. 그 안의 헬퍼는 조용히 사라진다. 오탐을 줄이는 수정은 미탐을 만드는 방향이므로, **제외 범위를 넓힐 때는 넓힌 범위가 실제 본문과 일치하는지 파일 단위로 확인한다.**
- Issue #92 — 검증 명령 2·3번의 대상을 `packages/*/test`·`e2e`·`tests`로 넓히자, react만 보던 동안 e2e에 기법 인용 1건(`table-format.spec.ts`의 `dragSelectCells`)과 **행 번호 인용** 1건(`table-keyboard-navigation.spec.ts`의 `table-keyboard-extension.test.ts:173`)이 그대로 남아 있었다. 앞의 것은 "드래그 전에 시작 셀을 클릭한다"는 규칙을 **헬퍼의 성질**로 적었는데 헬퍼 본문에는 클릭이 없었다(클릭은 호출부 8곳이 전부 한다, 실측) — 사본이 둘일 때 주석의 주장이 조용히 어긋나 있던 형태다.
- Issue #81은 완료 기준으로 `grep -rn "test.tsx의" packages/react/test/` 0곳을 스스로 정했지만, 이슈 자신의 범위(세 헬퍼 이동) 안에서는 도달하지 못했다 — 없앤 것은 `slash-menu.test.tsx:77` 1곳뿐이고 나머지는 남았다(이후 Issue #84로 분리). **이 결함 클래스는 완료 기준을 스스로 세운 작업 안에서도 스스로 못 지킬 만큼 잘 숨는다** — 파일 단위 시야로는 grep 결과 자체를 다 정리할 범위인지 아닌지도 그 자리에서 판단하기 어렵다는 뜻이다.

## 관련 문서

- [PIT-0014 jsdom 테스트 fake는 contentEditable IDL 대신 속성으로 세운다](./PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md)
- [PIT-0017 document.body에 직접 붙인 테스트 노드는 finally에서 정리한다](./PIT-0017-clean-up-body-appended-test-nodes-in-finally.md)
- Issue #84 — react 테스트 9개 파일의 `afterEach(cleanup)` 설명 주석 복제와 나머지 교차 파일 심볼 인용 정리
- Issue #85 — `placeCaret`의 2단계 `selectionchange` 규칙이 실측상 시나리오 의존적임을 확정하는 후속 조사
- Issue #87 — 같은 결함 클래스의 `packages/core/test/` 분
- Issue #91 — `editor-controller-table*.test.ts` 3파일의 fixture 계열 중복
- Issue #92 — 검증 명령 1번을 내용 기반 탐지기로 교체하고 2·3번 대상을 넓힌 작업
- `scripts/find-duplicate-test-helpers.mjs` — 검증 명령 1번의 구현. 오탐 기준과 알려진 한계를 단독 소유한다
