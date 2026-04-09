import { cn } from "@/lib/utils/cn";

interface InitialsAvatarProps {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-12 w-12 text-sm font-semibold",
} as const;

function hashToHue(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  return Math.abs(hash) % 360;
}

function getInitials(name: string): string {
  return name
    .split(/[\s_-]+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export function InitialsAvatar({ name, size = "md", className }: InitialsAvatarProps) {
  const hue = hashToHue(name);
  const color = `hsl(${hue}, 55%, 55%)`;
  const bg = `hsla(${hue}, 55%, 55%, 0.15)`;

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full",
        sizeClasses[size],
        className
      )}
      style={{ backgroundColor: bg, color }}
    >
      {getInitials(name) || "?"}
    </div>
  );
}
