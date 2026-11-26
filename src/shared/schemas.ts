import { z } from 'zod';

import { cleanName } from './text.ts';
import { DOWNLOAD_KINDS, LANGUAGES, MAX_COOKIES_LENGTH } from './types.ts';

// Request bodies accepted by the API. The web app imports only the inferred
// types (`import type`), so zod is never bundled into the browser code.

const name = (max: number) => z.string().transform(cleanName).pipe(z.string().min(1).max(max));

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{2,32}$/);

export const passwordSchema = z.string().min(8).max(200);

export const setupSchema = z.object({
  name: name(50),
  username: usernameSchema,
  password: passwordSchema,
  language: z.enum(LANGUAGES),
});
export type SetupInput = z.input<typeof setupSchema>;

export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().max(64),
  password: z.string().max(200),
});
export type LoginInput = z.input<typeof loginSchema>;

export const updateMeSchema = z.object({
  name: name(50).optional(),
  language: z.enum(LANGUAGES).optional(),
});
export type UpdateMeInput = z.input<typeof updateMeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().max(200),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.input<typeof changePasswordSchema>;

export const createUserSchema = z.object({
  name: name(50),
  username: usernameSchema,
  password: passwordSchema,
  language: z.enum(LANGUAGES),
});
export type CreateUserInput = z.input<typeof createUserSchema>;

export const updateUserSchema = z.object({
  name: name(50).optional(),
  username: usernameSchema.optional(),
});
export type UpdateUserInput = z.input<typeof updateUserSchema>;

export const resetPasswordSchema = z.object({
  password: passwordSchema,
});
export type ResetPasswordInput = z.input<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// Videos, folders and downloads
// ---------------------------------------------------------------------------

/** A path in the media folder ("" for the media folder itself); checked further by the server. */
const mediaPath = z.string().max(2000);

export const probeSchema = z.object({
  url: z.string().trim().min(1).max(2000),
});
export type ProbeInput = z.input<typeof probeSchema>;

export const createDownloadSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  kind: z.enum(DOWNLOAD_KINDS),
  folder: mediaPath,
  /** Save in a folder named after the channel, inside `folder`. */
  channelFolder: z.boolean(),
  /** Replace a file of the same name. */
  overwrite: z.boolean().optional(),
});
export type CreateDownloadInput = z.input<typeof createDownloadSchema>;

export const removeDownloadsSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1).max(1000),
  /** Also delete their files from the media folder. */
  deleteFiles: z.boolean(),
});
export type RemoveDownloadsInput = z.input<typeof removeDownloadsSchema>;

export const cookiesSchema = z.object({
  /** The content of a cookies.txt file (Netscape format). */
  text: z.string().min(1).max(MAX_COOKIES_LENGTH),
});
export type CookiesInput = z.input<typeof cookiesSchema>;

export const createFolderSchema = z.object({
  parent: mediaPath,
  name: z.string().max(400),
});
export type CreateFolderInput = z.input<typeof createFolderSchema>;
