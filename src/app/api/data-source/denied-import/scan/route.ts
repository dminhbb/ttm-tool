import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth-service';
import { dataSourceErrorResponse, readJsonBody, requireEpicKeys } from '@/lib/data-source-api-helpers';
import { denyScanCandidates, scanImportAdmissionCandidates } from '@/lib/denied-import-service';

/**
 * "Quét lại" — GET: the Epics already in the database that break an automatic rule and are not
 * listed yet; POST { epicKeys }: deny the chosen ones (source AUTO_RULE) and delete their data.
 */
export async function GET(request: NextRequest) {
  try {
    await requireUser(request, ['SUPERADMIN']);
    return NextResponse.json({ candidates: await scanImportAdmissionCandidates() });
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi quét Epic theo rule Từ chối import');
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request, ['SUPERADMIN']);
    const body = await readJsonBody(request);
    return NextResponse.json(await denyScanCandidates(requireEpicKeys(body.epicKeys), user.id));
  } catch (error: unknown) {
    return dataSourceErrorResponse(error, 'Lỗi hệ thống khi từ chối các Epic đã quét');
  }
}
