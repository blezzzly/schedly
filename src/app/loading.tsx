import Image from "next/image";

export default function Loading() {
  return (
    <div className="flex min-h-dvh-fallback flex-col items-center justify-center gap-4">
      <Image src="/images/logo.jpg" alt="Schedly" width={56} height={56} className="h-14 w-14 rounded-2xl object-cover" />
      <div className="flex items-center space-x-2">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-2.5 w-2.5 rounded-full bg-primary animate-[pulse-dot_1.2s_ease-in-out_infinite]"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}
