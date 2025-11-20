import { withAuth } from "next-auth/middleware";

async function checkTraceVisibility(traceId: string): Promise<boolean> {
  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/auth/traces/${traceId}`, {
      method: "GET",
    });

    if (!res.ok) {
      return false;
    }

    const data = (await res.json()) as { visibility: string };
    return data.visibility === "public";
  } catch (error) {
    return false;
  }
}

export default withAuth({
  callbacks: {
    authorized: async ({ req, token }) => {
      const traceMatch = req.nextUrl.pathname.match(/\/shared\/traces\/([^\/]+)/);
      if (traceMatch) {
        const traceId = traceMatch?.[1];
        return await checkTraceVisibility(traceId);
      }

      return !!token;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});

export const config = {
  matcher: ["/api/projects/:path+", "/project/:path+", "/api/shared/traces/:path+"],
};
