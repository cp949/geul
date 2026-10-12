import type {
  Dictionary,
  EditorController,
  MediaBlockKind,
} from "@cp949/geul-core";

import { extractNameFromUrl } from "./extract-name-from-url.js";
import { iframeUrlRejectionMessage } from "./iframe-url-rejection-message.js";

// File Panel(빈 블록 채우기)과 Media Toolbar replacing(기존 블록 교체)이
// 같은 소스 적용 규칙을 쓴다. 두 컴포넌트의 selection 상태 기계는 따로 둔다
// (RD-003-DELTA-03.md "결정"). 이 파일은 상태와 무관한 규칙만 가진다.
// 규칙을 한 곳에 두어 한 표면에서 조합이 빠지는 일을 막는다(Issue #373).

/** Upload 탭 노출 여부. uploadFile이 등록됐고 iframe이 아니어야 한다(iframe은 URL 입력 단일 흐름). */
export const canUploadMedia = (
  editor: Pick<EditorController, "isUploadEnabled">,
  kind: MediaBlockKind,
): boolean => editor.isUploadEnabled() && kind !== "iframe";

/** 더보기 메뉴의 Replace 항목 노출 여부. 업로드가 가능하거나 iframe이면 연다(iframe은 URL 교체만 있다). */
export const canReplaceMedia = (
  editor: Pick<EditorController, "isUploadEnabled">,
  kind: MediaBlockKind,
): boolean => editor.isUploadEnabled() || kind === "iframe";

export type ApplyMediaUrlResult =
  | { ok: true; name: string | undefined }
  | { ok: false; rejectedMessage: string };

/**
 * Embed URL을 블록에 적용한다. name 초깃값은 URL의 마지막 path segment에서
 * 추출해 url과 같은 transaction·같은 undo 단위로 넘긴다(Issue #374).
 * 추출 실패는 name을 넘기지 않는다(undefined). iframe은 setMediaBlockUrl이
 * 아니라 setIframeSrc로 보낸다. setMediaBlockUrl은 iframe 화이트리스트·
 * private network 정책을 몰라 iframe을 거절한다(core 보안 경계).
 */
export const applyMediaUrl = (
  editor: Pick<EditorController, "commands">,
  target: { blockId: string; kind: MediaBlockKind; draft: string },
  dictionary: Dictionary,
): ApplyMediaUrlResult => {
  const { blockId, kind, draft } = target;
  const name = extractNameFromUrl(draft) ?? undefined;
  const result =
    kind === "iframe"
      ? editor.commands.setIframeSrc(blockId, draft, name)
      : editor.commands.setMediaBlockUrl(blockId, draft, name);
  if (!result.ok) {
    return {
      ok: false,
      rejectedMessage: iframeUrlRejectionMessage(
        kind,
        result.error,
        dictionary,
      ),
    };
  }
  return { ok: true, name };
};
