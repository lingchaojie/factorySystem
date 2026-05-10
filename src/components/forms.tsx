import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import React from "react";

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
  const selected = new Set(selectedValues);

  return (
    <fieldset className={className}>
      <legend className={labelClassName}>{label}</legend>
      <div className="mt-1 max-h-32 overflow-y-auto rounded-md border border-slate-300 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {options.map((option) => {
            const optionId = `${resolvedId}-${option.value}`;
            return (
              <label
                key={option.value}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700"
                htmlFor={optionId}
              >
                <input
                  id={optionId}
                  name={name}
                  type="checkbox"
                  value={option.value}
                  defaultChecked={selected.has(option.value)}
                  className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400"
                />
                <span>{option.label}</span>
              </label>
            );
          })}
        </div>
      </div>
    </fieldset>
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
