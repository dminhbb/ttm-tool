import { NextRequest, NextResponse } from 'next/server';
import { PUBLIC_RATE_LIMITS, rateLimitResponse } from '@/lib/api-rate-limit';
import { listDomains } from '@/lib/master-data-service';
import { createTtlMemo } from '@/lib/rate-limit';

type RegistrationDomain = { domainCode: string; domainName: string; id: number };

// Public and read on every visit of the sign-up form: one database read per half minute serves any burst.
const activeDomains = createTtlMemo<RegistrationDomain[]>(30_000);

export async function GET(request: NextRequest) {
  const limited = rateLimitResponse(request, 'registrationDomains', PUBLIC_RATE_LIMITS.registrationDomains);
  if (limited) return limited;
  try {
    return NextResponse.json(await activeDomains(async () => (await listDomains()).filter((domain) => domain.isActive).map(({ id, domainCode, domainName }) => ({ id, domainCode, domainName }))));
  } catch {
    return NextResponse.json({ error: 'Không thể tải danh sách Domain.' }, { status: 500 });
  }
}
