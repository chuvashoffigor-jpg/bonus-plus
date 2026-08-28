import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, msError } from '@/lib/auth';
import { resolveAccount } from '@/lib/loyalty';

// Документация: POST /counterparty/detail
// МойСклад запрашивает баланс, чтобы показать его кассиру на кассе.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return msError(403, 'Неверный токен авторизации', 401);

  const body = await req.json();
  const msCounterpartyId: string | undefined = body?.meta?.id;

  const account = await resolveAccount({
    msCounterpartyId,
    discountCardNumber: body?.discountCardNumber,
    phone: body?.phone,
  });

  if (!account) {
    return msError(404, 'Покупатель не найден', 404, 'meta.id');
  }

  return NextResponse.json({
    bonusProgram: { agentBonusBalance: account.balance },
  });
}
