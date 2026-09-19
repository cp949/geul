# CUS-001~004 — iframe 블록 설계

## 1. 결정 요약

`docs/product/blocknote-free-feature-inventory.md` §3.10에 이미 `CUS-001`~`CUS-004`(안전한 범용 iframe 블록/보안 정책/크기 조절과 로딩 실패 UI/JSON·HTML 직렬화, 목표 `CUSTOM`, R8, `NOT_STARTED`)로 등록돼 있다. `docs/product/roadmap.md:23`은 "iframe은 모든 parity와 파일 상호운용 단계 뒤인 마지막 R8에서 구현한다. p5.js 등 iframe 안에서 실행되는 콘텐츠는 범용 iframe 지원만으로 커버되므로 별도 기능으로 다루지 않는다"고 명시했고, `docs/specs/2026-08-14-tiptap-block-editor-mvp-design.md:521-523`은 "iframe은 별도 블록 타입과 보안 정책이 필요하다. 허용 origin, sandbox 권한, 크기 조절, 로딩 실패와 직렬화 계약을 별도 설계한 뒤 추가한다"고 요구했다. 이 문서가 그 별도 설계다.

**이 문서의 산출물 범위**: 설계 문서만(2026-09-19 그릴링 라운드4 Q4 결정). `current-status.md`/`roadmap.md`는 갱신하지 않는다 — R8 순서 그대로 유지. 착수 시점은 별도 지시로 정한다.

**customBlocks(EXT-001) 경로는 채택하지 않는다**(그릴링 라운드1 Q5) — `CustomBlockDefinition`(`packages/core/src/custom-extension-definitions.ts:15-24`)은 소비자가 런타임에 등록하는 임의 블록 레지스트리이고 `Block` 유니온 멤버가 아니다(`DocumentBlock = Block | CustomBlock`, `types.ts:221`). iframe은 model/core/io/react 4계층 전부에 걸친 네이티브 15→16번째 `Block` 타입으로 간다 — 인벤토리가 이미 이를 `EXT-001`의 `PARITY` 목표와 다른 `CUSTOM` 카테고리로 구분해 두었다.

**media 블록(`file`/`image`/`video`/`audio`, `MediaBlockKind`)을 5번째 kind로 확장한다** — 별도 병렬 인프라(독립 kind 유니온, 독립 리사이즈 핸들, 독립 toolbar)를 새로 만들지 않는다. resize(`setMediaPreviewWidth`)/정렬(`setMediaTextAlignment`)/선택 판정(`getSelectionMediaBlock`)/오버레이(`media-resize-handles.tsx`, `media-handle-overlays.tsx`)/toolbar(`media-toolbar.tsx`)/sanitize·export·import(`data-geul-media-type` 마커 관례)/GFM loss(`MEDIA_TYPE_LOST` 등)를 전부 재사용한다. "Media"라는 이름이 iframe엔 다소 부정확하지만 전면 rename은 이번 범위 밖이다(§8). ADR-0002의 "동일 불변식을 여러 패키지가 다시 구현하지 않는다"는 원칙과 `docs/agents/workflow-shared.md`의 DELTA 크기 규칙(서로 다른 패키지 3개 이상을 동시에 건드리면 경계 신호) 둘 다 이 재사용 방향을 가리킨다.

**그릴링 원안에서 코드 조사로 정정된 두 지점**(둘 다 사용자에게 별도 재확인 없이 media 선례에 맞춰 이 문서에서 확정 — 아래 §2, §3, §4에 반영):

