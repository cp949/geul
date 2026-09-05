# R3 파일·미디어 Parity 설계

## 1. 결정 요약

R3는 이미지, 비디오, 오디오와 파일을 문서에 추가·관리할 수 있게 한다(roadmap.md R3 사용자 결과). 핵심은 leaf 블록 4종(`file`/`image`/`video`/`audio`)을 저장 모델에 추가하고, 그 URL을 소비자 제공 upload callback(구조화 `Result` 반환) 또는 직접 URL 삽입으로 채우는 것이다. geul은 파일 바이너리를 저장하거나 파일 서버를 운영하지 않는다 — 문서에는 URL 참조만 남는다.

이 명세는 `docs/product/roadmap.md` R3 절과 `docs/product/blocknote-free-feature-inventory.md`의 R3 배정 기능 ID를 구체화한다. 전체 기능 범위와 릴리스 순서는 그 두 문서가 소유하며 이 문서에 복제하지 않는다.

BlockNote 동작 근거: 공개 문서(`blocknotejs.org`, 2026-09-04 fetch)로 확인한 `uploadFile: (file: File) => Promise<string>` 콜백 시그니처와 File/Image/Video/Audio block props(§3.1)를 사용한다. 별도로 BlockNote 소스 기반 요구사항 추출 문서(`_tmp/block-note-requirements/`)를 함께 검토했으나, 그 문서는 각 파일 자체의 "알려진 제약" 절에서 스스로 "BlockNote 실제 동작과 다르다"고 인정하는 항목이 다수라 실제 동작 근거로 채택하지 않았다(항목별 채택·기각 근거는 §2.2, §7.3).

## 2. 범위

### 2.1 R3 범위

기능 ID(모두 `NOT_STARTED`, `docs/product/blocknote-free-feature-inventory.md` 기준):

