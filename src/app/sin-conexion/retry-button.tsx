"use client";

import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui";

export function RetryButton() {
  return (
    <Button onClick={() => window.location.reload()}>
      <RotateCcw className="size-4" /> Reintentar
    </Button>
  );
}
