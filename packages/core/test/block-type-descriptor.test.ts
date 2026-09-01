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

  // toggleListItem은 RD-003(Issue #38 슬라이스 6)에서 model Block에
  // 추가됐지만 BlockTypeDescriptor는 아직 Turn into 대상으로 다루지
  // 않는다(RD-004 범위) — divider·table과 같은 자리에서 null이다. 이
  // 회귀 테스트가 없으면 BlockTypeSource가 Block과 어긋나도(멤버 누락)
  // 발견이 늦어진다 — react/block-side-menu.tsx의 findBlockTypeDescriptor가
  // 저장 Block을 그대로 넘겨 컴파일 시점에 잡히긴 하지만, 런타임 계약도
  // 여기서 고정한다.
  it("toggleListItem은 아직 BlockTypeDescriptor가 다루지 않는 종류라 null이다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "toggleListItem" })).toBeNull();
  });

  // checkListItem은 Issue #38 슬라이스 6 RD-001 DELTA-06부터 Turn into
  // 대상이다 — paragraph·quote·bulletListItem과 같은 자리에서 attrs 없는
  // descriptor를 그대로 낸다(toggleListItem은 여전히 null, 위 테스트 참고).
  it("checkListItem은 attrs 없는 descriptor를 그대로 낸다", () => {
    expect(blockTypeDescriptorFromBlock({ type: "checkListItem" })).toEqual({
      type: "checkListItem",
    });
  });
});
