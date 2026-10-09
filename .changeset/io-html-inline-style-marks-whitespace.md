---
"@cp949/geul-io": patch
---

`importHtml`이 외부 HTML의 인라인 스타일 서식과 소스 공백을 브라우저 렌더링 규칙대로 읽도록 고친다.

- `span`·`b`·`strong`의 `font-weight`·`font-style`·`text-decoration(-line)` 스타일을 굵게·기울임·밑줄·취소선으로 읽는다. `700`·`bold`·`600` 이상은 굵게, `italic`·`oblique`는 기울임, `underline`은 밑줄, `line-through`는 취소선이다. 마지막 선언이 이기고 `!important`·대소문자·공백은 무시한다.
- 마크는 누적만 한다. `font-weight:normal`이나 `text-decoration:none`이 바깥 요소의 마크를 지우지 않는다.
- `<del>`·`<strike>`는 취소선으로 읽는다. `<ins>`와 `p`·`div`의 마크 스타일(굵게·색 등)은 읽지 않는다. `div`의 `white-space`는 읽는다.
- 소스 개행·탭·연속 공백은 공백 하나로 접는다. `<p>one\ntwo</p>`는 `one two`다. 요소 경계를 넘어 접는다.
- 블록 양끝과 `<br>` 앞뒤의 공백은 지운다. `<br>`는 줄바꿈으로 남는다. 블록 사이 공백뿐인 텍스트는 블록을 만들지 않는다.
- NBSP는 접지도 자르지도 않는다. `<pre>`와 `white-space`가 `pre`·`pre-wrap`·`break-spaces`인 `span` 안도 접지 않는다. `pre-line`과 `div`의 `white-space`는 이후 수정(io-html-white-space-div-pre-line)이 읽는다.
- 입력에 `data-geul-block-id`나 `data-geul-cell-id`가 하나라도 있으면 문서 전체를 접지 않는다. `exportHtml`이 낸 공백이 왕복에서 보존된다. 외부 조각이 섞인 입력도 접지 않는다.
- 클립보드 표 붙여넣기도 같은 마크를 읽는다. 표 파서의 공백 접기는 이전과 같다.
- 저장 문서 형식은 바뀌지 않는다.
