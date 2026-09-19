import {
  isCanonicalCellAlign,
  isCanonicalCellColor,
  isNestableBlockType,
  isSupportedMediaUrl,
  isValidMediaPreviewWidth,
  resolveIframeEmbedDecision,
  type Result,
} from "@cp949/geul-model";
import { closeHistory } from "@tiptap/pm/history";

import {
  findBlockPosition,
  findEditableBlockContent,
} from "./block-position.js";
import type { EditorError } from "./errors.js";
import { type MediaBlockKind } from "./media-block-kind.js";
import {
  commandNotApplicable,
  type ProductionEditorSession,
} from "./production-editor-session.js";

// setMediaTextAlignment/getSelectionMediaBlock이 공유하는 kind 가드 —
// media 5종 중 image/video/iframe만 정렬을 지원한다(Issue #154, MED-009;
// iframe은 roadmap Issue #212 RD-002 DELTA-02, spec §3 previewAttributes
// 재사용). getSelectionMediaBlock(editor-controller.ts)이 textAlignment
// 필드 유효성 판정에도 재사용하므로 factory 밖 module-level export로 둔다.
export const isTextAlignableMediaBlockKind = (
  name: string,
): name is "image" | "video" | "iframe" =>
  name === "image" || name === "video" || name === "iframe";

