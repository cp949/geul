---
"@cp949/geul-io": patch
---

외부 HTML의 `style` 속성 선언 읽기가 Chromium과 같아진다.

- 속성 이름 앞에 이름 글자가 붙은 선언은 읽지 않는다. `x color:red`, `x1color:red`, `x font-weight:bold`, `_white-space:pre`가 대상이다. 이전에는 쓰레기 글자를 무시하고 `color`·`font-weight`·`white-space`를 읽었다. Chromium은 선언을 버린다.
- 공백은 CSS 공백(SP·TAB·LF·CR·FF)만 걷는다. NBSP는 이름·값 글자다. `color:`(NBSP)`red`는 이전에 글자 빨강이었고 이제 글자색이 없다.
- 값에 bad url이 있으면 그 선언을 통째로 버린다. `color:red;background-color:blue;background:url(it's.png)`는 이전에 배경이 지워졌고 이제 배경 파랑이다. `background:url(a b.png) red`는 이전에 배경 빨강이었고 이제 배경이 없다.
- 이름 안 이스케이프를 읽는다. `color:red;background:\75rl(it's.png);color:blue`는 이전에 글자 빨강이었고 이제 글자 파랑이다.
- `text-align`의 `!important`를 읽는다. 표 셀 붙여넣기에서 `text-align:center !important`가 정렬 center가 된다. 이전에는 정렬이 없었다.
- `text-decoration`·`text-decoration-line`·`font-style` 값을 CSS 토큰 단위로 읽는다. `)` 뒤에 붙은 유효 토큰(`underline calc(1px)red`)은 이전에 선언이 무효라 앞의 값을 지켰고 이제 밑줄이다. `underline --é(1px)`처럼 비ASCII·이스케이프 이름의 사용자 정의 함수 호출은 이전에 무효였고 이제 장식을 끈다. 따옴표 안의 `--f(`·`var(`(`underline "a --f(1px)"`)는 이전에 장식을 껐고 이제 무효라 앞의 값을 지킨다. 최상위 `{}` 블록은 무효다.
- `font` 줄임·`font-weight`·`white-space` 값을 CSS 토큰 단위로 읽는다. 주석은 낱말을 가르고(`white-space:preserve/**/nowrap`은 보존), 키워드는 이스케이프를 푼 이름으로 읽는다(`font-weight:b\6fld`는 굵게, `white-space:pre\-wrap`은 보존). 입력 끝 `\`는 글꼴 이름 글자다(`font:bold 12px a\`는 이전에 무효였고 이제 굵게). 크기 뒤 따옴표 문자열은 공백 없이 붙어도 낱말이다(`font:bold 12px"a"`는 이전에 무효였고 이제 굵게). NBSP·U+3000은 `white-space` 낱말을 가르지 않는다(`white-space:preserve`(NBSP)`nowrap`은 이전에 보존이었고 이제 무효라 앞의 값을 지킨다). DEL은 글꼴 이름 글자가 아니다(`font:bold 12px a`(DEL)는 이전에 굵게였고 이제 무효). 이스케이프로 쓴 예약어 글꼴 이름(`font:bold 12px \69nherit`)은 이전에 유효였고 이제 무효다.
