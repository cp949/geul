---
"@cp949/geul-core": patch
---

표 밖에서 Ctrl+Shift+V(서식 없이 붙여넣기)가 `text/html`의 서식을 넣던 결함을 고친다.

- 표 밖에서 서식 없이 붙여넣기를 하면 `text/html`이 함께 있어도 `text/plain`만 들어간다. 이전에는 Shift를 구분하지 않아 html의 서식이 들어갔다.
- Shift 없는 붙여넣기, Shift+Insert, 평문 없이 html만 있는 클립보드는 이전처럼 html을 가져온다.
- 평문 단독 클립보드의 Markdown 감지는 바뀌지 않는다. Shift는 html 분기만 건너뛴다.
- 표 형태 html·TSV(표 붙여넣기)와 파일·이미지 붙여넣기는 Shift를 구분하지 않는다.
- 표 셀 안·codeBlock 안·drop·`CellSelection`은 이전과 같다.
- 저장 문서 형식은 바뀌지 않는다.
