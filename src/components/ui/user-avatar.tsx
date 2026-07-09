"use client";

import { cn } from "@/lib/utils/cn";
import { InitialsAvatar } from "./initials-avatar";

interface UserAvatarProps {
  name: string;
  image?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizePixels = { sm: 32, md: 40, lg: 48 } as const;
const sizeClasses = {
  sm: "h-8 w-8",
  md: "h-10 w-10",
  lg: "h-12 w-12",
} as const;

export function UserAvatar({ name, image, size = "md", className }: UserAvatarProps) {
  if (!image) {
    return <InitialsAvatar name={name} size={size} className={className} />;
  }

  return (
    // Steam/FACEIT avatars are remote 32–48px thumbnails; next/image would cost a
    // remotePatterns entry and an optimization pass for no measurable gain.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={name}
      width={sizePixels[size]}
      height={sizePixels[size]}
      className={cn(
        "shrink-0 rounded-full object-cover",
        sizeClasses[size],
        className
      )}
    />
  );
}
