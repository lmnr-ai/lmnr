import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: async ({ req, token }) => {
      const projectIdMatch = req.nextUrl.pathname.match(/\/projects?\/([^\/]+)/);
      const projectId = projectIdMatch ? projectIdMatch[1] : null;

      try {
        const apiKey = token?.apiKey;

        if (!apiKey) {
          return false;
        }

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

        if (data.message !== "Authorized") {
          return false;
        }

        return true;
      } catch (error) {
        console.log("error", error);
        return false;
      }
    },
  },
  pages: {
    signIn: "/not-found",
  },
});

export const config = {
  matcher: ["/api/projects/:path+", "/projects/:path+"],
};
