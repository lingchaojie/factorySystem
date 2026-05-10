"use client";

import { Pencil, Plus, X } from "lucide-react";
import React, { type ReactNode, useRef } from "react";

type CreateEntityDialogProps = {
  buttonLabel: string;
  title: string;
  buttonIcon?: "plus" | "pencil";
  buttonVariant?: "primary" | "secondary";
  children: ReactNode;
};

export function CreateEntityDialog({
  buttonLabel,
  title,
  buttonIcon = "plus",
  buttonVariant = "primary",
  children,
}: CreateEntityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const Icon = buttonIcon === "pencil" ? Pencil : Plus;
  const buttonClassName =
    buttonVariant === "primary"
      ? "bg-slate-950 text-white hover:bg-slate-800"
      : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50";

  return (
    <>
      <button
        type="button"
        className={[
          "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors",
          buttonClassName,
        ]
          .filter(Boolean)
          .join(" ")}
        onClick={() => dialogRef.current?.showModal()}
      >
        <Icon aria-hidden="true" size={16} />
        {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="fixed left-1/2 top-1/2 max-h-[90vh] w-[min(92vw,520px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-950 shadow-xl backdrop:bg-slate-950/30"
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">{title}</h2>
          <button
            type="button"
            aria-label="关闭"
            className="inline-flex size-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-950"
            onClick={() => dialogRef.current?.close()}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </dialog>
    </>
  );
}