- **width 스키마**: 그릴링 라운드3 Q1은 `width: {type:'pixel'|'percent'|'full', value}` 확장 객체를 추천했다. 그러나 image/video의 유일한 기존 관례는 `previewWidth: number`(flat)이고, 객체 스키마 선례가 model 어디에도 없다. iframe 혼자 다른 스키마로 먼저 가면 media 4종과 비일관이 생긴다. v1은 `previewWidth: number`를 그대로 재사용한다 — width preset(Wide/Full, v2) 마이그레이션은 iframe 단독이 아니라 media 4종 전체에 영향을 주는 더 큰 결정이라 이번 문서 범위 밖으로 둔다.
- **NodeView 패턴**: 그릴링에서 "atom Node + NodeView(raw HTMLElement)"라고 설명했다. 실제로는 media 4종 전부 `addNodeView()`가 없다 — 순수 declarative `renderHTML`(toDOM)이다(`media-block-extension.ts:213-374`). `addNodeView()`는 `customBlocks`(EXT-001) 레지스트리 전용 패턴이었다(`custom-block-extension.ts:63-85`). 네이티브 블록으로 가므로 media와 동일한 declarative 패턴을 따른다(§3) — 구현이 더 단순해진다.
- **export HTML 표현**: 그릴링 라운드2 Q1은 "wrapper만 저장, 실제 iframe DOM은 렌더링 시점에만 구성"으로 정했다. media는 src가 있을 때 실제 작동하는 태그(`<img>`/`<video>`)를 export에도 그대로 방출하는 기존 관례가 있다(`export-html.ts:198-225`). **import 방향의 차단은 그대로 유지**한다 — raw `<iframe>` 태그는 `htmlStrippedTagNames`(`sanitize-schema.ts:158`)에서 빼지 않고 계속 strip, 오직 geul 자체 UI(슬래시커맨드)로만 이 블록을 생성한다. **export 방향만** media 선례를 따라 검증을 통과한 src에 한해 실제 `<iframe sandbox allow referrerpolicy>` 태그를 방출한다 — sandbox/allow/referrerPolicy는 export를 수행한 `EditorController`의 설정값을 그 시점에 그대로 굳혀 넣으므로, export된 정적 HTML도 동일한 보안 정책을 유지한다(§4).

## 2. 데이터 모델 (`model`)

```ts
// packages/model/src/types.ts — Block 유니온에 16번째 멤버로 추가
export type IframeBlock = {
  id: string;
  type: "iframe";
  previewWidth?: number;                // image/video와 동일 필드 재사용(§1 정정)
  textAlignment?: "left" | "center" | "right";
  aspectRatio?: "16:9";                  // v1 고정 리터럴 하나만. v2에서 유니온 확장
} & MediaBlockCommon;                    // url = iframe src, name = 접근성 title, caption/backgroundColor는 v1 비노출
```

- `Block` 유니온(`types.ts:182-197`)에 추가, `children` 필드 없음(atom/leaf 계약 — `types.ts:117`).
- `MediaBlockKind`(`packages/core/src/media-block-kind.ts:13`)를 `"file" | "image" | "video" | "audio" | "iframe"`으로 확장.
- **별도 `AtomBlockType` 판별자를 만들지 않는다** — model에 그런 카테고리가 media에도 없었다(포함이 아니라 `NestableBlockType`/`InlineContentBlockType`에서 배제되는 방식으로 atom임을 표현). iframe도 동일하게 두 predicate 모두에 넣지 않는다.
- `KNOWN_BLOCK_TYPES`(`block-schema.ts:407-423`, 정확히 "16번째 타입 추가 시 갱신" 주석이 달린 지점)에 `"iframe"` 추가.
- `blockSchema` discriminated union(`block-schema.ts:372-388`)에 `iframeBlockSchema` 추가 — image/video 스키마와 동일 구조(`.strict()`) + `aspectRatio: z.literal("16:9").optional()`.
- `document-structure-validation.ts:189-227`의 media 판별 리터럴 체인에 `"iframe"` 추가. `previewWidth`/`textAlignment` 검증은 `isValidMediaPreviewWidth`(`media-block.ts:8-9`)/`isCanonicalCellAlign` 재사용(image/video와 동일 조건: `type==="iframe"`일 때만 검증).
- **`isSupportedMediaUrl`(`link-policy.ts:38-39`, media용)은 iframe에 재사용하지 않는다** — media는 `data:`/`blob:`(로컬 파일)까지 허용하지만 iframe은 `https:`만 기본 허용(그릴링 확정, host override 가능)이라 정책이 다르다.
- **신규**: `packages/model/src/iframe-embed-policy.ts`
  ```ts
  export type IframeProviderWhitelistEntry = {
    name: string;
    match: { type: "exact" | "wildcard"; pattern: string };
  };
  export type IframeEmbedConfig = {
    providers?: IframeProviderWhitelistEntry[]; // 기본 YouTube/Vimeo/Figma/CodeSandbox/Google Maps
    allowCustomUrl?: boolean;      // 기본 false
    allowPrivateNetwork?: boolean; // 기본 false
    allowedProtocols?: string[];   // 기본 ["https:"]
    sandbox?: string;              // 기본 "allow-scripts allow-popups allow-popups-to-escape-sandbox allow-forms"
    allow?: string;                // 기본 ""
    referrerPolicy?: string;       // 기본 "strict-origin-when-cross-origin"
  };
  export function resolveIframeEmbedDecision(
    url: string,
    config: IframeEmbedConfig,
  ): { allowed: true; provider?: string } | { allowed: false; reason: "PROTOCOL_NOT_ALLOWED" | "PRIVATE_NETWORK_BLOCKED" | "NOT_WHITELISTED_AND_CUSTOM_DISABLED" };
  ```
  순수 함수, 프레임워크 비의존(`link-policy.ts`/`media-block.ts`와 동일 계층). 정확한 whitelist 초기 목록·`match` 패턴 값은 구현 시점에 확정한다.
