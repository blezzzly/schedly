"use client";

import { motion } from "framer-motion";

interface ArcTracerProps {
  size?: number;
  className?: string;
}

export function ArcTracer({ size = 40, className = "" }: ArcTracerProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 50 50"
      aria-hidden="true"
    >
      <circle
        cx="25"
        cy="25"
        r="20"
        className="stroke-zinc-200 dark:stroke-zinc-800 fill-none"
        strokeWidth="4"
      />
      <motion.circle
        cx="25"
        cy="25"
        r="20"
        className="stroke-zinc-800 dark:stroke-white fill-none"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="125"
        animate={{ strokeDashoffset: [125, 0, -125] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
    </svg>
  );
}
