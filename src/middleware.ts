import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { validatePublicSupabaseEnv } from "@/lib/env/supabase-public";
import { safeAdminPostLoginPath, STAFF_LOGIN_PATH } from "@/lib/auth/safe-admin-next";

async function adminMiddleware(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === STAFF_LOGIN_PATH || pathname.startsWith(`${STAFF_LOGIN_PATH}/`);

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const env = validatePublicSupabaseEnv(url, anon);

  if (!env.ok) {
    if (isLogin) {
      return NextResponse.next();
    }
    const login = new URL(STAFF_LOGIN_PATH, request.url);
    login.searchParams.set("error", "config");
    return NextResponse.redirect(login);
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(env.url, env.anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    console.error("[middleware] auth.getUser:", userErr.message);
  }

  if (!user) {
    if (!isLogin) {
      const login = new URL(STAFF_LOGIN_PATH, request.url);
      login.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(login);
    }
    return supabaseResponse;
  }

  const { data: allowed, error: rpcErr } = await supabase.rpc("can_access_admin_portal");

  if (rpcErr) {
    console.error("[middleware] can_access_admin_portal:", rpcErr.message);
    if (!isLogin) {
      const login = new URL(STAFF_LOGIN_PATH, request.url);
      login.searchParams.set("error", "server");
      return NextResponse.redirect(login);
    }
    return supabaseResponse;
  }

  if (!allowed) {
    if (!isLogin) {
      const login = new URL(STAFF_LOGIN_PATH, request.url);
      login.searchParams.set("error", "forbidden");
      return NextResponse.redirect(login);
    }
    return supabaseResponse;
  }

  if (isLogin) {
    // Avoid ERR_TOO_MANY_REDIRECTS when the server rejected the session in layout but the JWT still passes middleware.
    if (request.nextUrl.searchParams.get("error") === "context") {
      return supabaseResponse;
    }
    const next = request.nextUrl.searchParams.get("next");
    const dest = safeAdminPostLoginPath(next);
    return NextResponse.redirect(new URL(dest, request.url));
  }

  return supabaseResponse;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isLogin = pathname === STAFF_LOGIN_PATH || pathname.startsWith(`${STAFF_LOGIN_PATH}/`);
  try {
    return await adminMiddleware(request);
  } catch (e) {
    console.error("[middleware] unhandled:", e instanceof Error ? e.message : e);
    if (isLogin) {
      return NextResponse.next();
    }
    const login = new URL(STAFF_LOGIN_PATH, request.url);
    login.searchParams.set("error", "server");
    return NextResponse.redirect(login);
  }
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
