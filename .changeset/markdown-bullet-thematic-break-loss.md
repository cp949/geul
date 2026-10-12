---
"@cp949/geul-io": patch
---

markdown strict 내보내기가 빈 bulletListItem의 마커 줄이 thematic break로 읽히는 두 모양을 `MARKDOWN_LOSS_NOT_ALLOWED`로 거절하고, lossy 내보내기가 같은 경고를 낸다.

- 첫 자식이 divider인 빈 bulletListItem: 마커가 `-`이면 `- ---`가 재가져오기 때 thematic break 한 줄이 된다. 앞 형제가 checkListItem·toggleListItem일 때 `-`가 나온다.
- 첫 자식 사슬로 3단 이상 이어지고 끝이 자식 없는 빈 bulletListItem: `* * *`가 thematic break 한 줄이 된다. 마커와 무관하다.
- 경고 kind는 기존 `NESTED_CHILDREN`을 재사용한다. 메시지만 모양별로 다르다. `MarkdownLoss` 타입은 바뀌지 않는다.
- 사슬은 3단 이상이 시작되는 블록마다 1건이다. 4단은 2건이다.
- divider 항목은 모양만 본다. 마커가 `*`라 안전한 `* ---`도 거절한다.
- `numberedListItem`·`quote`의 divider 자식과 2단 사슬은 대상이 아니다.
- lossy 출력은 바뀌지 않는다. 경고만 더해진다.
- toggleListItem·checkListItem이 낀 사슬은 기존 `TOGGLE_STATE_LOST`·`CHECKED_STATE_LOST`가 먼저 잡는다. 이 경고는 더하지 않는다.
