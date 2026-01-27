import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = "", variant = "primary", size = "md", children, ...props }, ref) => {
    const baseStyles =
      "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[var(--color-bg-primary)] disabled:opacity-50 disabled:cursor-not-allowed";

    const variants = {
      primary: "bg-blue-500 hover:bg-blue-600 text-white focus:ring-blue-500 shadow-sm",
      secondary:
        "bg-[var(--color-bg-tertiary)] hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)] border border-[var(--color-border)] focus:ring-blue-500",
      ghost: "bg-transparent hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] focus:ring-blue-500",
      danger: "bg-red-500 hover:bg-red-600 text-white focus:ring-red-500 shadow-sm",
    };

    const sizes = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2 text-sm",
      lg: "px-6 py-2.5 text-base",
    };

    return (
      <button
        ref={ref}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
