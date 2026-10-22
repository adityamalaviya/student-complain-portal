import { NextResponse } from 'next/server';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    service: 'campusvoice-frontend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    active_departments: [
      { code: '06', name: 'Civil Department' },
      { code: '07', name: 'Computer Department' },
    ],
  });
}
