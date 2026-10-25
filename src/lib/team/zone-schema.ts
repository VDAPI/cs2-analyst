import { z } from "zod";

/** Request fields of a drawn callout zone (POST/PATCH /api/admin/zones). */
export const zoneFields = {
  name: z.string().trim().min(1).max(40),
  points: z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .min(3)
    .max(64),
  ctSpot: z.string().trim().max(40),
  laneA: z.string().trim().max(40),
  laneB: z.string().trim().max(40),
};
