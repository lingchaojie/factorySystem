"use client";

import React from "react";
import { SubmitButton } from "@/components/forms";

export function DeleteOrderButton() {
  return (
    <SubmitButton
      className="bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50"
      onClick={(event) => {
        if (!window.confirm("确定删除这个订单吗？有关联机器或生产记录的订单不能删除。")) {
          event.preventDefault();
        }
      }}
    >
      删除订单
    </SubmitButton>
  );
}
