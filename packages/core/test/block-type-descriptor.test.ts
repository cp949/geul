/**
 * blockTypeDescriptorFromBlock의 leaf 매핑을 검증한다. 이 함수는 PM node
 * 유래 BlockTypeSource와 저장 Block 양쪽에서 공유되므로(아키텍처 리뷰 6차
 * 후보 L3), 실제 소비자를 흉내 낸 최소 판별 유니온 값만으로 전수 확인한다.
 */
import { describe, expect, it } from "vitest";

import { blockTypeDescriptorFromBlock } from "../src/index.js";

describe("blockTypeDescriptorFromBlock", () => {
  it("paragraph·quote·bulletListItem은 attrs 없는 descriptor를 그대로 낸다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "paragraph" })).toEqual({
      type: "paragraph",
    });
    expect(blockTypeDescriptorFromBlock({ type: "quote" })).toEqual({
      type: "quote",
    });
    expect(blockTypeDescriptorFromBlock({ type: "bulletListItem" })).toEqual({
      type: "bulletListItem",
    });
  });

  it("heading은 level을 그대로 보존한다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "heading", level: 3 })).toEqual(
      { type: "heading", level: 3 },
    );
  });

  // isToggleable은 RD-004 DELTA-04부터 조회 방향(BlockTypeSource/
  // BlockTypeDescriptor)에도 생긴 옵셔널 pass-through 필드다(Turn into UI가
  // 명령 입력(SetBlockTypeDescriptor, DELTA-02)과 대칭으로 현재 상태를
  // 읽을 수 있어야 한다) — 있으면 그대로 옮기고 없으면(undefined) 생략한다.
  it("heading의 isToggleable을 있으면 그대로 보존하고 없으면 생략한다", () => {
    expect(
      blockTypeDescriptorFromBlock({
        type: "heading",
        level: 2,
        isToggleable: true,
      }),
    ).toEqual({ type: "heading", level: 2, isToggleable: true });
    expect(blockTypeDescriptorFromBlock({ type: "heading", level: 2 })).toEqual(
      { type: "heading", level: 2 },
    );
  });

  it("codeBlock은 language가 있으면 포함하고 없으면 생략한다", () => {
    expect(
      blockTypeDescriptorFromBlock({ type: "codeBlock", language: "ts" }),
    ).toEqual({ type: "codeBlock", language: "ts" });
    expect(blockTypeDescriptorFromBlock({ type: "codeBlock" })).toEqual({
      type: "codeBlock",
    });
  });

  it("numberedListItem은 startNumber 0을 생략하지 않고 undefined는 생략한다", () => {
    expect(
      blockTypeDescriptorFromBlock({
        type: "numberedListItem",
        startNumber: 0,
      }),
    ).toEqual({ type: "numberedListItem", startNumber: 0 });
    expect(blockTypeDescriptorFromBlock({ type: "numberedListItem" })).toEqual({
      type: "numberedListItem",
    });
  });

  it("divider와 table은 BlockTypeDescriptor가 다루지 않는 종류라 null이다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "divider" })).toBeNull();
    expect(blockTypeDescriptorFromBlock({ type: "table" })).toBeNull();
  });

  // RD-002 DELTA-01 — media 4종(file/image/video/audio)은 spec §2.2가 이미
  // 확정한 "Turn into 제외"의 구현이다(divider/table과 같은 자리). 이
  // 확장이 없으면 react/block-side-menu.tsx의 findBlockTypeDescriptor가
  // 저장 Block(model union 확장분)을 그대로 넘길 때 컴파일이 깨진다(실측
  // 확인, editor-controller.ts BlockTypeSource 주석 참고).
  it("file·image·video·audio는 Turn into 대상이 아니라 null이다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "file" })).toBeNull();
    expect(blockTypeDescriptorFromBlock({ type: "image" })).toBeNull();
    expect(blockTypeDescriptorFromBlock({ type: "video" })).toBeNull();
    expect(blockTypeDescriptorFromBlock({ type: "audio" })).toBeNull();
  });

  // toggleListItem은 RD-003(Issue #38 슬라이스 6)에서 model Block에
  // 추가됐고 RD-004 DELTA-04부터 Turn into 대상이다 — divider·table과
  // 달리 attrs 없는 descriptor를 그대로 낸다(checkListItem과 동일 자리,
  // 아래 테스트 참고).
  it("toggleListItem은 attrs 없는 descriptor를 그대로 낸다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "toggleListItem" })).toEqual({
      type: "toggleListItem",
    });
  });

  // checkListItem은 Issue #38 슬라이스 6 RD-001 DELTA-06부터 Turn into
  // 대상이다 — paragraph·quote·bulletListItem과 같은 자리에서 attrs 없는
  // descriptor를 그대로 낸다(toggleListItem도 RD-004 DELTA-04부터 같은
  // 자리, 위 테스트 참고).
  it("checkListItem은 attrs 없는 descriptor를 그대로 낸다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "checkListItem" })).toEqual({
      type: "checkListItem",
    });
  });
});
