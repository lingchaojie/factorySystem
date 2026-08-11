"use client";

import React from "react";

export function UnlinkOrderButton() {
  return (
    <button
      type="submit"
      aria-label="移除关联"
      className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-red-100 disabled:text-red-300"
      onClick={(event) => {
        if (
          !window.confirm(
            "确定移除这台机器与该订单的关联吗？已有生产记录会保留。",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      移除关联
    </button>
  );
}
