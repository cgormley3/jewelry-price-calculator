import { NextResponse } from 'next/server';

/**
 * Locks down internal diagnostics in production.
 * - Production: requires ADMIN_DIAGNOSTICS_SECRET in env and matching `x-admin-diagnostics-secret` header.
 * - Non-production: if secret is set, header must match; if unset, allowed (local dev).
 */
export function blockDiagnosticsUnlessAuthorized(request: Request): NextResponse | null {
  const secret = process.env.ADMIN_DIAGNOSTICS_SECRET?.trim();
  const isProd =
    process.env.VERCEL_ENV === 'production' ||
    process.env.NODE_ENV === 'production';

  if (isProd && !secret) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const header = request.headers.get('x-admin-diagnostics-secret')?.trim();
  if (secret) {
    if (header !== secret) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
  }

  return null;
}
