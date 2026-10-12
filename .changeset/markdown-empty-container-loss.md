---
"@cp949/geul-io": patch
---

markdown strict 내보내기가 두 모양을 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절하고, lossy 내보내기가 같은 경고를 낸다.

- 내용이 비고 자식이 없는 체크 항목: `CHECKED_STATE_LOST`. 체크박스를 붙일 문단이 없어 `*`만 나가고 checked가 사라진다.
- 내용이 빈 목록 항목·인용의 첫 자식이 이미지(callout 포함): `NESTED_CHILDREN`. 이미지가 mdast 문단으로 나가 재가져오기 때 own content로 뭉치고 자식이 사라진다.
- mark 없는 빈 글자 런만 가진 content(`[{ text: "" }]`)도 빈 content와 같게 판정한다. 이 입력의 lossy 출력은 빈 단락을 만들지 않아 깨진 markdown이 나오지 않는다. 이 입력은 lossy 출력이 바뀌는 유일한 경우다.
- 내용이 빈 `checkListItem`의 첫 자식이 이미지·callout·미디어이면 경고 kind가 `CHECKED_STATE_LOST`에서 `NESTED_CHILDREN`으로 바뀐다. 체크박스는 첫 자식 문단이 받으므로 유지된다.
- `NESTED_CHILDREN`·`CHECKED_STATE_LOST`의 `message` 문구가 컨테이너 모양에 맞게 바뀐다.
- 그 밖의 lossy 출력은 바뀌지 않는다. 경고만 더해진다.
- 신규 export는 없다.
