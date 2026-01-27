import { InputHTMLAttributes, forwardRef } from "react";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-[var(--color-text-secondary)] mb-2">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`w-full px-3.5 py-2.5 bg-[var(--color-bg-primary)] border border-[var(--color-border)] rounded-lg text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all ${
            error ? "border-red-500" : "hover:border-[var(--color-border-hover)]"
          } ${className}`}
          {...props}
        />
        {error && <p className="mt-1.5 text-sm text-red-500">{error}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
