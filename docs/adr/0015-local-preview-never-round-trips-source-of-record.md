---
status: accepted
---

# 로컬 프리뷰는 저장 원본을 왕복하지 않는다

업로드 콜백(`uploadFile`) 없이 삽입된 미디어를 화면에 즉시 보여주기 위해 로컬 전용 표시 상태(로컬 프리뷰)를 도입하기로 했다. 이 표시를 기존 `url` 필드에 담는 안을 검토했으나 기각했다 — 저장 원본의 `url`은 `isSupportedLinkHref`(`packages/model/src/link-policy.ts:19-24`)로 `https?:`/`mailto:`/`tel:`/상대경로만 허용하고 `blob:`/`data:`는 명시적으로 거부하며, 이 검증은 저장을 시도하는 시점이 아니라 매 편집 트랜잭션마다(`production-editor-session.ts`의 `onUpdate` → `readEditorDocument` → `tiptapToModel` → `parseDocument`) 실행된다. `url`에 `blob:`을 직접 넣으면 그 다음 트랜잭션에서 잡히지 않는 예외가 던져져 모델↔에디터가 영구 desync된다 — 같은 실패 패턴이 이미 `table-paste-extension.ts:22-23`, `quote-extension.ts:16`, `table-paste-commands.ts:245-247`에 다른 원인(`DOCUMENT_LIMIT_EXCEEDED` 등)으로 기록돼 있다. 따라서 로컬 프리뷰는 `url`과 완전히 분리된 표현에만 존재하고, 저장 원본으로는 절대 왕복하지 않는다 — 저장하면 사라지고 업로드 대기로 되돌아간다.

## Consequences

- 저장 시점에 로컬 프리뷰를 되돌리거나 지우는 별도 로직이 필요 없다. 애초에 저장 원본에 들어간 적이 없으므로 구조적으로 보장된다.
- 편집 중 보이던 이미지가 새로고침 후 사라지는 것은 버그가 아니라 의도된 동작이다. 사용자에게 "저장되지 않음"을 알리는 표시가 UI에 필요하다.
- 업로드는 삽입 시점(`uploadFile` 콜백)과 저장 시점(호스트가 로컬 프리뷰 목록을 조회해 자체 서버에 업로드한 뒤 URL을 채워 넣는 방식) 둘 다 허용한다 — 어느 시점에 업로드할지는 라이브러리 사용자가 정한다. 후자를 위한 조회는 pull 방식 API 하나로 충분하다: 콜백이 이미 있는 호스트는 삽입 시점에 이미 반응하고 있으므로, 이벤트/구독 방식까지 추가하면 같은 목적의 API가 중복된다.
- 이 폴백은 file/image/video/audio 네 종류 미디어 블록 모두에 동일하게 적용한다. 네 종류가 `isSupportedLinkHref`를 포함해 동일한 검증·스키마 경로를 공유하므로, 이미지만 예외로 두면 나머지 세 종류에는 원래 문제(콜백 없으면 조용히 무시)가 그대로 남는다.
- `readEditorDocument`가 검증 실패를 잡히지 않는 예외로 던져 모델↔에디터를 영구 desync시키는 기존 패턴은 이 결정의 범위 밖이다 — 별도 이슈로 추적한다.
