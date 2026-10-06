---
"@cp949/geul-core": patch
---

codeBlock과 텍스트 블록이 합쳐질 때 개행이 사라지거나 내용이 쪼개지던 결함을 고친다.

- 여러 줄 codeBlock을 앞뒤 문단·제목·인용에 Backspace·Delete로 합치면 개행이 줄바꿈(hardBreak)으로 남는다. 이전에는 화면은 한 줄, export는 두 줄이었고 다음 입력에서 개행이 공백으로 바뀌었다.
- divider·표를 건너뛴 Backspace의 대상이 codeBlock이면 문단이 남고 codeBlock 내용을 앞에 붙인다. 이전에는 문단이 codeBlock에 날것으로 들어가 줄바꿈 뒤가 새 블록으로 쪼개지고 블록 id와 서식을 잃었다.
- divider·표를 건너뛴 Delete로 codeBlock을 합쳐도 개행이 줄바꿈으로 남는다.
- 문단 중간부터 codeBlock 안까지 범위를 잡고 입력·삭제·Enter·붙여넣기를 하거나 codeBlock 조각을 문단으로 끌어 옮겨도 개행이 줄바꿈으로 남는다. `setText`에 개행을 넘겨도 같다.
- codeBlock에서 시작해 그 밖까지 걸친 범위에서 Enter를 누르면 범위를 지운 뒤 그 자리에서 Enter를 누른 것과 같다. 이전에는 범위만 지우고 줄을 나누지 않았다.
- 저장 문서 형식은 바뀌지 않는다. 각 조작은 undo 한 번으로 되돌아간다.
