export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    "/matches/:path*",
    "/upload/:path*",
    "/players/:path*",
    "/heatmaps/:path*",
    "/economy/:path*",
    "/grenades/:path*",
    "/replay/:path*",
    "/compare/:path*",
    "/settings/:path*",
  ],
};
