import { isSupportedLinkHref, type Result } from "@cp949/geul-model";
import type { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";

import { findBlockPosition } from "./block-position.js";
import type { EditorError } from "./errors.js";
import { isMediaBlockKind } from "./media-block-kind.js";
import type {
  MediaUploadState,
  UploadFile,
  UploadResult,
} from "./media-upload.js";

// production-editor-session.ts의 export본을 import하면 그 파일이 이 신규
// 파일을 import하는 것과 맞물려 순환 의존이 생긴다. toggle-collapse-commands.ts/
// check-list-item-commands.ts/indent-commands.ts/block-type-commands.ts가
// 이미 같은 이유로 각자 로컬 사본을 두는 선례를 따른다.
const commandNotApplicable = (command: string): Result<never, EditorError> => ({
  ok: false,
  error: { code: "COMMAND_NOT_APPLICABLE", command },
});

// ProductionEditorSession이 구현해야 할 최소 표면 — MediaUploadTracker가
// 세션 내부 상태(currentDocument 등)에 직접 접근하지 않고 이 구조적
// 인터페이스로만 세션과 통신한다. reason 파라미터는 이 모듈에서 항상
// "local"만 쓰므로 "local" 리터럴로 좁혀 선언한다(ChangeReason 타입을 새로
// export하지 않는다).
export interface MediaUploadHost {
  // 세션의 기존 isDestroyed/editor 공개 getter 이름을 그대로 딴다 —
  // `new MediaUploadTracker(this)`가 세션의 실제 공개 표면과 구조적으로
  // 맞아야 어댑터 객체 없이 `this`를 곧바로 넘길 수 있다.
  readonly isDestroyed: boolean;
  readonly editor: Editor;
  readonly uploadFile: UploadFile | undefined;
  runDocumentCommand(
    command: string,
    reason: "local",
    run: () => boolean,
  ): Result<void, EditorError>;
  notifyUploadStateChange(
    blockId: string,
    state: MediaUploadState | null,
  ): void;
}

// spec §4.2 — blockSelection과 같은 세션 전용 상태(모델 스키마 밖,
// runDocumentCommand 밖). uploadState는 "uploading" | 에러 상태만 담는다
// (성공·취소는 흔적을 남기지 않고 항목을 지운다). uploadControllers는
// 진행 중인 업로드의 AbortController만 담고 완료 즉시 제거한다 —
// cancelMediaUpload(editor-controller.ts)가 이 맵으로 취소 대상을 찾는다.
export class MediaUploadTracker {
  private readonly uploadState = new Map<string, MediaUploadState>();
  private readonly uploadControllers = new Map<string, AbortController>();

  constructor(private readonly host: MediaUploadHost) {}

  getMediaUploadState(blockId: string): MediaUploadState | null {
    return this.uploadState.get(blockId) ?? null;
  }

  getMediaUploadController(blockId: string): AbortController | null {
    return this.uploadControllers.get(blockId) ?? null;
  }

  // 업로드 시작 — 컨트롤러를 등록하고 상태를 "uploading"으로 알린다.
  // 호출자(editor-controller.ts::runMediaUpload)가 같은 블록의 진행 중
  // 업로드가 없는지 먼저 확인한다(getMediaUploadController).
  beginMediaUpload(blockId: string): AbortController {
    const controller = new AbortController();
    this.uploadControllers.set(blockId, controller);
    this.setMediaUploadState(blockId, "uploading");
    return controller;
  }

  // 업로드 종료 — 진행 중 컨트롤러를 제거하고 최종 상태를 알린다.
  // outcome이 null이면 성공·취소(흔적 없음)이고, 에러면 code·message가
  // pending 상태로 남는다(spec §4.2).
  endMediaUpload(blockId: string, outcome: MediaUploadState | null): void {
    this.uploadControllers.delete(blockId);
    this.setMediaUploadState(blockId, outcome);
  }

  private setMediaUploadState(
    blockId: string,
    state: MediaUploadState | null,
  ): void {
    if (state === null) {
      this.uploadState.delete(blockId);
    } else {
      this.uploadState.set(blockId, state);
    }
    this.host.notifyUploadStateChange(blockId, state);
  }

  // spec §4 — uploadMediaFile이 성공 분기에서 쓰는 본체(RD-002 DELTA-02가
  // editor-controller.ts에서 이 세션으로 이동 — 이동 사유는 uploadMediaFile
  // 주석 참고). url+name을 단일 트랜잭션으로 세팅한다(spec §4.2 "url 및
  // 반환된 name을 단일 트랜잭션으로 세팅"). name이 undefined면 기존
  // node.attrs를 스프레드해 그대로 유지한다 — setNodeMarkup에 부분 attrs를
  // 넘기면 나머지가 schema default로 리셋되는 함정을 피한다.
  private applyUploadedMediaAttrs(
    command: string,
    blockId: string,
    url: string,
    name: string | undefined,
  ): boolean {
    const { doc } = this.host.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (
      position === null ||
      node === null ||
      !isMediaBlockKind(node.type.name)
    ) {
      return false;
    }
    return this.host.runDocumentCommand(command, "local", () => {
      const nextAttrs = {
        ...node.attrs,
        url,
        ...(name === undefined ? {} : { name }),
      };
      const transaction = this.host.editor.state.tr.setNodeMarkup(
        position,
        undefined,
        nextAttrs,
      );
      this.host.editor.view.dispatch(closeHistory(transaction));
      return true;
    }).ok;
  }

  // spec §4 — uploadMediaFile/replaceMediaBlockFile(editor-controller.ts)와
  // MediaDropPasteExtension의 drop/paste 트리거(RD-002 DELTA-02) 공용
  // 본체다. editor-controller.ts::createEditor()의 옛 `runMediaUpload`
  // 클로저를 그대로 이 세션 메서드로 옮겼다 — 그 클로저는 `session = new
  // ProductionEditorSession(options)` 다음 줄부터 정의돼 세션 생성자 안의
  // createTiptapEditor()가 만드는 MediaDropPasteExtension 시점엔 존재하지
  // 않았다(RD-002-DELTA-02.md "배경"). 콜백 호출 → pending "uploading" →
  // 완료 분기 순으로 진행한다. 사전 조건 실패(파괴됨·콜백 미등록·대상
  // 없음·대상이 media 아님·이미 진행 중)만 즉시 ok:false로 알리고, 콜백이
  // 실제로 정착한 뒤의 성공/실패/취소는 항상 ok:true로 해결된다 — 결과는
  // getMediaUploadState()/onUploadStateChange로만 관찰한다(pending 상태가
  // 유일한 진실 소스, Promise 값과 이중 소스로 나누지 않는다). drop/paste
  // 트리거는 이 Promise를 기다리지 않고 fire-and-forget으로 호출한다(RD-001
  // "결정" — 공개 uploadMediaFile과 동일 원칙).
  async uploadMediaFile(
    command: string,
    blockId: string,
    file: File,
  ): Promise<Result<void, EditorError>> {
    if (this.host.isDestroyed) return commandNotApplicable(command);
    const { uploadFile } = this.host;
    if (uploadFile === undefined) {
      return commandNotApplicable(command);
    }
    const { doc } = this.host.editor.state;
    const position = findBlockPosition(doc, blockId);
    const node = position === null ? null : doc.nodeAt(position);
    if (position === null || node === null) {
      return { ok: false, error: { code: "BLOCK_NOT_FOUND", blockId } };
    }
    if (!isMediaBlockKind(node.type.name)) {
      return commandNotApplicable(command);
    }
    if (this.getMediaUploadController(blockId) !== null) {
      return commandNotApplicable(command);
    }

    const controller = this.beginMediaUpload(blockId);
    let result: UploadResult;
    try {
      result = await uploadFile(file, controller.signal);
    } catch {
      result = {
        status: "error",
        code: "UPLOAD_CALLBACK_THREW",
        message: "uploadFile 콜백이 reject했다",
      };
    }

    if (this.host.isDestroyed) return { ok: true, value: undefined };
    // 경합 가드(spec §4.2) — 완료 시점에 대상 블록이 여전히 존재하는지
    // 재확인한다. undo로 사라지거나 다른 파일로 교체된 뒤 이전 결과가
    // 늦게 도착하는 경우를 막는다. 존재하지 않으면 결과 종류와 무관하게
    // 완료 결과를 무시하고 pending 상태만 지운다.
    const stillExists =
      findBlockPosition(this.host.editor.state.doc, blockId) !== null;
    if (!stillExists) {
      this.endMediaUpload(blockId, null);
      return { ok: true, value: undefined };
    }

    if (result.status === "cancelled") {
      this.endMediaUpload(blockId, null);
      return { ok: true, value: undefined };
    }
    if (result.status === "error") {
      this.endMediaUpload(blockId, {
        status: "error",
        code: result.code,
        message: result.message,
      });
      return { ok: true, value: undefined };
    }

    // success — url이 기존 setMediaBlockUrl과 동일한 정책을 통과해야
    // 한다(isSupportedLinkHref 재사용, 신규 URL 검증 코드 없음). 위반하면
    // 업로드는 "콜백 성공"이었지만 geul은 문서를 바꾸지 않고 에러
    // pending으로 흡수한다 — 업로드 성공이 URL 정책을 우회하는 구멍을
    // 막는다.
    if (!isSupportedLinkHref(result.url)) {
      this.endMediaUpload(blockId, {
        status: "error",
        code: "LINK_HREF_REJECTED",
        message: `업로드 결과 URL이 허용되지 않는다: ${result.url}`,
      });
      return { ok: true, value: undefined };
    }
    // 반환값(boolean)을 무시한다 — stillExists 재확인과 이 호출 사이에
    // await이 없어(동기 연속) 대상이 사라지거나 media가 아니게 될 수
    // 없다. revision overflow만 이론상 false를 만들 수 있지만 기존
    // undo/redo도 그 경계에서 같은 방식(commandNotApplicable)으로 조용히
    // 흡수한다 — 이 명령만 다르게 취급할 계약상 근거가 없다.
    this.applyUploadedMediaAttrs(command, blockId, result.url, result.name);
    this.endMediaUpload(blockId, null);
    return { ok: true, value: undefined };
  }
}
