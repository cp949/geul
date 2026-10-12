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
 * Embed URL을 블록에 적용한다. URL이 현재 블록 url과 다르면 name 초깃값을
 * URL의 마지막 path segment에서 추출해 url과 같은 transaction·같은 undo
 * 단위로 넘긴다(Issue #374). 추출 실패는 name을 넘기지 않는다(undefined).
 * iframe은 setMediaBlockUrl이 아니라 setIframeSrc로 보낸다. setMediaBlockUrl은
 * iframe 화이트리스트·private network 정책을 몰라 iframe을 거절한다(core
 * 보안 경계).
 *
 * URL이 현재 블록 url과 정확히 같으면 name을 넘기지 않는다(Issue #388).
 * core는 url이 같아도 name을 넘기면 덮어쓰므로, 같은 URL 재저장이 사용자가
 * 정한 name을 URL 끝 segment로 되돌리지 않게 한다. 이때도 core를 호출한다.
 * URL 검증과 iframe 정책이 같은 값 판정보다 먼저라 정책이 막게 된 URL은
 * 계속 거절된다. 반환 name은 현재 블록 name이다. URL 비교는 정확 일치다
 * (정규화하지 않는다. core의 같은 값 판정과 맞춘다).
 *
 * core는 현재 값과 같은 적용을 COMMAND_NOT_APPLICABLE로 거절한다(#375·#376).
 * 이 표면에서 그 거절은 "변경 없음"이라 ok로 돌려주고 거절 문구를 띄우지
 * 않는다(Issue #384). URL 검증과 iframe 정책은 같은 값 판정보다 먼저라
 * 여기까지 온 COMMAND_NOT_APPLICABLE은 URL이 적법하다는 뜻이다.
 * 이 코드는 같은 값 외에 onBeforeChange 거절·세션 파괴·블록 종류 불일치에도
 * 나온다. 그래서 호출 전에 읽어 둔 현재 블록 url이 요청과 같을 때만 변경
 * 없음으로 본다. 블록 type은 비교하지 않는다. url이 이미 같으면 어느
 * 종류로 적용하려 했든 문서는 요청한 상태다.
 */
export const applyMediaUrl = (
  editor: Pick<EditorController, "commands" | "getBlock">,
  target: { blockId: string; kind: MediaBlockKind; draft: string },
  dictionary: Dictionary,
): ApplyMediaUrlResult => {
  const { blockId, kind, draft } = target;
  const current = editor.getBlock(blockId);
  const sameUrl =
    current !== undefined && "url" in current && current.url === draft;
  const name = sameUrl ? undefined : (extractNameFromUrl(draft) ?? undefined);
  const appliedName = sameUrl
    ? "name" in current
      ? current.name
      : undefined
    : name;
  const result =
    kind === "iframe"
      ? editor.commands.setIframeSrc(blockId, draft, name)
      : editor.commands.setMediaBlockUrl(blockId, draft, name);
  if (!result.ok) {
    if (result.error.code === "COMMAND_NOT_APPLICABLE" && sameUrl) {
      return { ok: true, name: appliedName };
    }
    return {
      ok: false,
      rejectedMessage: iframeUrlRejectionMessage(
        kind,
        result.error,
        dictionary,
      ),
    };
  }
  return { ok: true, name: appliedName };
};
