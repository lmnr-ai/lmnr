import { Resend } from "resend";

export const RESEND = new Resend(process.env.RESEND_API_KEY ?? "_RESEND_API_KEY_PLACEHOLDER");
