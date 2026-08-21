# PIT-0022 테스트 헬퍼는 두 번째 파일에서 복제하지 말고 공용 모듈이 단독 소유한다

- 상태: `ACTIVE`
- 적용 영역: react, test
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

- **두 번째 파일이 같은 헬퍼를 필요로 하는 순간 공용 모듈로 올린다.** 사본 2벌이 임계값이다 — 3벌이 될 때까지 기다리지 않는다. `packages/react/test/`의 공용 모듈은 `mount-editor.tsx`(마운트와 캐럿·문서 조작)와 `query-mounted-editable.ts`(편집 영역 획득)다.
- **다른 테스트 파일 이름을 인용하는 주석을 쓰지 않는다.** 행 번호 인용은 특히 금지한다 — 인용 대상이 움직여도 아무것도 실패하지 않는다. 기법의 근거를 적을 필요가 있으면 그 기법을 공용 모듈로 올리고, 근거는 그 모듈의 주석이 단독으로 소유한다. `query-mounted-editable.ts`가 표준 형태다.
  - 예외 1: 파일 **책임 경계**를 알리는 안내(`핸들 클릭 메뉴는 table-handle-menu.test.tsx가 맡는다`)는 심볼을 인용하지 않아 갈라지지 않는다. 이건 유지한다.
  - 예외 2: 공용 모듈의 계약 테스트가 **누가 그 전제에 기대는지** 밝히는 주석은 유지한다. 원본이 소비자를 가리키는 방향이라 사본이 원본을 가리키는 이 함정과 반대이고, 그 계약 테스트가 왜 존재하는지를 설명하는 유일한 근거다.
- **공용 모듈이 소유하는 주석은 호출부 표현에 매이지 않게 쓴다.** 사본을 합칠 때 각 파일의 로컬 헬퍼 이름(`fireCaretUpdate`, `triggerSelectionChange`)이나 UI 이름("툴바 버튼")을 그대로 옮기면 다른 호출부에서 뜻이 어긋난다.
- **옮긴 주석이 주장하는 규칙은 실측으로 확인한다.** 사본이 여럿일 때는 각 주석의 주장 범위가 그 파일로 좁았지만, 공용 모듈로 올리는 순간 모든 호출부에 대한 권위가 된다. 실측하지 않은 주장을 단독 소유 문서에 넣지 않는다.
- **파일 단위 전환 작업은 마지막에 전체 브랜치 리뷰를 반드시 한 번 돌린다.** 개별 Task 리뷰로는 이 결함을 잡을 수 없다는 것이 #76에서 실증됐다.

## 검증 방법

전환 작업을 닫기 전에 실행한다.

```bash
# 1. 같은 이름의 로컬 헬퍼가 여러 파일에 정의돼 있는지 (공용 모듈의 export도 포함)
grep -rhoP '^(export )?const \K\w+' packages/react/test/*.ts packages/react/test/*.tsx | sort | uniq -d

# 2. 다른 테스트 파일을 이름으로 가리키는 주석
grep -rn "test\.tsx[의와가]" packages/react/test/

# 3. 행 번호까지 인용하는 주석 (가장 나쁜 형태)
grep -rnE "test\.(tsx|ts):[0-9]+" packages/react/test/
```

1번은 `*.test.tsx`뿐 아니라 공용 모듈(`mount-editor.tsx`, `query-mounted-editable.ts`)도 대상에 넣고, `const`뿐 아니라 `export const`도 잡는다. 좁은 원래 형태(`^const`, `*.test.tsx`만)는 이 함정이 잡으려는 재발 형태 — 테스트 파일이 공용 모듈이 이미 export하는 헬퍼를 다시 정의하는 것 — 를 통과시킨다. 재정의 뒤에는 `*.test.tsx` 안에 정의가 하나만 남고 공용 모듈의 `export const`는 애초에 glob 밖이라, `uniq -d`가 볼 이름이 하나뿐이라 절대 걸리지 않는다.

1번은 **이름 기반**이라 본문이 같아도 이름이 다르면 잡지 못한다는 한계가 있다. `slash-menu.test.tsx`의 `fireCaretUpdate`와 `table-selection-toolbar.test.tsx`의 `triggerSelectionChange`는 본문이 `act(() => { document.dispatchEvent(new Event("selectionchange")); });`로 바이트 단위 동일하지만 이름이 달라 1번을 통과한다 — 1번이 깨끗해도 중복이 없다는 증거로 삼지 않는다.

1번이 잡은 이름은 본문이 같은지 대조한다. 본문이 같으면 공용 모듈로 올린다. 2026-08-21 기준(커밋 `66a318d`) 이름 10개를 잡으며, 그 시점의 본문 대조 결과와 이름별 처리 방침은 Issue #84가 단독 소유한다 — 여기에 복제하지 않는다.

2번은 같은 시점 17**줄**을 잡는다(`packages/react/test/`). 매번 전부 다시 분류한다 — 아래는 그 시점의 기준선이지 불변값이 아니다.

- `afterEach(cleanup)` 설명 주석 복제 9줄 — Issue #84가 정리를 소유한다.
- 파일 **책임 경계** 안내(위 예외 1) 3줄 — 유지한다.
- 다른 파일 심볼을 기법 근거로 인용 3줄 — Issue #84가 정리를 소유한다.
- `mount-editor.test.tsx`의 하류 의존 전제 고정 주석(위 예외 2) 1개가 2줄에 걸쳐 잡힌다 — 유지한다.

**분류 수를 셀 때는 grep이 세는 단위(줄)로 센다.** 주석 1개가 여러 줄에 걸치면 그만큼 여러 줄로 잡힌다 — 위 합이 17이 되는 것은 마지막 항목이 2줄이기 때문이고, 주석 개수로는 16이다. 두 단위를 섞으면 합만 맞고 항목별 수가 틀린 기준선이 만들어진다(실제로 한 번 그렇게 됐다).

2번이 잡은 줄은 위 예외 1·2에 해당하는지 하나씩 판단하고, 아니면 기법을 공용 모듈로 올린다. 3번은 예외 없이 전부 제거한다.

추출 후에는 순수 이동임을 테스트 제목 목록으로 확인한다 — 개수만 세면 제목이 바뀐 것을 놓친다.

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
- Issue #81은 완료 기준으로 `grep -rn "test.tsx의" packages/react/test/` 0곳을 스스로 정했지만, 이슈 자신의 범위(세 헬퍼 이동) 안에서는 도달하지 못했다 — 없앤 것은 `slash-menu.test.tsx:77` 1곳뿐이고 나머지는 남았다(이후 Issue #84로 분리). **이 결함 클래스는 완료 기준을 스스로 세운 작업 안에서도 스스로 못 지킬 만큼 잘 숨는다** — 파일 단위 시야로는 grep 결과 자체를 다 정리할 범위인지 아닌지도 그 자리에서 판단하기 어렵다는 뜻이다.

## 관련 문서

- [PIT-0014 jsdom 테스트 fake는 contentEditable IDL 대신 속성으로 세운다](./PIT-0014-set-contenteditable-attribute-in-jsdom-fakes.md)
- [PIT-0017 document.body에 직접 붙인 테스트 노드는 finally에서 정리한다](./PIT-0017-clean-up-body-appended-test-nodes-in-finally.md)
- Issue #84 — react 테스트 9개 파일의 `afterEach(cleanup)` 설명 주석 복제와 나머지 교차 파일 심볼 인용 정리
- Issue #85 — `placeCaret`의 2단계 `selectionchange` 규칙이 실측상 시나리오 의존적임을 확정하는 후속 조사
