import { NextResponse } from 'next/server';
import { INSTITUTIONAL_DEPARTMENTS } from '@/lib/utils';

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    status: 'ok',
    service: 'campusvoice-frontend',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    active_departments: INSTITUTIONAL_DEPARTMENTS.map((dept) => ({
      id: dept.id,
      name: dept.name,
      is_academic: dept.is_academic,
      is_maintenance: dept.is_maintenance,
      is_active: dept.is_active,
    })),
  });
}
