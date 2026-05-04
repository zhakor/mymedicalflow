import { clsx } from 'clsx'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  hint?: string
}

export function Input({ label, error, hint, className, id, ...props }: InputProps) {
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-')

  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label htmlFor={inputId} className="label">
          {label}
          {props.required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <input
        id={inputId}
        {...props}
        className={clsx(
          'input-field',
          error && 'border-red-500 focus:ring-red-500',
          className,
        )}
      />
      {error && <p className="text-sm text-red-500 mt-0.5">{error}</p>}
      {hint && !error && <p className="text-sm text-gray-500 mt-0.5">{hint}</p>}
    </div>
  )
}
