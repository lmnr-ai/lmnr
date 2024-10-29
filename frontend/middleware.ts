import { withAuth } from "next-auth/middleware";

export default withAuth;

export const config = {
  matcher: [
    '/api/projects/:path*',
    '/project/:path*',
    '/projects'
  ],
};
