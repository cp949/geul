---
"@cp949/geul-io": patch
---

`importHtml`이 `div`의 `white-space`와 `span`의 `white-space:pre-line`을 소스 공백 접기에 반영한다.

- `div`의 `white-space`가 `pre`·`pre-wrap`·`break-spaces`이면 하위 텍스트의 들여쓰기·연속 공백·개행을 보존한다. VS Code 복사(`<div style="white-space: pre">…`)의 들여쓰기가 더는 접히지 않는다.
- `div`·`span`의 `white-space:pre-line`은 공백 run을 한 칸으로 접고 개행을 줄바꿈으로 남긴다. 개행 앞뒤 공백은 지운다.
- 하위 요소의 `white-space:normal`·`nowrap`은 다시 접는다. `inherit`·`initial`·`unset`·`revert`·`revert-layer`·선언 없음은 부모 모드를 따른다. 무효한 선언은 브라우저처럼 버리고 앞의 유효 선언을 유지한다.
- CSS Text 4 값(`preserve`·`preserve-breaks`·`collapse`·`wrap`과 `preserve nowrap` 같은 짝)도 읽는다.
- `p`·`li`·`td` 등 다른 태그의 `white-space`는 읽지 않는다.
- `div`의 `style`은 `UNSAFE_ATTRIBUTE_REMOVED` 경고를 이전처럼 낸다.
- 저장 문서 형식은 바뀌지 않는다.