// 기존 블록·미디어 블록의 attrs를 blockId로 찾아 바꾸는 명령 묶음
// (setBlockTextColor 등 + setMediaBlockUrl 등 + 업로드 래퍼).
// editor-controller.ts의 createEditor에서 분리했다 — 다른 커맨드 그룹과
// 교차 참조가 없어 session 하나만 받는 독립 팩토리로 뗀다.
export const createBlockAttributeCommands = (
  session: ProductionEditorSession,
) => {
  // setBlockTextColor/setBlockBackgroundColor/setBlockTextAlignment(RD-002
  // DELTA-02)가 공유하는 본체. TextBlockProps 3필드 모두 blockContainer
  // attrs에 있다(RD-001 DELTA-02, block-container-extension.ts) — blockId로
  // 그 컨테이너를 찾고(BLOCK_NOT_FOUND), 콘텐츠 타입이 isNestableBlockType
  // 7종(paragraph/heading/quote/목록 4종)이 아니면 COMMAND_NOT_APPLICABLE로
  // 거절한다. table·divider는 blockContainer로 감싸이지 않아 첫 조건에서,
  // codeBlock은 leafBlockContent라 isNestableBlockType에서 걸린다(spec
  // §3.3). 값 검증(validate)과 attrs 병합(nextAttrs)만 property별로 주입받고,
  // nextAttrs는 항상 기존 attrs를 스프레드한 뒤 대상 필드만 바꾼다 —
  // setNodeMarkup에 부분 attrs를 넘기면 나머지가 schema default(null)로
  // 리셋되는 함정을 피한다(check-list-item-commands.ts와 동일 경계).
  const runSetBlockTextPropCommand = (
    command: string,
    blockId: string,
    value: string | null,
    validate: (value: string) => EditorError | null,
    nextAttrs: (
      attrs: Record<string, unknown>,
      value: string | null,
    ) => Record<string, unknown>,
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (
      node.type.name !== "blockContainer" ||
      !isNestableBlockType(node.child(0).type.name)
    ) {
      return commandNotApplicable(command);
    }
    if (value !== null) {
      const error = validate(value);
      if (error !== null) return { ok: false, error };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        nextAttrs(node.attrs, value),
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

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

  // setMediaBlockUrl/Name/Caption/BackgroundColor가 공유하는 본체.
  // runSetBlockTextPropCommand와 같은 모양(찾기→가드→검증→setNodeMarkup 1회)
  // 이지만 가드가 다르다 — media 4종은 divider·table처럼 blockContainer로
  // 감싸이지 않는 atom이라(media-block-extension.ts) 그 helper의
  // `blockContainer && isNestableBlockType` 가드를 그대로 못 쓴다(RD-001.md
  // "결정"). setNodeMarkup으로 attrs 일부만 바꿔도 나머지는 항상
  // node.attrs를 스프레드해 유지한다 — 부분 attrs를 넘기면 schema
  // default(null)로 리셋되는 함정을 그대로 피한다.
  //
  // Issue #168 roadmap RD-001 DELTA-05 — nextAttrs 적용 전후로
  // localPreviewUrl 전환(문자열→null)을 감지해 커밋 성공 시
  // session.notifyLocalPreviewCleared를 호출한다. 4개 호출자 중
  // setMediaBlockUrl의 nextAttrs만 실제로 그 전환을 만든다(아래 참고) —
  // Name/Caption/BackgroundColor는 localPreviewUrl을 전혀 건드리지 않아
  // 이 감지가 자동으로 no-op이다. command 문자열 분기 대신 attrs 상태로
  // 판정하므로 앞으로 url을 세팅하는 새 명령이 추가돼도 같은 정리가
  // 자동으로 적용된다.
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
  ): Result<void, EditorError> => {
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isApplicableNodeName(node.type.name)) {
      return commandNotApplicable(command);
    }
    if (value !== null) {
      const error = validate(value);
      if (error !== null) return { ok: false, error };
    }
    const updatedAttrs = nextAttrs(node.attrs, value);
    const clearedLocalPreview =
      typeof node.attrs.localPreviewUrl === "string" &&
      updatedAttrs.localPreviewUrl === null
        ? {
            localPreviewUrl: node.attrs.localPreviewUrl,
            localPreviewFile: node.attrs.localPreviewFile as File,
          }
        : null;
    const result = session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        updatedAttrs,
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
    if (result.ok && clearedLocalPreview !== null) {
      session.notifyLocalPreviewCleared(blockId, clearedLocalPreview);
    }
    return result;
  };

  // media 5종 중 image/video/iframe만 리사이즈를 지원한다(spec §3 —
  // iframe은 explicit width 없이는 브라우저 기본값(300x150)으로
  // 찌그러져 image/video와 동일하게 setMediaPreviewWidth 대상이다,
  // roadmap Issue #212 RD-002 DELTA-02).
  const isResizableMediaBlockKind = (
    name: string,
  ): name is "image" | "video" | "iframe" =>
    name === "image" || name === "video" || name === "iframe";

  // setMediaPreviewWidth 전용 본체. runSetMediaBlockAttrCommand를 재사용하지
  // 않는다 — 값 타입이 string이 아니라 number이고, kind 가드도 4종 전체가
  // 아니라 image/video만이라(위 isResizableMediaBlockKind) 그 헬퍼의
  // `value: string | null` 시그니처에 끼워 넣을 수 없다(readiness probe
  // 결론, RD-001-DELTA-01.md "배경" 참고). "찾기→가드→검증→setNodeMarkup
  // 1회" 골격은 위 두 헬퍼와 동일하게 따른다.
  const runSetMediaPreviewWidthCommand = (
    blockId: string,
    width: number,
  ): Result<void, EditorError> => {
    const command = "setMediaPreviewWidth";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isResizableMediaBlockKind(node.type.name)) {
      return { ok: false, error: { code: "MEDIA_RESIZE_NOT_SUPPORTED" } };
    }
    if (!isValidMediaPreviewWidth(width)) {
      return {
        ok: false,
        error: {
          code: "DOCUMENT_INVALID",
          message: "previewWidth must be a positive finite number",
        },
      };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, previewWidth: width },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  const isPreviewToggleableMediaBlockKind = (
    name: string,
  ): name is "image" | "video" | "audio" =>
    name === "image" || name === "video" || name === "audio";

  // setMediaShowPreview 전용 본체(RD-002 DELTA-01). 위
  // runSetMediaPreviewWidthCommand와 같은 "찾기→가드→setNodeMarkup 1회"
  // 골격이지만 값 타입이 boolean이고 kind 가드가 반대 방향이다(resize는
  // image/video만 허용해 audio/file을 거절하지만, 이 명령은 image/video/
  // audio를 허용하고 file만 거절한다 — 위 isPreviewToggleableMediaBlockKind).
  // boolean은 TS 시그니처 자체가 값 공간 전체를 강제하므로(model
  // showPreview?: boolean과 동형) previewWidth처럼 별도 값 검증 단계가 없다.
  const runSetMediaShowPreviewCommand = (
    blockId: string,
    show: boolean,
  ): Result<void, EditorError> => {
    const command = "setMediaShowPreview";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isPreviewToggleableMediaBlockKind(node.type.name)) {
      return {
        ok: false,
        error: { code: "MEDIA_PREVIEW_TOGGLE_NOT_SUPPORTED" },
      };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, showPreview: show },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // setCodeBlockWrap 전용 본체(RD-001 DELTA-02, Issue #194). media 계열과
  // 달리 `wrap`은 blockContainer가 아니라 codeBlock 콘텐츠 노드 자신의
  // attrs다(language와 같은 자리, code-block-extension.ts) — findBlockPosition
  // (blockContainer 위치)이 아니라 findEditableBlockContent(콘텐츠 노드
  // 자신의 위치, generic-block-type-commands.ts의 setBlockType이 language를
  // 읽고 쓸 때 쓰는 것과 동일 프리미티브)로 찾는다. 가드는 kind 부분집합이
  // 아니라 단일 타입 — codeBlock은 media 4종처럼 서로 다른 kind로 나뉘지
  // 않는다. 불일치는 media처럼 전용 에러 코드를 새로 만들지 않고
  // commandNotApplicable을 쓴다(runSetBlockTextPropCommand의 블록타입
  // 불일치 분기와 동일 근거 — "대상이 codeBlock 자체가 아니다"는 kind 세부
  // 정책이 아니라 명령 부적합이다). 값이 boolean 타입 자체로 이미 값공간
  // 전체를 강제하므로 runSetMediaShowPreviewCommand와 같은 이유로 별도 값
  // 검증이 없다.
  const runSetCodeBlockWrapCommand = (
    blockId: string,
    wrap: boolean,
  ): Result<void, EditorError> => {
    const command = "setCodeBlockWrap";
    if (session.isDestroyed) return commandNotApplicable(command);
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (target.node.type.name !== "codeBlock") {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        target.position,
        undefined,
        { ...target.node.attrs, wrap },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // setCodeBlockCaption 전용 본체(RD-002 DELTA-02, Issue #194).
  // runSetCodeBlockWrapCommand와 완전히 같은 "찾기(findEditableBlockContent)
  // →가드(단일 타입)→setNodeMarkup 1회" 골격이다 — caption은 codeBlock
  // 콘텐츠 노드 자신의 attrs이지 blockContainer attrs가 아니다(model
  // CodeBlock.caption, code-block-extension.ts). wrap과 다른 점은 값이
  // boolean이 아니라 string이라 타입 자체로 값공간이 닫히지 않는다는
  // 것인데, `setMediaBlockCaption`(media 자유 텍스트 caption)도 같은 이유로
  // 별도 형식 검증이 없다 — 그 선례를 따라 여기도 길이 상한 등 정책 판단을
  // 추가하지 않는다(G-CNV-001, model이 유일 검증 권위).
  const runSetCodeBlockCaptionCommand = (
    blockId: string,
    caption: string,
  ): Result<void, EditorError> => {
    const command = "setCodeBlockCaption";
    if (session.isDestroyed) return commandNotApplicable(command);
    const target = findEditableBlockContent(session.editor.state.doc, blockId);
    if (target === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (target.node.type.name !== "codeBlock") {
      return commandNotApplicable(command);
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        target.position,
        undefined,
        { ...target.node.attrs, caption },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // setMediaTextAlignment 전용 본체(Issue #154, MED-009). 위
  // runSetMediaPreviewWidthCommand·runSetMediaShowPreviewCommand와 같은
  // "찾기→가드→검증→setNodeMarkup 1회" 골격이지만, kind 가드 집합이
  // isResizableMediaBlockKind(image/video)와 우연히 같아도 관심사가
  // 다르므로(리사이즈가 아니라 정렬) 공유하지 않고 전용 가드를 새로 둔다
  // (runSetMediaShowPreviewCommand 위 주석이 이미 "명령마다 전용 가드
  // 함수" 컨벤션의 이유를 문서화). 값 검증은 setBlockTextAlignment
  // (runSetBlockTextPropCommand)와 동일하게 isCanonicalCellAlign을
  // 재사용한다 — value가 TS 시그니처로 이미 좁혀져 있어도(런타임 caller가
  // 그 타입을 우회할 수 있으므로) 방어적으로 검증한다.
  const runSetMediaTextAlignmentCommand = (
    blockId: string,
    alignment: "left" | "center" | "right" | null,
  ): Result<void, EditorError> => {
    const command = "setMediaTextAlignment";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isTextAlignableMediaBlockKind(node.type.name)) {
      return {
        ok: false,
        error: { code: "MEDIA_TEXT_ALIGNMENT_NOT_SUPPORTED" },
      };
    }
    if (alignment !== null && !isCanonicalCellAlign(alignment)) {
      return { ok: false, error: { code: "INVALID_ALIGN", align: alignment } };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, textAlignment: alignment },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

  // setIframeSrc 전용 본체(CUS-001~004, roadmap Issue #212 RD-002 DELTA-02,
  // spec §3). runSetMediaPreviewWidthCommand와 같은 "찾기→가드→검증→
  // setNodeMarkup 1회" 골격이지만 검증이 model isValidMediaPreviewWidth가
  // 아니라 model resolveIframeEmbedDecision(URL 허용 정책, host가 주입한
  // session.getIframeEmbedConfig())이다. runSetMediaBlockAttrCommand(file/
  // image/video/audio 전용)를 재사용하지 않는다 — 대상 kind가 "iframe"
  // 단일 타입이고(4종 전체가 아님), 로컬 프리뷰 정리 감지도 필요 없다
  // (iframe은 업로드 플로우가 없어 localPreviewUrl이 항상 null).
  const runSetIframeSrcCommand = (
    blockId: string,
    url: string,
  ): Result<void, EditorError> => {
    const command = "setIframeSrc";
    if (session.isDestroyed) return commandNotApplicable(command);
    const { doc } = session.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (node.type.name !== "iframe") {
      return commandNotApplicable(command);
    }
    const decision = resolveIframeEmbedDecision(
      url,
      session.getIframeEmbedConfig(),
    );
    if (!decision.allowed) {
      return {
        ok: false,
        error: { code: "IFRAME_URL_NOT_ALLOWED", reason: decision.reason },
      };
    }
    return session.runDocumentCommand(command, "local", () => {
      const transaction = session.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        { ...node.attrs, url },
      );
      session.editor.view.dispatch(closeHistory(transaction));
      return true;
    });
  };

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
    align: "left" | "center" | "right" | null,
  ): Result<void, EditorError> =>
    runSetBlockTextPropCommand(
      "setBlockTextAlignment",
      blockId,
      align,
      (value) =>
        isCanonicalCellAlign(value)
          ? null
          : { code: "INVALID_ALIGN", align: value },
      (attrs, value) => ({ ...attrs, textAlignment: value }),
    );
  const setMediaBlockUrl = (
    blockId: string,
    url: string,
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
      // 정리한다(RD-001 DELTA-05) — 신호 발생은 runSetMediaBlockAttrCommand가
      // 이 전환(문자열→null) 자체를 감지해 담당한다.
      (attrs, value) => ({
        ...attrs,
        url: value,
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
  const setMediaPreviewWidth = (
    blockId: string,
    width: number,
  ): Result<void, EditorError> =>
    runSetMediaPreviewWidthCommand(blockId, width);
  const setMediaShowPreview = (
    blockId: string,
    show: boolean,
  ): Result<void, EditorError> => runSetMediaShowPreviewCommand(blockId, show);
  const setMediaTextAlignment = (
    blockId: string,
    alignment: "left" | "center" | "right" | null,
  ): Result<void, EditorError> =>
    runSetMediaTextAlignmentCommand(blockId, alignment);
  const setIframeSrc = (
    blockId: string,
    url: string,
  ): Result<void, EditorError> => runSetIframeSrcCommand(blockId, url);
  const setCodeBlockWrap = (
    blockId: string,
    wrap: boolean,
  ): Result<void, EditorError> => runSetCodeBlockWrapCommand(blockId, wrap);
  const setCodeBlockCaption = (
    blockId: string,
    caption: string,
  ): Result<void, EditorError> =>
    runSetCodeBlockCaptionCommand(blockId, caption);
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
