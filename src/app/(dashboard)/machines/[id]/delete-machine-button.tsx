"use client";

import React from "react";
import { SubmitButton } from "@/components/forms";

export function DeleteMachineButton() {
  return (
    <SubmitButton
      className="bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50"
      onClick={(event) => {
        if (!window.confirm("确定删除这台机器吗？已有生产记录的机器不能删除。")) {
          event.preventDefault();
        }
      }}
    >
      删除机器
    </SubmitButton>
  );
}
