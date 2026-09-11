---
status: accepted
---

# 미디어 블록 url은 data:/blob: scheme을 허용한다

4종 leaf 미디어 블록(file/image/video/audio)의 `url`은 spec §3.2 원안에서 "새 정책을 만들지 않음"이라는 결정 아래 `isSupportedLinkHref`를 link mark href와 그대로 공유했다 — `https?:`/`mailto:`/`tel:`/상대경로만 허용하고 `javascript:`/`data:`/`blob:`는 전부 거부했다. 이 결정을 뒤집는다. showcase kitchen sink(00-composite)의 mock `uploadFile`이 실존하지 않는 `https://example.com/uploads/...`를 돌려줘 `<img>`가 항상 깨져 있었다(2026-09-11 사용자 보고) — 실제 백엔드 없이 업로드한 파일을 그 자리에서 렌더하려면 `data:`(파일 내용을 그대로 문서에 담음) 또는 `blob:`(브라우저 세션 내 임시 참조)가 필요하고, 두 scheme 모두 종전 정책이 명시적으로 막고 있었다.

`packages/model/src/link-policy.ts`에 media 전용 `isSupportedMediaUrl`을 새로 두고(내부적으로 `isSupportedLinkHref`와 같은 문자 검증 헬퍼를 공유하되 허용 protocol 목록만 `data:`/`blob:`를 추가해 분기), 4종 미디어 블록의 `url` 검증(`document-structure-validation.ts`)과 core의 두 media url 진입점(`production-editor-media-upload.ts`의 업로드 결과 검증, `block-attribute-commands.ts`의 `setMediaBlockUrl`)만 이 함수로 바꿨다. `isSupportedLinkHref` 자체는 그대로 남아 텍스트 link mark href(`inline-mark-commands.ts`, `model-to-tiptap.ts`, `production-editor-assembly.ts`의 Tiptap Link 확장)와 HTML import의 `<a href>` sanitize(`io/src/html/hast-properties.ts`, `import-warnings.ts`)에 계속 적용된다 — 텍스트 하이퍼링크에 `data:`/`blob:`를 허용할 이유가 없다(그릴링 결정 2026-09-11).

`blob:` url의 세션 스코프·revoke 수명 관리(페이지 새로고침·탭 종료 뒤 무의미해짐)는 geul이 보장하지 않는다 — 라이브러리 소비자 책임이다(그릴링 결정 2026-09-11, "사용처에서 알아서 할 일").

## Consequences

- 업로드 콜백이나 `setMediaBlockUrl`이 `data:`/`blob:` url을 돌려줘도 이제 문서에 그대로 저장된다. `docs/specs/2026-09-04-r3-file-media-parity-design.md` §3.2를 이 결정에 맞춰 갱신했다.
- `data:` url은 파일 전체를 base64로 문서에 인라인한다 — 저장 원본(JSON) 크기가 원본 파일 크기에 비례해 커진다. geul은 media block url 문자열 길이에 별도 상한을 두지 않는다(기존에도 `https://...`가 가리키는 실제 파일 크기를 제한하지 않았던 것과 같은 선상 — 크기 관리는 소비자 책임).
- ADR-0015(로컬 프리뷰는 저장 원본을 왕복하지 않는다)의 결정 자체(로컬 프리뷰는 여전히 `url`과 분리된 표현)는 바뀌지 않는다 — 그 ADR이 근거로 든 "`url`은 `blob:`/`data:`를 명시적으로 거부한다"는 문장만 `data:`/`blob:`에 한해 더 이상 정확하지 않다. `blob:`도 이제 구조적으로는 유효한 `url` 값이지만, `blob:` object URL은 세션이 끝나면 무의미해지는 반면 로컬 프리뷰가 원래 풀던 문제(콜백 완료 전 즉시 표시)와는 무관해 로컬 프리뷰를 `url` 필드로 흡수할 이유는 여전히 없다.
- `packages/model/test/document-media-block.test.ts`(media url 허용 형태), `document-link-policy.test.ts`(link href는 안 바뀜을 고정), `packages/core/test/editor-controller-media-upload.test.ts`·`editor-controller-media-commands.test.ts`(업로드·`setMediaBlockUrl` 성공 경로)·`production-editor-session-invalid-transaction-guard.test.ts`(무효 예시를 `blob:evil`에서 `javascript:evil`로 교체)가 이 경계를 고정한다.
