import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export const dynamic = 'force-dynamic'

async function handler(request: NextRequest) {
  const secretFromQuery = request.nextUrl.searchParams.get('secret')
  const secretFromHeader = request.headers.get('x-revalidate-secret')
  const secret = secretFromQuery || secretFromHeader

  if (!process.env.REVALIDATE_SECRET) {
    return NextResponse.json(
      { ok: false, message: 'REVALIDATE_SECRET is not configured' },
      { status: 500 }
    )
  }

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json(
      { ok: false, message: 'Invalid secret' },
      { status: 401 }
    )
  }

  revalidatePath('/', 'layout')

  return NextResponse.json({
    ok: true,
    revalidated: true,
    now: new Date().toISOString(),
  })
}

export async function GET(request: NextRequest) {
  return handler(request)
}

export async function POST(request: NextRequest) {
  return handler(request)
}
