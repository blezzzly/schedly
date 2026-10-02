"use client";

import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export type ScheduleSlot = {
  subject: string;
  short: string;
  color: string;
};

export type ScheduleCard = {
  date: string;
  title: string;
  subtitle?: string;
  slots: ScheduleSlot[];
};

interface CardTimeMachineProps {
  className?: string;
  isMonochrome?: boolean;
  cards?: ScheduleCard[];
}

const DEFAULT_CARDS: ScheduleCard[] = [
  {
    date: "Mon",
    title: "Day 1",
    subtitle: "This Week",
    slots: [
      { subject: "Physics", short: "Phys", color: "#0ea5e9" },
      { subject: "History", short: "Hist", color: "#ef4444" },
      { subject: "English", short: "Eng", color: "#8b5cf6" },
    ],
  },
  {
    date: "Tue",
    title: "Day 2",
    subtitle: "This Week",
    slots: [
      { subject: "Math", short: "Math", color: "#3b82f6" },
      { subject: "Biology", short: "Bio", color: "#f59e0b" },
      { subject: "Physics", short: "Phys", color: "#0ea5e9" },
    ],
  },
  {
    date: "Wed",
    title: "Day 3",
    subtitle: "This Week",
    slots: [
      { subject: "CS", short: "CS", color: "#22c55e" },
      { subject: "Math", short: "Math", color: "#3b82f6" },
      { subject: "English", short: "Eng", color: "#8b5cf6" },
    ],
  },
  {
    date: "Thu",
    title: "Day 4",
    subtitle: "This Week",
    slots: [
      { subject: "History", short: "Hist", color: "#ef4444" },
      { subject: "Biology", short: "Bio", color: "#f59e0b" },
      { subject: "Physics", short: "Phys", color: "#0ea5e9" },
    ],
  },
  {
    date: "Fri",
    title: "Day 5",
    subtitle: "This Week",
    slots: [
      { subject: "Math", short: "Math", color: "#3b82f6" },
      { subject: "English", short: "Eng", color: "#8b5cf6" },
      { subject: "Biology", short: "Bio", color: "#f59e0b" },
    ],
  },
];

