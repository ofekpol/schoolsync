import { z } from "zod";

/** Every power a profile option can grant. Keep in sync with the CHECK in migration 0029. */
export const PERMISSIONS = ["rooms.book", "rooms.manage"] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const PermissionSchema = z.enum(PERMISSIONS);
