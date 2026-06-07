import { APIError, createAuthEndpoint } from "better-auth/api";
import { setSessionCookie } from "better-auth/cookies";
import * as z from "zod";

/**
 * Passwordless local-email sign-in plugin.
 *
 * Replicates the legacy NextAuth "Email" Credentials provider, a self-hosted
 * convenience that signs a user in with ANY email and no password. Only mounted
 * when EMAIL_AUTH is enabled (local / non-production with no real IdP); never in
 * cloud. Exposes POST /api/auth/sign-in/local-email.
 */
export const localEmail = () => ({
  id: "local-email",
  endpoints: {
    signInLocalEmail: createAuthEndpoint(
      "/sign-in/local-email",
      {
        method: "POST",
        body: z.object({
          email: z.string().email(),
          name: z.string().optional(),
          callbackURL: z.string().optional(),
        }),
      },
      async (ctx) => {
        const { email, name } = ctx.body;

        const existing = await ctx.context.internalAdapter.findUserByEmail(email);
        const user =
          existing?.user ??
          (await ctx.context.internalAdapter.createUser({
            email,
            name: name || email,
            // Verified so a later OAuth sign-in with the same address can link
            // (Better Auth's account-linking gate requires a verified local
            // email — see `requireLocalEmailVerified`). Local-email is a
            // no-password convenience, so there's no verification state to protect.
            emailVerified: true,
          }));

        if (!user) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create user" });
        }

        const session = await ctx.context.internalAdapter.createSession(user.id, false);
        if (!session) {
          throw new APIError("INTERNAL_SERVER_ERROR", { message: "Failed to create session" });
        }

        await setSessionCookie(ctx, { session, user });

        return ctx.json({ token: session.token, user });
      }
    ),
  },
});
