import { cn } from "@/lib/utils";

/** Lightweight shimmer placeholder used while data loads. */
export const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse rounded-md bg-white/[0.06]", className)} />
);
