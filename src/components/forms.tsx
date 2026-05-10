"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { Check, ChevronDown } from "lucide-react";
import React, { useMemo, useState } from "react";

type FieldLabelProps = {
  label: string;
};

type TextInputProps = FieldLabelProps & InputHTMLAttributes<HTMLInputElement>;
type TextareaProps = FieldLabelProps &
  TextareaHTMLAttributes<HTMLTextAreaElement>;
type SelectInputProps = FieldLabelProps &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: Array<{ value: string; label: string }>;
  };
type MultiSelectInputProps = FieldLabelProps & {
  name: string;
  id?: string;
  options: Array<{ value: string; label: string }>;
  selectedValues?: string[];
  className?: string;
};

const controlClassName =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950 shadow-sm outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500";

const labelClassName = "block text-sm font-medium text-slate-700";

function fieldId(name: string | undefined, id: string | undefined) {
  return id ?? name;
}

export function TextInput({ label, id, name, className, ...props }: TextInputProps) {
  const resolvedId = fieldId(name, id);

  return (
    <div>
      <label className={labelClassName} htmlFor={resolvedId}>
        {label}
      </label>
      <input
        id={resolvedId}
        name={name}
        className={[controlClassName, className].filter(Boolean).join(" ")}
        {...props}
      />
    </div>
  );
}

export function NumberInput(props: TextInputProps) {
  return <TextInput {...props} type="number" />;
}

export function DateInput(props: TextInputProps) {
  return <TextInput {...props} type="date" />;
}

export function Textarea({
  label,
  id,
  name,
  className,
  ...props
}: TextareaProps) {
  const resolvedId = fieldId(name, id);

  return (
    <div>
      <label className={labelClassName} htmlFor={resolvedId}>
        {label}
      </label>
      <textarea
        id={resolvedId}
        name={name}
        className={[controlClassName, "min-h-24", className]
          .filter(Boolean)
          .join(" ")}
        {...props}
      />
    </div>
  );
}

export function SelectInput({
  label,
  id,
  name,
  className,
  options,
  ...props
}: SelectInputProps) {
  const resolvedId = fieldId(name, id);

  return (
    <div>
      <label className={labelClassName} htmlFor={resolvedId}>
        {label}
      </label>
      <select
        id={resolvedId}
        name={name}
        className={[controlClassName, className].filter(Boolean).join(" ")}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MultiSelectInput({
  label,
  id,
  name,
  options,
  selectedValues = [],
  className,
}: MultiSelectInputProps) {
  const resolvedId = fieldId(name, id);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedValuesState, setSelectedValuesState] =
    useState(selectedValues);
  const selected = useMemo(
    () => new Set(selectedValuesState),
    [selectedValuesState],
  );
  const selectedLabels = options
    .filter((option) => selected.has(option.value))
    .map((option) => option.label);
  const summary =
    selectedLabels.length > 0 ? selectedLabels.join("、") : "全部";
  const filteredOptions = options.filter((option) => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return true;
    return option.label.toLowerCase().includes(keyword);
  });

  function toggleOption(value: string) {
    setSelectedValuesState((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );
  }

  return (
    <div className={["relative", className].filter(Boolean).join(" ")}>
      <span className={labelClassName}>{label}</span>
      {selectedValuesState.map((value) => (
        <input key={value} type="hidden" name={name} value={value} />
      ))}
      <button
        id={resolvedId}
        type="button"
        className="mt-1 flex w-full items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2 text-left text-sm text-slate-950 shadow-sm outline-none transition hover:bg-slate-50 focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="min-w-0 truncate">
          {label}：{summary}
        </span>
        <ChevronDown
          aria-hidden="true"
          size={16}
          className={[
            "shrink-0 text-slate-500 transition-transform",
            open ? "rotate-180" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      </button>
      {open ? (
        <div className="absolute z-30 mt-2 w-full rounded-md border border-slate-200 bg-white p-2 shadow-xl">
          <input
            className="block w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
            placeholder={`搜索${label}`}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div
            role="listbox"
            aria-label={label}
            className="mt-2 max-h-56 overflow-y-auto"
          >
            {filteredOptions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-slate-500">没有匹配项</p>
            ) : (
              filteredOptions.map((option) => {
                const checked = selected.has(option.value);
                return (
                  <label
                    key={option.value}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      onChange={() => toggleOption(option.value)}
                    />
                    <span className="flex size-4 shrink-0 items-center justify-center rounded border border-slate-300">
                      {checked ? <Check aria-hidden="true" size={14} /> : null}
                    </span>
                    <span className="min-w-0 truncate">{option.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  className,
  type = "submit",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={[
        "inline-flex items-center justify-center rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...props}
    />
  );
}
