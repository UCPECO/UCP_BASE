import React from "react";
import { cn } from "@/lib/utils";

export default function SectionCard({ title, subtitle, action, children, className, icon: Icon }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border shadow-sm", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between gap-2 flex-wrap px-4 py-3 sm:px-5 sm:py-4 border-b border-border">
          <div className="flex items-center gap-2.5 min-w-0">
            {Icon && <Icon className="h-5 w-5 text-primary shrink-0" />}
            <div className="min-w-0">
              {title && <h3 className="font-semibold text-foreground font-heading text-sm sm:text-base">{title}</h3>}
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-3 sm:p-5">{children}</div>
    </div>
  );
}