- `MAX_NESTING_DEPTH`(64, `document-nesting-depth.ts:9`)와 무관 — atom이라 이 재귀 경로에 진입하지 않는다(media와 동일 확인, `document-nesting-depth.ts:34`).

## 3. `core` 구현

```ts
// packages/core/src/iframe-block-extension.ts (신규)
// media-block-extension.ts의 ImageBlockExtension(244-296행) 구조를 그대로 미러링
```

- `group: "block", atom: true, priority: 100`(media와 동일 이유 — `blockContainer`(1000)보다 낮아야 doc의 "block+" 채움에서 `ContentMatch.defaultType` 경쟁에 지지 않음, `media-block-extension.ts:24-27`).
- `addAttributes()`: `mediaBlockCommonAttributes()` + `previewAttributes()`(`previewWidth`/`textAlignment` 재사용, `media-block-extension.ts:107-117`) + `aspectRatio`(`default: "16:9"`).
- **`addNodeView()` 없음** — 순수 `renderHTML`(§1 정정). `parseHTML` 미선언(media와 동일 이유 — `BlockIdExtension`이 blockContainer 전용 사후 id 배정이라 붙여넣기 경로는 io의 sanitize+재구성이 전담, `media-block-extension.ts:17-22`).
- `renderHTML` 개요:
  ```ts
  ["div",
    mergeAttributes(HTMLAttributes, { "data-geul-media-kind": "iframe" },
      src === null ? { "data-geul-media-empty": "iframe" } : {}),
    src === null
      ? []
      : [["iframe", {
          src,
          sandbox: this.options.sandbox,
          allow: this.options.allow,
          referrerpolicy: this.options.referrerPolicy,
          loading: "lazy",
          title: name ?? "",
          style: `width:${previewWidth ?? DEFAULT_WIDTH}px;max-width:100%;aspect-ratio:16/9`,
        }]],
  ]
  ```
  `sandbox`/`allow`/`referrerPolicy`는 **per-block 저장 필드가 아니라 extension `options`**에서 온다 — host가 `IframeBlockExtension.configure({ sandbox, allow, referrerPolicy })`로 주입, `EditorController` 생성 시 새 `iframeEmbed?: IframeEmbedConfig` 옵션(`editor-controller-types.ts`의 `customBlocks?: Record<string, CustomBlockDefinition>`, 187-191행과 같은 자리)에서 배선한다. 이는 그릴링 라운드1 Q2("host 오버라이드 가능한 라이브러리 기본값")와 정합.
