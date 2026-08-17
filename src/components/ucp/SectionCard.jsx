import React from "react";
import { cn } from "@/lib/utils";

export default function SectionCard({ title, subtitle, action, children, className, icon: Icon }) {
  return (
    <div className={cn("bg-card rounded-2xl border border-border shadow-sm", className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2.5">
            {Icon && <Icon className="h-5 w-5 text-primary" />}
            <div>
              {title && <h3 className="font-semibold text-foreground font-heading">{title}</h3>}
              {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
            </div>
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}