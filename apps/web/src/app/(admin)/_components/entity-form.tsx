'use client';

/**
 * Formulario del panel: describe sus campos con datos y deja que la Server Action haga el resto.
 *
 * Un único componente para todas las entidades del dominio académico, para que el mensaje de
 * error de validación se pinte siempre igual y siempre en español, junto al campo culpable.
 */

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';

import { IDLE_FORM_STATE, type FormAction, type FormState } from '../_lib/form-state';

interface FieldBase {
  name: string;
  label: string;
  hint?: string | undefined;
  required?: boolean | undefined;
  defaultValue?: string | undefined;
  placeholder?: string | undefined;
}

export type FormField =
  | ({ kind: 'text' | 'time' } & FieldBase)
  | ({ kind: 'number'; min?: number | undefined; max?: number | undefined } & FieldBase)
  | ({ kind: 'select'; options: { value: string; label: string }[] } & FieldBase)
  | { kind: 'hidden'; name: string; value: string };

const CONTROL_CLASS =
  'w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none focus:ring-2 focus:ring-slate-400 dark:bg-slate-950';
const NORMAL_BORDER = 'border-slate-300 dark:border-slate-700';
const ERROR_BORDER = 'border-red-500 dark:border-red-500';

function FieldControl({ field, errors }: { field: FormField; errors: string[] }) {
  if (field.kind === 'hidden') {
    return <input type="hidden" name={field.name} value={field.value} />;
  }

  const invalid = errors.length > 0;
  const className = `${CONTROL_CLASS} ${invalid ? ERROR_BORDER : NORMAL_BORDER}`;
  const errorId = `${field.name}-error`;
  const shared = {
    id: field.name,
    name: field.name,
    className,
    defaultValue: field.defaultValue,
    required: field.required === true,
    'aria-invalid': invalid,
    ...(invalid ? { 'aria-describedby': errorId } : {}),
  };

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium" htmlFor={field.name}>
        {field.label}
      </label>

      {field.kind === 'select' ? (
        <select {...shared}>
          <option value="">{field.placeholder ?? 'Sin seleccionar'}</option>
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          {...shared}
          type={field.kind === 'number' ? 'number' : field.kind === 'time' ? 'time' : 'text'}
          placeholder={field.placeholder}
          {...(field.kind === 'number' ? { min: field.min, max: field.max, step: 1 } : {})}
        />
      )}

      {field.hint ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">{field.hint}</p>
      ) : null}

      {invalid ? (
        <p className="text-xs text-red-600 dark:text-red-400" id={errorId}>
          {errors.join(' ')}
        </p>
      ) : null}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900"
      disabled={pending}
      type="submit"
    >
      {pending ? 'Guardando…' : label}
    </button>
  );
}

/** Aviso de resultado. Solo aparece cuando la acción ya respondió algo. */
export function FormFeedback({ state }: { state: FormState }) {
  if (state.status === 'idle' || state.message === '') return null;

  const tone =
    state.status === 'success'
      ? 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
      : 'border-red-300 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200';

  return (
    <p className={`rounded-md border px-3 py-2 text-sm ${tone}`} role="status">
      {state.message}
    </p>
  );
}

export function EntityForm({
  action,
  fields,
  submitLabel,
  resetOnSuccess = false,
  columns = 1,
}: {
  action: FormAction;
  fields: FormField[];
  submitLabel: string;
  /** Los formularios de alta se vacían tras guardar; los de edición conservan lo escrito. */
  resetOnSuccess?: boolean;
  columns?: 1 | 2 | 3;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM_STATE);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (resetOnSuccess && state.status === 'success') form.current?.reset();
  }, [resetOnSuccess, state]);

  const grid = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3' }[columns];
  // Los campos ocultos no ocupan celda de la rejilla: se emiten aparte.
  const hidden = fields.filter((field) => field.kind === 'hidden');
  const visible = fields.filter((field) => field.kind !== 'hidden');

  return (
    <form action={formAction} className="space-y-4" ref={form}>
      <FormFeedback state={state} />

      {hidden.map((field) => (
        <FieldControl errors={[]} field={field} key={field.name} />
      ))}

      <div className={`grid grid-cols-1 gap-4 ${grid}`}>
        {visible.map((field) => (
          <FieldControl
            errors={state.fieldErrors[field.name] ?? []}
            field={field}
            key={field.name}
          />
        ))}
      </div>

      <SubmitButton label={submitLabel} />
    </form>
  );
}