- **신규 커맨드** `setIframeSrc(blockId: string, url: string): Result<void, EditorError>` — `setMediaPreviewWidth`(`block-attribute-commands.ts:163-196`)의 골격(찾기 → kind 가드 → 검증 → `setNodeMarkup` → `closeHistory` dispatch)을 재사용. 검증은 model의 `resolveIframeEmbedDecision(url, config)` 호출, 거부 시 `{code: "IFRAME_URL_NOT_ALLOWED", reason}`(기존 `MEDIA_RESIZE_NOT_SUPPORTED` 등과 동일 네이밍 관례).
- resize/정렬: `isResizableMediaBlockKind`/`isTextAlignableMediaBlockKind`(`block-attribute-commands.ts:26-28` 근방)의 kind 목록에 `"iframe"` 추가 — `setMediaPreviewWidth`/`setMediaTextAlignment` 신규 커맨드 불필요. `isPreviewToggleableMediaBlockKind`에는 추가하지 않음(iframe은 항상 라이브 임베드, file류의 "로컬 미리보기 토글" 개념 없음).
- 삭제/복제/이동: `generic-block-delete-commands.ts`/`generic-block-duplicate-commands.ts`/`generic-block-clone.ts`/`generic-block-move-commands.ts` 전부 타입 무관 로직임을 조사로 확인(atom 분기는 `type.name === "blockContainer"` 여부로만 갈림) — 변경 불필요.
- Turn into: `isInlineContentBlockType`에 `"iframe"`을 넣지 않아 자연 배제(media와 동일, `generic-block-type-commands.ts:43-44`). `block-type-descriptor.ts:52-60`의 "media 제외" 각주 옆에 iframe도 언급 추가.
- **interaction 토글(선택⇄Interact)은 모델/커맨드에 없다** — 문서에 저장되지 않는 순수 UI 상태다. DOM에 `pointer-events` 직접 mutate(§5 react). Tiptap attr나 command로 만들지 않는다 — 만들면 매 토글마다 undo 스택에 쌓이는 부작용이 생긴다.
- `enabledBlockTypes` 게이트(`model-to-tiptap.ts:35-50`, `insertMediaBlock`류 `EDITOR_FEATURE_UNAVAILABLE`)에 `"iframe"` 자동 포함(기존 14종 처리 로직이 타입 목록만 확장하면 그대로 동작).

## 4. `io` HTML/GFM 계약

### HTML

`sanitize-schema.ts:158`의 `htmlStrippedTagNames`에서 **`"iframe"`을 빼지 않는다** — raw `<iframe>` 태그는 외부 HTML import/붙여넣기 양쪽에서 계속 무조건 제거된다(ADR-0003 그대로 준수). 이 블록은 오직 geul 자체 슬래시커맨드로만 생성 가능하다.

- `import-html-sanitize-schema.ts`의 `mediaDataAttributeNames`(17-25행)에 `dataGeulSrc`, `dataGeulTitle`, `dataGeulAspectRatio` 3개 추가. `div`/`figure` 허용 속성 목록(45-98행)에도 반영.
- **export**(`export-html.ts:198-225`의 `mediaBlockNode` 패턴 재사용): `previewWidth` 있고 `src`가 검증을 통과했으면
  ```html
  <figure data-geul-block-id="..." data-geul-media-type="iframe"
          data-geul-src="https://..." data-geul-title="..." data-geul-aspect-ratio="16:9"
          data-geul-preview-width="640" data-geul-text-alignment="center"
          style="width: 640px">
    <iframe src="https://..." sandbox="..." allow="..." referrerpolicy="..."
            loading="lazy" title="..."></iframe>
    <figcaption>...</figcaption>
  </figure>
  ```
  `src`가 없으면 media의 빈 상태(202-209행)와 동일하게 `<div {...dataAttrs}>`만 방출. sandbox/allow/referrerPolicy는 export를 수행한 `EditorController`의 `iframeEmbed` 설정값(또는 미지정 시 CUS-002 기본값)을 그 시점에 굳혀 넣는다(§1 정정).
