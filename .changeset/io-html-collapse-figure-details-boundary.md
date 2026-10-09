---
"@cp949/geul-io": patch
---

`importHtml`이 블록 경계에서 단어를 붙이던 결함을 고친다. 소스 공백 접기가 경계 양쪽 공백을 지운 뒤, 경계를 구분자 없이 이어 붙이던 경로들이다.

- `figure`·`figcaption`·`details`·`summary`는 미디어·codeBlock·toggle로 읽히지 않으면 `div`처럼 문단 경계다. `<div>Intro <figure>Figure body</figure> outro</div>`는 문단 셋(`Intro`·`Figure body`·`outro`)이다. 이전에는 `IntroFigure bodyoutro` 한 문단이었다.
- 표 셀 안 블록 요소(`p`·`div`·`pre`·제목·목록·`figure` 등) 경계는 줄바꿈 하나가 된다. `<td><p>a</p><p>b</p></td>`는 `a`·줄바꿈·`b`다. 이전에는 `ab`였다.
- `div`·`figure`·`details` 안 `blockquote`의 텍스트가 인용 content가 된다. 이전에는 `div` 안이면 content가 비고 텍스트가 자식 문단으로 내려갔다.
- 제목 안 `figure`·`details`는 `div`와 같이 제목을 문단으로 나눈다(`<h2>a<figure>b</figure>c</h2>` → 문단 셋).
- 클립보드 표 파서(`parseClipboardTable`)는 바뀌지 않는다. 셀 안 `<p>a</p><p>b</p>`는 여전히 `ab`다.
- 한계: 제어문자만 든 셀 안 블록은 셀 끝에 빈 줄을 남긴다. 셀 경계 줄바꿈에는 마크가 붙지 않는다.