export default function CardTimeMachine({
  className = "",
  isMonochrome = true,
  cards = DEFAULT_CARDS,
}: CardTimeMachineProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const handleTimelineHover = (index: number) => {
    setHoveredIndex(index);
    setActiveIndex(Math.round(index));
  };

  const timelineNodes = useMemo(() => {
    const nodes: { type: "main" | "sub"; index: number; date?: string }[] = [];
    cards.forEach((item, i) => {
      nodes.push({ type: "main", index: i, date: item.date });
      if (i < cards.length - 1) {
        for (let j = 0; j < 2; j++) {
          nodes.push({ type: "sub", index: i + (j + 1) * 0.33 });
        }
      }
    });
    return nodes;
  }, [cards]);

  return (
    <div
      className={cn(
        "bg-card/80 flex w-full flex-row items-center justify-center gap-6 relative overflow-hidden rounded-2xl border border-border p-4",
        className
      )}
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="absolute w-0 h-0" version="1.1">
        <defs>
          <filter id="SkiperSquiCircleFilterLayout">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feColorMatrix
              in="blur"
              mode="matrix"
              values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -6"
              result="goo"
            />
            <feBlend in="SourceGraphic" in2="goo" />
          </filter>
        </defs>
      </svg>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(255,255,255,0.03),transparent_70%)] pointer-events-none" />

      <div
        className="relative flex-1 max-w-[290px] aspect-[4/3] flex items-center justify-center"
        style={{ perspective: "800px" }}
      >
        {cards.map((item, i) => {
          const offset = i - activeIndex;
          const isPast = i < activeIndex;

          return (
            <motion.div
              key={i}
              className="absolute rounded-2xl flex h-[135px] w-[220px] origin-center flex-col overflow-hidden pointer-events-none border border-border/60 bg-card shadow-lg"
              initial={false}
              animate={{
                z: isPast ? 200 : -offset * 60,
                y: isPast ? 300 : -offset * 12,
                rotateX: isPast ? -20 : offset * 2,
                opacity: isPast ? 0 : 1 - Math.abs(offset) * 0.2,
                scale: isPast ? 1.3 : 1,
              }}
              transition={{
                type: "spring",
                stiffness: 250,
                damping: 25,
                mass: 0.8,
              }}
              style={{
                zIndex: cards.length - i,
                filter: "url(#SkiperSquiCircleFilterLayout)",
              }}
            >
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="text-[10px] font-mono font-medium text-muted-foreground">
                  {item.date}
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-foreground/60">
                  {item.subtitle}
                </span>
              </div>
              <div className="flex-1 flex flex-col items-center justify-center gap-2 px-3">
                {isMonochrome ? (
                  <span className="text-3xl font-bold text-foreground/80">
                    {item.title}
                  </span>
                ) : (
                  <div className="flex flex-wrap items-center justify-center gap-1.5">
                    {item.slots.map((slot, si) => (
                      <span
                        key={si}
                        className="rounded-md px-2 py-1 text-[10px] font-bold"
                        style={{
                          backgroundColor: slot.color + "22",
                          color: slot.color,
                        }}
                      >
                        {slot.short}
                      </span>
                    ))}
                  </div>
                )}
                <span className="text-[11px] font-semibold text-foreground/80">
                  {item.title}
                </span>
              </div>
              <div className="absolute inset-0 bg-black/10 pointer-events-none" />
            </motion.div>
          );
        })}
      </div>

      <div
        className="relative flex flex-col items-end z-50 py-2 px-1"
        onMouseLeave={() => setHoveredIndex(null)}
      >
        {timelineNodes.map((node) => {
          if (node.type === "main") {
            const index = node.index;
            const isSelected = activeIndex === index;

            return (
              <button
                key={`main-${index}`}
                type="button"
                className="relative inline-flex items-center justify-end py-[1px] w-20 group cursor-pointer border-0 bg-transparent"
                onMouseEnter={() => handleTimelineHover(index)}
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveIndex(index);
                }}
              >
                {hoveredIndex === index ? (
                  <motion.span
                    className={cn(
                      "absolute top-0 right-10 text-[10px] font-semibold whitespace-nowrap",
                      isSelected ? "text-primary" : "text-foreground/90"
                    )}
                    initial={{ opacity: 0, filter: "blur(2px)", scale: 0.8 }}
                    animate={{ opacity: 1, filter: "blur(0px)", scale: 1 }}
                    transition={{ duration: 0.15 }}
                  >
                    {node.date}
                  </motion.span>
                ) : null}
                <motion.div
                  className={cn(
                    "h-[3px] w-[24px] rounded-full origin-right transition-colors",
                    isSelected
                      ? "bg-primary"
                      : "bg-muted-foreground/50 group-hover:bg-foreground/80"
                  )}
                  animate={{
                    scaleX:
                      hoveredIndex === null
                        ? 1
                        : isSelected
                          ? 1.4
                          : Math.abs(index - hoveredIndex) < 0.5
                            ? 1.25
                            : 1,
                  }}
                  transition={{ type: "spring", stiffness: 400, damping: 25 }}
                />
              </button>
            );
          }

          const isHoveringNear =
            hoveredIndex !== null &&
            Math.abs(node.index - hoveredIndex) <= 0.5;

          return (
            <div
              key={`sub-${node.index}`}
              className="py-[1px] w-20 flex justify-end cursor-pointer"
              onMouseEnter={() => handleTimelineHover(node.index)}
              onClick={(e) => {
                e.stopPropagation();
                setActiveIndex(Math.round(node.index));
              }}
            >
              <motion.div
                className="h-[3px] w-[24px] rounded-full bg-muted-foreground/20 origin-right"
                animate={{
                  scaleX: hoveredIndex === null ? 1 : isHoveringNear ? 1.15 : 1,
                  opacity: hoveredIndex === null ? 0.3 : isHoveringNear ? 0.5 : 0.3,
                }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}