- **import**(`import-html-media.ts`의 `isMediaNode`/`mediaBlockFromNode` 확장): outer `data-geul-media-type="iframe"` 마커가 있는 `div`/`figure`를 발견하면 **wrapper의 `data-geul-src`/`data-geul-title`/`data-geul-aspect-ratio`/`data-geul-preview-width`/`data-geul-text-alignment` 속성만으로 블록을 재구성**한다 — 내부 `<iframe>` 태그는 sanitize 단계에서 이미 제거됐으므로 참조하지 않는다(media가 `<img>`/`<video>` 태그 자체에서 `src`를 읽는 것과 달리, iframe은 태그가 사라지므로 wrapper 속성이 유일한 소스).
- `resolveIframeEmbedDecision`을 import 경로에도 적용할지: **적용한다(정정, Issue #215, RD-001~002).** 위 "적용하지 않는다" 결정은 sanitize의 태그 strip이 iframe wrapper 위조까지 막아준다고 잘못 가정했다 — sanitize는 raw `<iframe>` 태그만 제거할 뿐, own-format wrapper(`data-geul-media-type="iframe"` + `data-geul-src`)의 `data-geul-src` 속성 자체는 media 5종 공통 허용 목록에 있어 조작된 값도 그대로 통과시킨다. `<div data-geul-media-type="iframe" data-geul-src="https://169.254.169.254/...">` 같은 위조 wrapper가 whitelist·private-network 정책 없이 살아있는 iframe으로 복원되는 결함이 있었다.
  - `importHtml`(`packages/io`)에 선택적 `iframeEmbed?: IframeEmbedConfig` 파라미터를 추가했다. 생략 시 `resolveIframeEmbedDecision`의 함수 기본값(whitelist 없음·custom URL 비허용·private network 차단·https만 허용)이 그대로 적용된다 — host가 `importHtml`을 직접 호출하는 통합(서버 사이드 parse/render, `IO-009`)도 이 파라미터로만 보호받는다.
  - **own-export 라운드트립도 예외 없이 재검증한다** — 신뢰 판별 마커가 없고, HTML은 저장 원본(JSON)이 아니라 `iframe-embed-policy.ts`의 "저장된 문서는 host 설정이 바뀌어도 계속 load돼야 한다" 불변식과 무관하다(그 불변식은 `parseDocument`가 다루는 JSON 문서 로드 경로 전용이다).
  - 정책 거부는 경고를 내지 않는다 — export 쪽의 기존 정책(host 설정 미지정 시 조용히 빈 wrapper만 유지)과 대칭이다.
  - 라이브 에디터의 클립보드 붙여넣기(`ClipboardPasteExtension`, `packages/core`)는 host의 실제 `iframeEmbed` 설정(construction-time, `setIframeSrc`·render와 같은 소스)을 이 새 파라미터에 그대로 전달한다.

### Markdown(GFM)

신규 loss kind를 만들지 않는다 — 기존 `MarkdownLoss.kind`(`loss-analysis.ts:18-68`)의 media 전용 리터럴에 `"iframe"`을 조건 분기 대상으로 추가한다:
- `MEDIA_TYPE_LOST`: iframe은 image와 달리 고유 GFM 표현이 없으므로 video/audio/file과 동일하게 **항상** 보고(`loss-analysis.ts:266-333`의 조건에 `"iframe"` 포함).
- `MEDIA_PREVIEW_WIDTH`/`MEDIA_TEXT_ALIGNMENT`: 값이 있을 때만 기존 조건 그대로 재사용.
- `aspectRatio`(v1 고정값)는 손실 보고 생략 — 구현 시점에 `MEDIA_ASPECT_RATIO` 신설 여부를 재검토할 수 있으나 우선순위 낮음.
- **lossy export**(`export-markdown.ts:345-380`): `{type:"link", url, text: title ?? url}`로 강등 — file/video/audio 강등과 동일 패턴.
- **import**: GFM에는 iframe을 만드는 문법이 없다 — 생성 경로 자체가 없다(media 강등 타입과 동일).

### preview.css

```css
[data-geul-media-type="iframe"] iframe { display: block; width: 100%; max-width: 100%; border: 0; }
```
정렬 규칙(`figure[data-geul-text-alignment="left"|"right"]`, `preview.css:162-170`, `275-289`)은 기존 규칙을 그대로 상속 — 신규 CSS 불필요.

## 5. `react` UI

- **신규 파일을 만들지 않고 기존 컴포넌트를 확장한다**:
  - `media-resize-handles.tsx`/`media-handle-overlays.tsx`의 `findMediaElement`/`findMediaVisualElement`(`:scope` 셀렉터)에 `iframe`을 포함 — `getSelectionMediaBlock()`(`editor-controller.ts:199-222`)은 `isMediaBlockKind`가 `"iframe"`을 포함하므로 수정 없이 동작.
  - `MIN_MEDIA_PREVIEW_WIDTH`(64px, `media-resize-handles.tsx:14`) 그대로 적용, 상한은 기존과 동일하게 wrapper 실측값(`media-resize-handles.tsx:135`).
  - `media-toolbar.tsx`(portal 기반, `createPortal`)에 `kind === "iframe"`일 때의 액션 셋 분기 추가: URL 변경 / Align(L·C·R) / Interact / 새 창에서 열기(`rel="noopener noreferrer"`) / 복제 / 삭제. width preset/aspect ratio 버튼은 v2(§8).
- **interaction 토글(신규)**: `media-handle-overlays.tsx`에 iframe 전용 추가 오버레이 버튼("Interact"). 클릭 시 해당 `<iframe>` 엘리먼트에 `pointer-events:auto`(또는 `data-geul-iframe-interactive="true"`) 직접 mutate, `document`에 1회성 capture-phase 바깥 클릭 리스너로 해제 시 되돌린다 — 모델/커맨드 관여 없음(§3). 기본값(`pointer-events:none`)은 신규 `_iframe.scss`(react 전용 편집 스타일시트)에 정의한다 — `preview.css`(io, 읽기 전용 뷰)에는 넣지 않는다. 읽기 전용 뷰는 ProseMirror 선택 처리와 경합하지 않으므로 항상 `pointer-events:auto`.
- **로딩/차단 상태**: iframe `onLoad` 미발생 타임아웃(수 초) 휴리스틱으로 "로드 실패 또는 이 사이트가 삽입을 차단했을 수 있음" 모호 문구 표시(그릴링 라운드2 Q3). 빈 `src`는 `data-geul-media-empty="iframe"`(§3)에 대응하는 placeholder.
- **삽입**: `slash-menu.tsx`의 `SlashMenuItem` 유니온에 `{kind: "insertIframe", id, label, description, keywords}` 추가(media의 `{kind:"insertMedia", mediaKind}`와 다른 태그 — iframe은 업로드 탭 개념이 없어 URL 입력 단일 흐름이라 별도 kind가 더 명확). `file-panel.tsx`의 "Embed(URL)" 탭 패턴만 재사용한 URL 입력 UI, 확정 시 `editor.commands.setIframeSrc(blockId, url)` 호출. whitelist 밖 + `allowCustomUrl:false`면 입력 시점에 안내 문구로 거절(`resolveIframeEmbedDecision` 결과 그대로 노출).
- `BLOCK_TYPE_OPTIONS`(Turn into, `block-type-options.ts`): 추가하지 않는다(media와 동일 배제, §3).
- i18n(`dictionary.ts`/`dictionary-ko.ts`): `slashMenu.iframe`, `toolbar.kindNames.iframe` 최소 2개 키를 en/ko 양쪽에 추가(기존 필드 불변, 하위 호환 확장 관례).

## 6. 로드맵/inventory 배정

- `CUS-001`~`CUS-004`(`blocknote-free-feature-inventory.md` §3.10)를 그대로 사용 — 신규 ID 불필요.
- `current-status.md`/`roadmap.md` 갱신 없음(§1, 그릴링 라운드4 Q4).
- 착수 시점에 GitHub Issue 등록(`docs/agents/issue-tracker.md` 절차) 후 `docs/agents/workflow-shared.md`의 DELTA 크기 규칙으로 레인 판정 — model/core/io/react 4패키지를 동시에 건드리므로("서로 다른 패키지 세 개 이상" 경계 신호에 해당) roadmap-workflow가 될 가능성이 높고, 4계층을 여러 DELTA로 쪼갤 필요가 있다.

## 7. 완료 기준

- [ ] `IframeBlock`이 `Block` 유니온과 `KNOWN_BLOCK_TYPES`에 포함되고 model unit 테스트(`iframeBlockSchema`, `resolveIframeEmbedDecision`의 protocol/whitelist/custom-url/private-network 4개 거부 사유)가 통과한다.
- [ ] `setIframeSrc`가 whitelist provider/커스텀 URL(opt-in)/차단된 protocol/private network 4가지 케이스를 core unit 테스트로 검증한다.
- [ ] resize(`setMediaPreviewWidth`)/정렬(`setMediaTextAlignment`)이 iframe kind에도 동일하게 동작함을 core unit 테스트로 검증한다.
- [ ] Turn into 배제, 삭제/복제/이동이 다른 atom 블록과 동일하게 동작함을 core unit 테스트로 검증한다.
- [ ] HTML export가 검증 통과 src에 한해 실제 `<iframe sandbox allow referrerpolicy>` 태그를 방출함을 unit 테스트로 고정한다.
- [ ] 외부 HTML/클립보드에 포함된 raw `<iframe>` 태그가 import/paste 양쪽에서 여전히 strip됨을 security regression 테스트로 고정한다(sanitize-schema 변경 없음 확인).
- [ ] geul 자체 export→import 라운드트립(wrapper 속성 기반 재구성)이 unit 테스트로 고정된다.
- [ ] GFM lossy export(`MEDIA_TYPE_LOST` 등)와 import 미지원이 unit 테스트로 고정된다.
- [ ] 슬래시커맨드 삽입, 리사이즈, 정렬, Interact 토글, 새 창 열기/복제/삭제가 Chromium e2e로 검증된다.
- [ ] whitelist 밖 URL + custom URL 비활성 상태에서 삽입 거절 UI가 e2e로 검증된다.
- [ ] 로딩 타임아웃 휴리스틱 문구가 e2e로 검증된다(느린 로드 오탐 케이스는 수동 확인으로 대체 가능).
- [ ] en/ko dictionary에 `slashMenu.iframe`/`toolbar.kindNames.iframe`이 채워진다.

## 8. 범위 밖

- **v2 백로그**(그릴링 라운드1 Q4 phased 결정): width preset(Wide/Full/Custom), aspect ratio 프리셋+lock/unlock(현재 `16:9` 고정에서 유니온 확장), 상하 resize, fullscreen, tablet/mobile 세부 반응형 정책, provider별 sandbox/allow override, interaction UX 다듬기(현재는 클릭 한 번으로 즉시 토글).
- `customBlocks`(EXT-001) 경로 — 네이티브 블록으로 확정(§1).
- p5.js 전용 처리 — `roadmap.md:23`이 이미 "범용 iframe 지원만으로 커버"라고 명시, 별도 기능 없음.
- `MediaBlockKind`/`MediaToolbar` 등의 전면 rename(iframe 추가로 "Media"라는 이름이 다소 부정확해졌으나, 광범위 재사용 지점을 건드리는 리팩터라 이번 범위 밖).
- width preset(v2)에 맞춘 `previewWidth`의 객체 스키마 마이그레이션 — media 4종 전체에 영향을 주는 별도 결정(§1).
- 신규 ADR — ADR-0002(레이어 경계)/ADR-0003(sanitize 후 의미 변환)를 그대로 준수하므로 신규 ADR 불필요.
