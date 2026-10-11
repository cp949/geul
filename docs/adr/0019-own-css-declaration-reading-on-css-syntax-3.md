---
status: accepted
---

# CSS 선언 읽기는 CSS Syntax 3 기준으로 직접 구현한다

`packages/io`는 외부 HTML의 `style` 속성을 읽는다. 2026-10-11 기준으로 CSS 텍스트를 훑는 함수가 `style-declarations.ts`와 `css-color.ts`에 15곳 있었다. 각 함수가 문자열·괄호·url·이스케이프 규칙을 따로 구현했다. 한 함수를 Chromium에 맞추면 다른 함수와의 차이가 새 결함이 됐다. #339와 #361–#367이 이렇게 이어졌다. 그래서 CSS 선언 읽기(`CONTEXT.md`)를 module 하나로 모은다. module은 토큰, component value, 선언 목록을 돌려준다. 값 문법은 module 밖의 판독기가 읽는다. 동작 기준은 CSS Syntax 3과 Chromium의 `style` 속성 해석이다. #324가 둔 옛 정규식 호환은 버린다. 그 호환은 성능 수정의 결과 동일성 장치였고 제품 결정이 아니었다. 토큰화는 직접 구현한다. ADR-0005는 외부 라이브러리 채택을 허용한다. 하지만 후보 `@csstools/css-tokenizer@4.0.0`은 아래 비용 때문에 채택하지 않는다. 출처는 아키텍처 리뷰 05 후보 01이고, 실행은 Issue #368이 소유한다.

## 외부 토크나이저를 쓰지 않는 근거

2026-10-11 실측이다.

- 배포물에 `??` 29건과 `?.` 1건이 있다. 둘 다 Chrome 80 문법이다. ADR-0008의 Chrome 75 하한을 지키려면 사용처가 문법을 낮춰야 한다. 지금 io 런타임 의존성 중 이런 의존성은 없다.
- 2.x·3.x·4.0.2도 같은 문법을 쓴다. 옛 버전으로 피할 수 없다.
- 글자마다 `source.codePointAt(cursor)`를 부른다. G-TST-004 계측(`packages/io/test/string-workload-support.ts`)은 호출마다 문자열 전체 길이를 더한다. 실제 시간은 선형이지만 계측은 이차로 잡는다.
- ident가 2e5 code point 이상이면 `String.fromCodePoint(...arr)` spread에서 `RangeError`가 난다.
- `@csstools/css-parser-algorithms@4.0.0`은 component 수에 이차 시간이다(n=10000에서 2.1초). 1만 단 중첩에서 스택이 넘친다.

## Consequences

- module은 `packages/io/src/css/`에 둔다. `clipboard/`와 `html/`이 이 폴더를 import한다. 반대 방향은 없다(ADR-0011).
- 토큰화는 입력을 대괄호(`value[i]`)로 읽고 선형 시간을 지킨다. 재귀 없이 component value를 묶는다.
- `@csstools/css-tokenizer`는 io devDependency로만 둔다. 테스트에서 토큰 종류와 경계의 비교 기준으로 쓴다. 런타임 코드는 import하지 않는다.
- 값 문법의 한계(함수 인자 검증, 치환 추적, hsl 반올림, background 위치 검증)는 이 결정의 범위가 아니다.
- 다시 볼 조건: Chrome 하한이 80 이상이 될 때, 또는 G-TST-004 계측이 String 메서드 호출 길이 합을 세지 않게 바뀔 때.
