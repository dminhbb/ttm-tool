import 'server-only';

import type { AuthUser } from '@/modules/iam/public';
import { getDataNormalization as loadDataNormalization, type DataNormalizationInput } from '@/lib/data-normalization-service';

/**
 * Application use case behind "Chuẩn hoá dữ liệu": the Epics breaking each "Sai lệch dữ liệu" rule,
 * in the caller's own data scope (the same one TTM Dashboard 2 uses).
 */
export async function getDataNormalization(actor: AuthUser, input: DataNormalizationInput) {
  const data = await loadDataNormalization(actor.id, actor.role, input);
  return { ...data, actor: { fullName: actor.fullName, role: actor.role } };
}
