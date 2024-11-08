import { withAuth } from "next-auth/middleware";

export default withAuth({
  callbacks: {
    authorized: async ({ req, token }) => {
      const projectIdMatch = req.nextUrl.pathname.match(/\/projects?\/([^\/]+)/);
      const projectId = projectIdMatch ? projectIdMatch[1] : null;

      const res = await fetch(`${process.env.NEXTAUTH_URL}/api/auth`, {
        method: 'POST',
        body: JSON.stringify({ projectId }),
        headers: {
          ...Object.fromEntries(req.headers),
          'Authorization': `Bearer ${process.env.SHARED_SECRET_TOKEN}`,
        },
      });

      const data = await res.json();

      if (data.message !== 'Authorized') {
        return false;
      }

      return true;
    },
  },
  pages: {
    signIn: '/not-found',
  },
});

export const config = {
  matcher: [
    '/api/projects/:path*',
    '/project/:path*',
  ],
};
