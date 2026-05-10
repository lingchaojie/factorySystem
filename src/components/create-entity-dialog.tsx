"use client";

import { Plus, X } from "lucide-react";
import React, { type ReactNode, useRef } from "react";

type CreateEntityDialogProps = {
  buttonLabel: string;
  title: string;
  children: ReactNode;
};

export function CreateEntityDialog({
  buttonLabel,
  title,
  children,
}: CreateEntityDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        type="button"
        className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
        onClick={() => dialogRef.current?.showModal()}
      >
        <Plus aria-hidden="true" size={16} />
        {buttonLabel}
      </button>
      <dialog
        ref={dialogRef}
        className="w-[min(92vw,520px)] rounded-lg border border-slate-200 bg-white p-0 text-slate-950 shadow-xl backdrop:bg-slate-950/30"
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