- `BLK-013` 일반 파일 블록, `BLK-014` 이미지 블록, `BLK-015` 비디오 블록, `BLK-016` 오디오 블록
- `MED-001` URL 기반 파일·미디어 삽입, `MED-002` 소비자 제공 upload callback
- `MED-003` 파일 drag/drop과 paste
- `MED-004` 파일 이름과 caption, `MED-005` 파일 교체와 삭제, `MED-006` 파일 다운로드와 preview
- `MED-007` 이미지·비디오 preview 너비 조절
- `MED-008` preview와 링크 표시 전환
- `IO-007`의 파일 붙여넣기 부분(R2에서 이월, Issue #38 spec §2.2) — 이 명세가 그 형태를 확정한다.

### 2.2 R3 제외 범위와 roadmap 해석

roadmap R3 범위 bullet에 없는 항목은 구현하지 않는다. `_tmp/block-note-requirements/`(FILE/IMAGE/VIDEO/AUDIO)에는 있지만 이번 범위에서 제외한 항목과 근거:

- **업로드 진행률(%) UI** — roadmap 완료조건은 성공·실패·취소 결과만 요구한다(2026-09-04 사용자 확정). `UploadFile` 콜백에 progress 인자를 두지 않는다.
- **공동 편집 동기화**(다른 사용자의 교체·삭제 반영, 재생 상태 비동기화 등) — roadmap이 R6("공동 편집, 댓글과 버전 parity")로 명시 배정했고 geul에 아직 실시간 협업 자체가 없다.
- **transcript, subtitle track, poster, picture-in-picture, playback rate, exclusive playback** — roadmap R3 bullet("재생, 일시정지, 시간 탐색, 음량과 전체 화면"에 대응하는 표현 없음)에 없다. 네이티브 `<video>`/`<audio>` 태그가 기본 제공하는 것 이상 신규 UI를 만들지 않는다.
- **별도 `alt` prop 신설** — BlockNote parity 대상 자체가 `name`/`caption`뿐이고 별도 alt 필드가 없다(2026-09-04 사용자 확정). HTML 출력 `<img alt>`는 caption이 있으면 caption, 없으면 name을 재사용한다.
- **WCAG 정량 접근성 기준**(pointer target 24×44px, live region 등) — R1/R2 완료판정에 a11y 게이트 전례가 없다(2026-09-04 사용자 확정). 기존 키보드 도달성(focus·Enter·Escape) 관례는 그대로 따른다.
- **i18n 프레임워크** — 기존 관례(영어 UI 문구 하드코딩, Issue #38 슬라이스 2 전례)와 충돌해 유지한다.
- **서버 측 보안**(file signature 검증, malware scan, SSRF 방어, signed URL 해석/proxy, quarantine) — geul은 파일 서버·백엔드를 갖지 않는다(완료조건: "소비자 callback 외의 특정 파일 서버에 의존하지 않는다"). 전부 소비자 백엔드 책임이며 geul 공개 계약 범위 밖이다.
- **Turn into(종류 변경)** — roadmap R3 bullet에 "종류 변경"이 없다. 4종 모두 Slash 삽입 전용이며 `BLOCK_TYPE_OPTIONS`/Turn into 메뉴에 넣지 않는다(구분선 제외 선례, Issue #38 슬라이스3 D2 연장).
- **표 셀 안 미디어 블록** — 표 셀은 현재도 단순 `InlineContent`만 가진다(기존 `TableBlock` 모델 제약, R3가 새로 만드는 제약이 아니다).
- **MED-007 대상은 image/video만** — audio는 `previewWidth`가 없다(BlockNote 실측 확인, §3.1). roadmap 문구 "이미지·비디오 크기 조절"과 일치한다.
- **MED-008 대상은 image/video/audio, File 제외** — BlockNote 실측 결과 `showPreview`는 File block props에 없다(§3.1). File은 항상 아이콘+이름 카드로 표시되고 "링크 전환" 개념 자체가 없다.

## 3. 문서 모델

### 3.1 블록 타입 4종

4종 모두 leaf 블록이다(`children` 없음, `DividerBlock`/`CodeBlock`과 같은 경계). 콘텐츠가 rich text가 아니라 plain string prop(`name`/`caption`)이므로 `TextBlockProps`(`textColor`/`backgroundColor`/`textAlignment`)를 재사용하지 않는다 — 대신 색상 1개(`backgroundColor`, 블록 전체 배경)만 공통으로 갖는다. `previewWidth`/`textAlignment`/`showPreview`의 타입별 존재 여부는 BlockNote 실측(`blocknotejs.org`, 2026-09-04)과 정확히 대응한다.

```ts
export type MediaBlockCommon = {
  url?: string;
  name?: string;
  caption?: string;
  backgroundColor?: string; // isCanonicalCellColor 재사용, TextBlockProps와 동일 정규형
};

export type FileBlock = { id: string; type: "file" } & MediaBlockCommon;

export type ImageBlock = {
  id: string;
  type: "image";
  showPreview?: boolean; // 기본 true
  previewWidth?: number; // 양의 유한수만, 상한은 model이 두지 않음(§5.3)
  textAlignment?: "left" | "center" | "right";
} & MediaBlockCommon;

export type VideoBlock = {
  id: string;
  type: "video";
  showPreview?: boolean;
  previewWidth?: number;
  textAlignment?: "left" | "center" | "right";
} & MediaBlockCommon;

export type AudioBlock = {
  id: string;
  type: "audio";
  showPreview?: boolean; // previewWidth·textAlignment 없음
} & MediaBlockCommon;
```

`Block` union에 4종을 추가한다. `caption`은 plain string이다(rich text 아님 — BlockNote와 동일, 색상 마크 적용 대상이 아니다).

### 3.2 URL 검증 — 기존 계약 재사용

4종의 `url` prop은 `packages/model/src/link-policy.ts`의 `isSupportedLinkHref`로 검증한다(새 정책을 만들지 않음). `link` mark의 `href`와 같은 계약(`https:`/`mailto:`/`tel:` 또는 상대 경로만 허용, `javascript:`/`data:` 등 실행 가능 scheme·제어 문자·역슬래시 거절)을 그대로 적용한다. 위반은 `DOCUMENT_INVALID`(로드 시점, 기존 코드 재사용)다.

## 4. Upload 계약

### 4.1 콜백 시그니처와 결과 타입

```ts
export type UploadResult =
  | { status: "success"; url: string; name?: string }
  | { status: "error"; code: string; message: string } // code는 소비자 정의(열린 문자열), geul이 닫힌 union을 강제하지 않음
  | { status: "cancelled" };

export type UploadFile = (file: File, signal: AbortSignal) => Promise<UploadResult>;
```

`AGENTS.md`의 "외부 입력 실패는 구조화된 `Result<T,E>`로 반환한다" 불변식을 따른다 — BlockNote의 `Promise<string>`(실패는 reject)보다 명시적이다. `progress` 인자는 두지 않는다(2.2).

콜백은 core 편집기 생성 옵션으로 등록한다(ADR-0002 "react -> core" 방향 유지 — react는 이 옵션을 그대로 core에 전달만 한다). 콜백 미등록 시:

- drag/drop·paste의 파일 페이로드는 무시한다(R2 결정 유지, IO-007 own 경계와 동일).
- Slash 메뉴의 미디어 삽입은 File Panel의 URL 입력 경로만 노출한다(Upload 탭 없음).

### 4.2 Pending 상태 — 비영속

업로드 중 상태는 `blockId -> "uploading" | { status: "error"; code; message }` session 전용 맵으로 관리한다(모델 스키마 밖) — Issue #38 슬라이스7 `blockSelection`, 슬라이스9 RD-004 `session.getBlockSelection()`과 같은 "PM Selection·문서와 독립된 session 상태" 패턴 재사용. 블록 자체는 삽입 즉시 `url` 없이 문서에 존재한다(빈 미디어 블록은 이미 유효한 상태). 업로드 성공 시 `url`(및 반환된 `name`, 미지정 시 유지) prop을 일반 트랜잭션으로 세팅한다(undo 대상, 단일 트랜잭션). 실패는 문서에 흔적을 남기지 않는다 — 에러는 session 상태로만 노출되고 model round-trip 대상이 아니다.

경합 가드: 비동기 결과 적용 전 대상 블록이 여전히 존재하는지 재확인한다(존재하지 않으면 no-op) — 업로드 중 undo로 블록이 사라지거나 다른 파일로 교체된 뒤 이전 결과가 늦게 도착하는 경우를 막는다.

교체(`replaceMediaBlockFile`)는 새 업로드가 `status: "success"`가 될 때까지 기존 `url`/`name`/`caption`/`backgroundColor`를 그대로 유지한다 — 실패 시 원상 유지, 별도 롤백 로직 없이 애초에 아무것도 바꾸지 않는다.

여러 파일을 동시에 드롭·붙여넣기하면 파일별 업로드는 독립적으로 병렬 진행한다 — 한 파일의 실패가 다른 파일의 진행·성공을 막지 않는다.

## 5. 에디터 코어

### 5.1 명령(신규)

- `insertMediaBlock(afterBlockId, kind: "file" | "image" | "video" | "audio")`
- `setMediaBlockUrl(blockId, url)` — URL 삽입(`MED-001`)과 업로드 성공 후 내부 세팅 공용
- `uploadMediaFile(blockId, file)` — 콜백 호출 + pending 상태 관리 + 성공 시 `setMediaBlockUrl` 내부 호출(소비자에게 2단계로 노출하지 않음)
- `cancelMediaUpload(blockId)` — 등록된 `AbortSignal`을 abort
- `replaceMediaBlockFile(blockId, file)` — §4.2 유지 정책을 따르는 교체(`MED-005`)
- `setMediaBlockName(blockId, name)`, `setMediaBlockCaption(blockId, caption)`, `setMediaBlockBackgroundColor(blockId, color)`
- `setMediaShowPreview(blockId, boolean)` — image/video/audio 대상(`MED-008`), file 대상 호출은 신규 `EditorError` 코드로 거절(§8)
- `setMediaPreviewWidth(blockId, number)` — image/video 대상(`MED-007`), audio/file 대상 호출은 같은 방식으로 거절
- `setMediaTextAlignment(blockId, "left" | "center" | "right" | null)` — image/video 대상(`MED-009`, Issue #154), `null`은 속성 제거(리셋). audio/file 대상 호출은 신규 `EditorError` 코드로 거절(§8)
- 삭제는 기존 `deleteBlock` 재사용. 다운로드는 core 명령이 아니다(§6.3).

### 5.2 Drag/drop·Paste — `IO-007` 이월분 완성

신규 core Tiptap 확장(기존 `ClipboardPasteExtension`/`TablePasteExtension`과 나란히)이 drop·paste의 `DataTransfer`/`ClipboardData`에서 `File[]`를 추출한다. 우선순위: 파일이 있으면 기존 HTML/Markdown/plain text 경로보다 이 확장이 우선한다(표 우선 파싱과 같은 원칙 연장).

블록 타입 판별은 MIME prefix(`image/`·`video/`·`audio/`, 그 외 `file`)를 우선하고, MIME이 비어 있거나 신뢰할 수 없으면 파일 확장자로 fallback한다.

삽입 위치 규칙:

- paste 대상이 **빈 paragraph**면 그 블록을 미디어 블록으로 교체한다.
- 그렇지 않으면 현재 블록 뒤에 삽입한다.
- drop은 좌표가 대상 블록 위쪽이면 앞에, 아래쪽이면 뒤에 삽입한다.
- 여러 파일은 입력 순서대로 각각 블록을 생성하고, 업로드는 §4.2대로 파일별 독립 진행한다.

### 5.3 Resize

`previewWidth`는 model이 양의 유한수만 검증하고 상한을 두지 않는다 — 컨테이너 폭은 레이아웃 종속이라 문서 불변식이 아니다. 리사이즈 핸들 UI가 실제 clamp를 담당한다(§6.3).

## 6. React UX

### 6.1 File Panel(Upload/Embed)

빈 미디어 블록 생성 직후 대상 블록에 연결된 File Panel을 자동으로 연다. Upload 탭은 `uploadFile` 콜백이 등록된 경우에만 표시하고, 미등록 시 Embed(URL) 탭만 연다. panel은 대상 블록과만 연결되고 다른 블록 상태에 영향을 주지 않는다. Escape 또는 외부 클릭으로 닫으면 focus를 대상 블록으로 복원한다.

URL 삽입 시 마지막 path segment(percent-decode)로 `name` 초깃값을 추출하고, 추출 실패 시 URL 자체를 표시한다.

### 6.2 Formatting Toolbar

URL이 있는 미디어 블록 선택 시 전용 toolbar를 표시한다 — replace, rename(name), caption, delete, download/open, (image/video/audio) preview 전환, (image/video) 정렬. 빈 블록에는 적용 불가능한 control(rename/caption/download 등)을 숨긴다. 드래그 이동 중 toolbar를 숨긴다.

### 6.3 Resize handle과 다운로드

- Resize: image/video preview 좌우에 pointer/touch 드래그 핸들(테이블 열 너비 조절과 같은 pointer-drag *패턴*을 재사용하되 신규 컴포넌트, 코드 재사용 아님). 최소 64px, 최대는 editor content 폭. 가운데 정렬은 중심 고정 대칭 리사이즈.
- 다운로드: react가 `<a href={url} download={name}>`로 처리한다. core 명령 없음. **cross-origin URL은 브라우저가 강제 다운로드를 보장하지 않는다** — 소비자 파일 서버의 `Content-Disposition` 설정에 의존하는 한계로 명시한다(과장된 완료 주장 방지).
- File 카드 클릭은 블록 선택(다른 블록과 동일 동작)이고, "열기"는 별도 버튼 전용이다 — 클릭 오버로드 없음.

## 7. 문서 입출력

### 7.1 HTML 계약

```html
<!-- caption 있음 -->
<figure data-be-background-color="..." data-be-show-preview="..." data-be-preview-width="..." data-be-text-alignment="...">
  <img src="URL" alt="caption 또는 name" /> <!-- image -->
  <figcaption>caption</figcaption>
</figure>
<!-- caption 없음 -->
<img src="URL" alt="name" data-be-...="..." />
```

video/audio는 `<video>`/`<audio controls>`로, file은 `<a href="URL">name</a>`로 매핑한다. `showPreview:false`(image/video/audio)는 미디어 태그 대신 `<a>`로 출력한다. `previewWidth`/`showPreview`/`textAlignment`/`backgroundColor`는 `data-be-*` 속성(기존 표 셀 색상과 같은 패턴)으로 왕복한다.

Import는 `<figure>` 안의 media 요소 + `<figcaption>`을 **블록 1개**로만 디코드한다(figure와 media 요소를 별도 2개 블록으로 중복 생성하지 않는 가드).

### 7.2 GFM 계약과 손실 정책

- Image만 `![name](url)`로 strict round-trip 가능(url/name만). `previewWidth`/`showPreview`/`textAlignment`/`backgroundColor`/caption은 표현 불가 — 새 손실 카테고리(`MEDIA_PREVIEW_WIDTH`/`MEDIA_SHOW_PREVIEW`/`MEDIA_TEXT_ALIGNMENT`/`MEDIA_CAPTION`)로 strict 거절, lossy는 값 폐기+경고(`INLINE_COLOR` 계열과 동일 패턴).
- Video/Audio/File은 GFM 표현 수단이 없어 strict 거절, lossy는 `[name](url)` 링크로 강등한다. raw HTML `<figure>`를 GFM 출력에 끼워 넣는 하이브리드 fallback은 쓰지 않는다 — 기존 strict/lossy 이분법을 유지한다(R1/R2 전례 없음, 사용자 확정).
- 완료 조건 문구가 "JSON/HTML round-trip"만 요구하므로 GFM 손실은 조건 위반이 아니다.

### 7.3 GFM import — own-format 경계, 확장 스니핑 없음

GFM import는 `![]()` 이미지 문법만 Image 블록으로 매핑한다. File/Video/Audio는 GFM import 경로 자체를 갖지 않는다(토글의 GFM import 부재 선례와 동일) — 일반 `[text](url.mp4)` 같은 평범한 마크다운 링크를 확장자만 보고 Video 블록으로 승격하지 않는다(오탐 시 정상 하이퍼링크 문서가 깨진다).

HTML import에서 외부 `<a>`(geul 자체 export 형태가 아닌 임의 anchor)를 File 블록으로 승격하지 않는다 — Issue #38 슬라이스10이 확립한 "own export document HTML/production in-editor copy wrapper만 own 블록으로 인식" 원칙을 재사용한다. 일반 외부 `<a>`는 계속 `link` mark로 남는다. geul 자체 File 블록 export 형태(`data-be-type="file"`를 가진 `<figure>`/`<a>`)만 own-format round-trip으로 File 블록으로 되돌아온다.

## 8. 오류 계약

`packages/core/src/errors.ts`의 `EditorError` union에 추가:

- `MEDIA_RESIZE_NOT_SUPPORTED` — `setMediaPreviewWidth`를 audio/file 블록에 호출
- `MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED` — `setMediaShowPreview`를 file 블록에 호출
- `MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED` — `setMediaTextAlignment`를 audio/file 블록에 호출(Issue #154)

`packages/model`의 `DOCUMENT_INVALID`를 재사용(전용 코드를 새로 만들지 않음):

- `url` prop이 `isSupportedLinkHref`를 위반(§3.2)
- `previewWidth`가 양의 유한수가 아님(audio/file에 존재하는 경우 포함 — 애초에 타입 shape 위반)

`UploadResult`의 `status: "error"`는 `EditorError`가 아니다 — `code`는 소비자가 자유롭게 정하는 문자열이며 core가 닫힌 코드 체계를 강제하지 않는다.

## 9. 검증 전략

R1/R2 명세의 전략을 R3 대상으로 확장한다 — 새 카테고리만 기록한다.

- **모델 단위 테스트**: 4종 block 정규 저장형, `url` protocol 거절(`isSupportedLinkHref` 위반), `previewWidth` 양수 검증, audio/file에 `previewWidth`/`textAlignment` 부재 shape 고정.
- **코어 단위 테스트**: mock `UploadFile`(success/error/cancelled 3분기), 업로드 중 블록 삭제·교체 경합 가드(오래된 결과 no-op), 교체 실패 시 기존 값 유지, 여러 파일 독립 성공/실패, 각 신규 명령의 단일 트랜잭션·undo, `MEDIA_RESIZE_NOT_SUPPORTED`/`MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED` 거절.
- **입출력 단위 테스트**: HTML `<figure>`/`<img>`/`<video>`/`<audio>`/`<a>` round-trip(showPreview on/off 포함), figure+figcaption 중복 생성 방지, GFM strict/lossy 손실 카테고리 fixture, GFM import가 확장자 스니핑을 하지 않음을 고정하는 회귀 fixture, own-format 외부 `<a>` 비승격 회귀 fixture.
- **Playwright**: 각 블록 타입 삽입·URL 삽입·drag/drop·paste 시나리오(Chromium 우선), resize 드래그, replace/delete/download 클릭 — roadmap 완료조건 "실제 브라우저 검증"의 직접 대상. R3 마지막 슬라이스에서 3-엔진 게이트 재확인.
- **리스크**: Playwright의 합성 drag/paste `File` 이벤트가 Firefox 등에서 `PIT-0012`(synthetic ClipboardEvent)와 유사한 엔진별 결함을 낼 수 있다 — Chromium 우선 검증 후 3-엔진 게이트 슬라이스에서 재확인한다.

## 10. 후속 확장 경계

- transcript, subtitle track, poster, picture-in-picture, playback rate, exclusive playback, 업로드 진행률 UI는 이 명세가 선결정하지 않는다 — 필요해지면 별도 설계가 있어야 한다(2.2).
- Yjs 공동 편집(R6)의 업로드 pending 상태·재생 상태 동기화 정책은 이 명세가 선결정하지 않는다(R2 명세의 다중 선택 충돌 정책과 같은 경계 원칙).
- 별도 `alt` prop, WCAG 정량 기준 도입은 이 명세 범위가 아니다(2.2) — 후속 이슈 후보로만 남긴다.

## 11. R3 완료 조건

roadmap.md R3 완료 조건 4개를 그대로 인용한다(약화·추가하지 않음).

- 업로드 성공·실패·취소가 구조화된 결과로 전달된다.
- 소비자 callback 외의 특정 파일 서버에 의존하지 않는다.
- media props가 JSON/HTML round-trip된다.
- resize, replace와 delete가 실제 브라우저에서 검증된다.
