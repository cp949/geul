import {
  isCanonicalCellAlign,
  isCanonicalCellColor,
  isCanonicalTextBlockAlign,
  isNestableBlockType,
  isSupportedMediaUrl,
  isValidMediaPreviewWidth,
  mediaBlockTypeHasField,
  resolveIframeEmbedDecision,
  type Result,
  type TextBlockAlignment,
} from "@cp949/geul-model";

import { runBlockAttrCommand } from "./block-attr-command.js";
import type { EditorError } from "./errors.js";
import { type MediaBlockKind } from "./media-block-kind.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// 기존 블록·미디어 블록의 attrs를 blockId로 찾아 바꾸는 명령 묶음
// (setBlockTextColor 등 + setMediaBlockUrl 등 + 업로드 래퍼).
// editor-controller.ts의 createEditor에서 분리했다 — 다른 커맨드 그룹과
// 교차 참조가 없어 session 하나만 받는 독립 팩토리로 뗀다.
export const createBlockAttributeCommands = (
  session: ProductionEditorSession,
) => {
  // setBlockTextColor/setBlockBackgroundColor/setBlockTextAlignment(RD-002
  // DELTA-02)가 공유하는 본체. TextBlockProps 3필드 모두 blockContainer
  // attrs에 있다(RD-001 DELTA-02, block-container-extension.ts) — 콘텐츠
  // 타입이 isNestableBlockType 7종(paragraph/heading/quote/목록 4종)이
  // 아니면 COMMAND_NOT_APPLICABLE로 거절한다. table·divider는
  // blockContainer로 감싸이지 않아 첫 조건에서, codeBlock은
  // leafBlockContent라 isNestableBlockType에서 걸린다(spec §3.3). 값
  // 검증(validate)과 attrs 병합(nextAttrs)만 property별로 주입받는다.
  const runSetBlockTextPropCommand = (
    command: string,
    blockId: string,
    value: string | null,
    validate: (value: string) => EditorError | null,
    nextAttrs: (
      attrs: Record<string, unknown>,
      value: string | null,
    ) => Record<string, unknown>,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command,
      blockId,
      target: "block",
      appliesTo: (node) =>
        node.type.name === "blockContainer" &&
        isNestableBlockType(node.child(0).type.name),
      validate: () => (value === null ? null : validate(value)),
      nextAttrs: (attrs) => nextAttrs(attrs, value),
    });

  const isMediaBlockNodeName = (name: string): name is MediaBlockKind =>
    name === "file" || name === "image" || name === "video" || name === "audio";

  // setMediaBlockName/BackgroundColor 전용 확장 — iframe(CUS-001~004, roadmap
  // Issue #212 RD-004 DELTA-02 readiness 발견)의 name은 다른 4종처럼 구조만
  // 있고 의미 없는 필드가 아니라 iframe-block-extension.ts의 renderHTML이
  // 실제 `<iframe title="...">` 접근성 속성으로 렌더링한다 — 세팅 경로가
  // 있어야 한다. backgroundColor도 model IframeBlock이 MediaBlockCommon을
  // 통해 그대로 허용하는 순수 스타일 필드라 같이 넓힌다. setMediaBlockUrl은
  // 예외로 그대로 기본 isMediaBlockNodeName(4종)을 쓴다 — 넓히면
  // resolveIframeEmbedDecision(화이트리스트·private network 정책)을 모르는
  // 이 명령으로 iframe url을 세팅할 수 있게 돼 setIframeSrc가 강제하는
  // 보안 경계를 우회하는 회귀가 생긴다. setMediaBlockCaption은 v1에서 iframe
  // caption 자체를 노출하지 않기로 한 별도 스펙 결정이라(media-toolbar.tsx
  // "iframe은 caption을 노출하지 않는다" 참고) 4종 그대로 둔다 — 그래서 이
  // predicate는 setMediaBlockName/BackgroundColor 호출부에서만 명시로
  // 넘긴다.
  const isMediaOrIframeBlockNodeName = (name: string): name is MediaBlockKind =>
    isMediaBlockNodeName(name) || name === "iframe";

  // setMediaBlockUrl/Name/Caption/BackgroundColor가 공유하는 본체. media
  // 4종은 divider·table처럼 blockContainer로 감싸이지 않는 atom이라
  // (media-block-extension.ts) 위 helper의 `blockContainer &&
  // isNestableBlockType` 가드를 그대로 못 쓴다(RD-001.md "결정").
  //
  // url을 확정하는 호출(setMediaBlockUrl)은 같은 transaction에서 로컬 프리뷰
  // attrs를 null로 정리하지만 통지는 하지 않는다(Issue #382). undo로 URL이
  // 문서에 돌아올 수 있어서다. 통지는 MediaLocalPreviewLifecycleExtension이
  // 그 URL이 undo·redo로 못 돌아올 때 낸다.
  const runSetMediaBlockAttrCommand = (
    command: string,
    blockId: string,
    value: string | null,
    validate: (value: string) => EditorError | null,
    nextAttrs: (
      attrs: Record<string, unknown>,
      value: string | null,
    ) => Record<string, unknown>,
    isApplicableNodeName: (name: string) => boolean = isMediaBlockNodeName,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command,
      blockId,
      target: "block",
      appliesTo: (node) => isApplicableNodeName(node.type.name),
      validate: () => (value === null ? null : validate(value)),
      nextAttrs: (attrs) => nextAttrs(attrs, value),
    });

  const setMediaPreviewWidth = (
    blockId: string,
    width: number,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command: "setMediaPreviewWidth",
      blockId,
      target: "block",
      appliesTo: (node) =>
        mediaBlockTypeHasField(node.type.name, "previewWidth"),
      unsupported: { code: "MEDIA_RESIZE_NOT_SUPPORTED" },
      validate: () =>
        isValidMediaPreviewWidth(width)
          ? null
          : {
              code: "DOCUMENT_INVALID",
              message: "previewWidth must be a positive finite number",
            },
      nextAttrs: (attrs) => ({ ...attrs, previewWidth: width }),
    });

  // 리사이즈는 previewWidth를 소유한 종류(image/video/iframe)만 허용해
  // audio/file을 거절하지만, 이 명령은 showPreview를 소유한 image/video/
  // audio를 허용하고 file·iframe을 거절한다(RD-002 DELTA-01). 대상 판정은
  // model의 MEDIA_BLOCK_FIELDS가 소유한다.
  // boolean은 TS 시그니처 자체가 값 공간 전체를 강제하므로 별도 값 검증이
  // 없다.
  const setMediaShowPreview = (
    blockId: string,
    show: boolean,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command: "setMediaShowPreview",
      blockId,
      target: "block",
      appliesTo: (node) =>
        mediaBlockTypeHasField(node.type.name, "showPreview"),
      unsupported: { code: "MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED" },
      nextAttrs: (attrs) => ({ ...attrs, showPreview: show }),
    });

  // codeBlock의 `wrap`·`caption`은 blockContainer가 아니라 codeBlock 콘텐츠
  // 노드 자신의 attrs다(language와 같은 자리, code-block-extension.ts,
  // RD-001 DELTA-02·RD-002 DELTA-02, Issue #194). 그래서 target이
  // "content"다. 가드는 단일 타입이고, 불일치는 media처럼 전용 에러 코드를
  // 만들지 않고 COMMAND_NOT_APPLICABLE이다("대상이 codeBlock 자체가
  // 아니다"는 kind 세부 정책이 아니라 명령 부적합이다). wrap은 boolean이라
  // 값공간이 타입으로 닫히고, caption은 setMediaBlockCaption(media 자유
  // 텍스트)과 같은 이유로 별도 형식 검증이 없다(G-CNV-001, model이 유일
  // 검증 권위).
  const setCodeBlockWrap = (
    blockId: string,
    wrap: boolean,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command: "setCodeBlockWrap",
      blockId,
      target: "content",
      appliesTo: (node) => node.type.name === "codeBlock",
      nextAttrs: (attrs) => ({ ...attrs, wrap }),
    });
  const setCodeBlockCaption = (
    blockId: string,
    caption: string,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command: "setCodeBlockCaption",
      blockId,
      target: "content",
      appliesTo: (node) => node.type.name === "codeBlock",
      nextAttrs: (attrs) => ({ ...attrs, caption }),
    });

  // setMediaTextAlignment(Issue #154, MED-009). 대상은 textAlignment를
  // 소유한 종류다. previewWidth와 집합이 같아도 필드가 달라 따로 묻는다. 값
  // 검증은 setBlockTextAlignment와 동일하게 isCanonicalCellAlign을
  // 재사용한다 — value가 TS 시그니처로 이미 좁혀져 있어도(런타임 caller가
  // 그 타입을 우회할 수 있으므로) 방어적으로 검증한다.
  const setMediaTextAlignment = (
    blockId: string,
    alignment: "left" | "center" | "right" | null,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command: "setMediaTextAlignment",
      blockId,
      target: "block",
      appliesTo: (node) =>
        mediaBlockTypeHasField(node.type.name, "textAlignment"),
      unsupported: { code: "MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED" },
      validate: () =>
        alignment === null || isCanonicalCellAlign(alignment)
          ? null
          : { code: "INVALID_ALIGN", align: alignment },
      nextAttrs: (attrs) => ({ ...attrs, textAlignment: alignment }),
    });

  // setIframeSrc(CUS-001~004, roadmap Issue #212 RD-002 DELTA-02, spec §3).
  // 검증은 model resolveIframeEmbedDecision(URL 허용 정책, host가 주입한
  // session.getIframeEmbedConfig())이다. runSetMediaBlockAttrCommand(file/
  // image/video/audio 전용)를 재사용하지 않는다 — 대상 kind가 "iframe"
  // 단일 타입이고, 로컬 프리뷰 정리도 필요 없다(iframe은 업로드 플로우가
  // 없어 localPreviewUrl이 항상 null).
  //
  // name을 지정하면 같은 setNodeMarkup의 attrs에 url과 함께 넣는다(Issue
  // #374) — URL 적용과 이름 갱신이 별도 명령이면 closeHistory가 각각 박혀
  // undo가 두 번 필요하다. 거절 판정은 name과 무관하게 url 기준이다.
  const setIframeSrc = (
    blockId: string,
    url: string,
    name?: string,
  ): Result<void, EditorError> =>
    runBlockAttrCommand(session, {
      command: "setIframeSrc",
      blockId,
      target: "block",
      appliesTo: (node) => node.type.name === "iframe",
      validate: () => {
        const decision = resolveIframeEmbedDecision(
          url,
          session.getIframeEmbedConfig(),
        );
        return decision.allowed
          ? null
          : { code: "IFRAME_URL_NOT_ALLOWED", reason: decision.reason };
      },
      nextAttrs: (attrs) => ({
        ...attrs,
        url,
        ...(name === undefined ? {} : { name }),
      }),
    });

  const setBlockTextColor = (
    blockId: string,
    color: string | null,
  ): Result<void, EditorError> =>
    runSetBlockTextPropCommand(
      "setBlockTextColor",
      blockId,
      color,
      (value) =>
        isCanonicalCellColor(value)
          ? null
          : { code: "INVALID_COLOR", color: value },
      (attrs, value) => ({ ...attrs, textColor: value }),
    );
  const setBlockBackgroundColor = (
    blockId: string,
    color: string | null,
  ): Result<void, EditorError> =>
    runSetBlockTextPropCommand(
      "setBlockBackgroundColor",
      blockId,
      color,
      (value) =>
        isCanonicalCellColor(value)
          ? null
          : { code: "INVALID_COLOR", color: value },
      (attrs, value) => ({ ...attrs, backgroundColor: value }),
    );
  const setBlockTextAlignment = (
    blockId: string,
    align: TextBlockAlignment | null,
  ): Result<void, EditorError> =>
    runSetBlockTextPropCommand(
      "setBlockTextAlignment",
      blockId,
      align,
      (value) =>
        isCanonicalTextBlockAlign(value)
          ? null
          : { code: "INVALID_ALIGN", align: value },
      (attrs, value) => ({ ...attrs, textAlignment: value }),
    );
  // name을 지정하면 url과 같은 트랜잭션에서 세팅한다(Issue #374, G-EDT-001) —
  // 호출부가 setMediaBlockName을 따로 부르면 undo가 두 번 필요해진다.
  // 생략하면 name은 그대로다.
  const setMediaBlockUrl = (
    blockId: string,
    url: string,
    name?: string,
  ): Result<void, EditorError> =>
    runSetMediaBlockAttrCommand(
      "setMediaBlockUrl",
      blockId,
      url,
      (value) =>
        // spec §3.2 2026-09-11 개정·ADR-0017 — 미디어 url은 isSupportedMediaUrl
        // 전용(data:/blob:도 허용, link mark href와는 분리된 정책).
        isSupportedMediaUrl(value)
          ? null
          : { code: "LINK_HREF_REJECTED", href: value },
      // 로컬 프리뷰(ADR 0015)가 남아 있었으면 url 확정과 같은 트랜잭션에서
      // 정리한다(RD-001 DELTA-05). 통지는 하지 않는다(Issue #382).
      (attrs, value) => ({
        ...attrs,
        url: value,
        ...(name === undefined ? {} : { name }),
        ...(attrs.localPreviewUrl === null
          ? {}
          : { localPreviewUrl: null, localPreviewFile: null }),
      }),
    );
  const setMediaBlockName = (
    blockId: string,
    name: string,
  ): Result<void, EditorError> =>
    runSetMediaBlockAttrCommand(
      "setMediaBlockName",
      blockId,
      name,
      () => null,
      (attrs, value) => ({ ...attrs, name: value }),
      isMediaOrIframeBlockNodeName,
    );
  const setMediaBlockCaption = (
    blockId: string,
    caption: string,
  ): Result<void, EditorError> =>
    runSetMediaBlockAttrCommand(
      "setMediaBlockCaption",
      blockId,
      caption,
      () => null,
      (attrs, value) => ({ ...attrs, caption: value }),
    );
  const setMediaBlockBackgroundColor = (
    blockId: string,
    color: string | null,
  ): Result<void, EditorError> =>
    runSetMediaBlockAttrCommand(
      "setMediaBlockBackgroundColor",
      blockId,
      color,
      (value) =>
        isCanonicalCellColor(value)
          ? null
          : { code: "INVALID_COLOR", color: value },
      (attrs, value) => ({ ...attrs, backgroundColor: value }),
      // backgroundColor는 url 검증과 무관한 순수 스타일 필드다 — setMediaBlockUrl과
      // 달리 resolveIframeEmbedDecision 우회 위험이 없고, model IframeBlock도
      // MediaBlockCommon을 통해 backgroundColor를 그대로 허용한다(spec §2).
      // 기본 4종 predicate로 두면 model이 허용하는 필드를 커맨드 계층이
      // 이유 없이 iframe에서만 COMMAND_NOT_APPLICABLE로 거절하게 된다.
      isMediaOrIframeBlockNodeName,
    );
  // RD-002 DELTA-02 — 오케스트레이션 본체(session.uploadMediaFile)를
  // 세션으로 이동했다. 여기는 command 이름만 매개변수화해 위임하는
  // 얇은 wrapper다(공개 시그니처·Result/Promise 계약은 그대로).
  const uploadMediaFile = (
    blockId: string,
    file: File,
  ): Promise<Result<void, EditorError>> =>
    session.uploadMediaFile("uploadMediaFile", blockId, file);
  const replaceMediaBlockFile = (
    blockId: string,
    file: File,
  ): Promise<Result<void, EditorError>> =>
    session.uploadMediaFile("replaceMediaBlockFile", blockId, file);
  const cancelMediaUpload = (blockId: string): Result<void, EditorError> => {
    const controller = session.getMediaUploadController(blockId);
    if (controller === null) {
      return commandNotApplicable("cancelMediaUpload");
    }
    controller.abort();
    return { ok: true, value: undefined };
  };

  return {
    setBlockTextColor,
    setBlockBackgroundColor,
    setBlockTextAlignment,
    setMediaBlockUrl,
    setMediaBlockName,
    setMediaBlockCaption,
    setMediaBlockBackgroundColor,
    setMediaPreviewWidth,
    setMediaShowPreview,
    setMediaTextAlignment,
    setIframeSrc,
    setCodeBlockWrap,
    setCodeBlockCaption,
    uploadMediaFile,
    replaceMediaBlockFile,
    cancelMediaUpload,
  };
};
