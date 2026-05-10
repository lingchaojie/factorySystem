"use client";

import { SubmitButton } from "@/components/forms";

export function DeleteRecordButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <SubmitButton
      className="bg-white text-red-700 ring-1 ring-inset ring-red-200 hover:bg-red-50 disabled:bg-red-100"
      disabled={disabled}
      onClick={(event) => {
        if (!window.confirm("确定删除这条生产记录吗？")) {
          event.preventDefault();
        }
      }}
    >
      删除
    </SubmitButton>
  );
}
