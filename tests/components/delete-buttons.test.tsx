import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { DeleteMachineButton } from "@/app/(dashboard)/machines/[id]/delete-machine-button";
import { DeleteOrderButton } from "@/app/(dashboard)/orders/[id]/delete-order-button";
import { DeleteRecordButton } from "@/app/(dashboard)/records/delete-record-button";

describe("destructive submit buttons", () => {
  it("render red text instead of inheriting the primary submit white text", () => {
    render(
      <>
        <DeleteOrderButton />
        <DeleteRecordButton />
        <DeleteMachineButton />
      </>,
    );

    for (const name of ["删除订单", "删除", "删除机器"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("text-red-700");
      expect(button).not.toHaveClass("text-white");
    }
  });
});
