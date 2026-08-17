import React from "react";
import { Inbox } from "lucide-react";

export default function EmptyState({ title = "Sin datos", message, icon: Icon = Inbox, action, image }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {image ? (
        <img src={image} alt="" aria-hidden="true" className="h-28 w-28 object-contain mb-3" />
      ) : (
        <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center mb-3">
          <Icon className="h-6 w-6 text-muted-foreground" />
        </div>
      )}
      <p className="font-medium text-foreground">{title}</p>
      {message && <p className="text-sm text-muted-foreground mt-1 max-w-sm">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}