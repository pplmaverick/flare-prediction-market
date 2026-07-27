"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({ className, ...props }: ToastPrimitive.ToastViewportProps) {
  return (
    <ToastPrimitive.Viewport
      className={cn(
        "fixed bottom-0 right-0 z-[100] flex w-full max-w-sm flex-col gap-2 p-4 outline-none sm:bottom-4 sm:right-4",
        className
      )}
      {...props}
    />
  );
}

const toastVariants = cva(
  "group relative flex w-full items-start gap-3 rounded-lg border p-4 shadow-xl data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right",
  {
    variants: {
      variant: {
        default: "border-border-strong bg-surface-raised text-foreground",
        success: "border-accent/30 bg-surface-raised text-foreground",
        destructive: "border-destructive/30 bg-surface-raised text-foreground",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface ToastRootProps
  extends ToastPrimitive.ToastProps,
    VariantProps<typeof toastVariants> {}

export function Toast({ className, variant, ...props }: ToastRootProps) {
  return <ToastPrimitive.Root className={cn(toastVariants({ variant }), className)} {...props} />;
}

export function ToastTitle({ className, ...props }: ToastPrimitive.ToastTitleProps) {
  return <ToastPrimitive.Title className={cn("text-sm font-semibold", className)} {...props} />;
}

export function ToastDescription({ className, ...props }: ToastPrimitive.ToastDescriptionProps) {
  return (
    <ToastPrimitive.Description
      className={cn("text-sm text-muted-foreground break-words", className)}
      {...props}
    />
  );
}

export function ToastClose({ className, ...props }: ToastPrimitive.ToastCloseProps) {
  return (
    <ToastPrimitive.Close
      className={cn(
        "absolute right-2 top-2 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100 cursor-pointer",
        className
      )}
      aria-label="Dismiss"
      {...props}
    >
      &times;
    </ToastPrimitive.Close>
  );
}
