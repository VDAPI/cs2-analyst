"use client";

import { signIn } from "next-auth/react";

export function SteamLoginButton() {
  return (
    <button
      onClick={() => signIn("steam", { callbackUrl: "/matches" })}
      className="transition-opacity hover:opacity-80"
    >
      {/* Official Valve "Sign in through Steam" button */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="https://community.fastly.steamstatic.com/public/images/signinthroughsteam/sits_01.png"
        alt="Sign in through Steam"
        width={180}
        height={35}
      />
    </button>
  );
}
