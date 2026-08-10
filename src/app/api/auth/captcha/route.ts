import { NextResponse } from 'next/server';
import { issueCaptcha } from '@/lib/captcha-service';
export async function GET() { return NextResponse.json(issueCaptcha(), { headers: { 'Cache-Control': 'no-store' } }); }
