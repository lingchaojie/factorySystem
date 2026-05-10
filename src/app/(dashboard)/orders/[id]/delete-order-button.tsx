"use client";

import React from "react";

export function DeleteOrderButton() {
  return (
    <button
      type="submit"
      className="inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:bg-red-100 disabled:text-red-300"
      onClick={(event) => {
        if (!window.confirm("确定删除这个订单吗？有关联机器或生产记录的订单不能删除。")) {
          event.preventDefault();
        }
      }}
    >
      删除订单
    </button>
  );
}
