import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { DeleteMachineButton } from "@/app/(dashboard)/machines/[id]/delete-machine-button";
import { DeleteOrderButton } from "@/app/(dashboard)/orders/[id]/delete-order-button";
import { DeleteRecordButton } from "@/app/(dashboard)/records/delete-record-button";
import { UnlinkMachineOrderButton } from "@/components/unlink-machine-order-button";

describe("destructive submit buttons", () => {
  it("render red text instead of inheriting the primary submit white text", () => {
    render(
      <>
        <DeleteOrderButton />
        <DeleteRecordButton />
        <DeleteMachineButton />
        <UnlinkMachineOrderButton />
      </>,
    );

    for (const name of ["删除订单", "删除", "删除机器", "解除关联"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toHaveClass("text-red-700");
      expect(button).not.toHaveClass("text-white");
    }
  });

  it("warns that order deletion is irreversible", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<DeleteOrderButton />);
    fireEvent.click(screen.getByRole("button", { name: "删除订单" }));

    expect(confirmSpy).toHaveBeenCalledWith(
      "确定删除这个订单吗？关联机器会解除关联，生产记录会一起删除。此操作不可逆。",
    );
    confirmSpy.mockRestore();
  });

  it("cancels or submits machine order removal after confirmation", () => {
    const submitSpy = vi.fn((event: React.FormEvent) => event.preventDefault());
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(
      <form onSubmit={submitSpy}>
        <UnlinkMachineOrderButton />
      </form>,
    );
    const button = screen.getByRole("button", { name: "解除关联" });

    fireEvent.click(button);
    expect(confirmSpy).toHaveBeenCalledWith(
      "确定解除这台机器与该订单的关联吗？已有生产记录会保留。",
    );
    expect(submitSpy).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(button);
    expect(submitSpy).toHaveBeenCalledTimes(1);
    confirmSpy.mockRestore();
  });
});
