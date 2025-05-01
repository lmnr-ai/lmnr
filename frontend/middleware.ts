import { withAuth } from "next-auth/middleware";

async function checkProjectAuthorization(projectId?: string, apiKey?: string): Promise<boolean> {
  if (!apiKey) {
    return false;
  }

  try {
    const res = await fetch(`${process.env.NEXTAUTH_URL}/api/auth`, {
      method: "POST",
      body: JSON.stringify({
        projectId,
        apiKey,
      }),
      headers: {
        Authorization: `Bearer ${process.env.SHARED_SECRET_TOKEN}`,
      },
    });

    if (!res.ok) {
      return false;
    }

    const data = await res.json();
    return data.message === "Authorized";
  } catch (error) {
    return false;
  }
}

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
      const projectIdMatch = req.nextUrl.pathname.match(/\/projects?\/([^\/]+)/);
      const projectId = projectIdMatch?.[1];

      const traceMatch = req.nextUrl.pathname.match(/\/shared\/traces\/([^\/]+)/);
      if (traceMatch) {
        const traceId = traceMatch?.[1];
        return await checkTraceVisibility(traceId);
      }

      return await checkProjectAuthorization(projectId, token?.apiKey);
    },
  },
  pages: {
    signIn: "/sign-in",
  },
});

export const config = {
  matcher: ["/api/projects/:path+", "/project/:path+", "/api/shared/traces/:path+"],
};
