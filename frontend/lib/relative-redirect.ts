import { NextResponse } from "next/server";

import { withBasePath } from "@/lib/utils";

// Behind a proxy, route handlers see the server's bind address in request.url (e.g. 0.0.0.0:3000),
// so a relative Location lets the browser resolve it against the origin it is actually on.
export const relativeRedirect = (path: string) =>
  new NextResponse(null, { status: 307, headers: { Location: withBasePath(path) } });
