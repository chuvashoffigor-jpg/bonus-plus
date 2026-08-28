import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, msError } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { applyPointsTransaction } from '@/lib/loyalty';

// Документация: POST /retailsalesreturn
// МойСклад не присылает здесь готовые суммы баллов — по спецификации система
// лояльности сама определяет начисление/списание на основе связанной продажи.
// Поэтому находим исходные транзакции по demand.meta.id и разворачиваем их.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return msError(403, 'Неверный токен авторизации', 401);

  const body = await req.json();
  const originalDemandId: string | undefined = body?.demand?.meta?.id;
  const returnId: string | undefined = body?.meta?.id;
  const storeId: string | undefined = body?.retailStore?.meta?.id;

  if (!originalDemandId) {
    // Возврат без ссылки на исходную продажу (например, возврат «в никуда») —
    // автоматически ничего не пересчитываем, потребуется ручная корректировка в админке.
    return NextResponse.json({}, { status: 201 });
  }

  const originalTransactions = await prisma.pointsTransaction.findMany({
    where: { msDemandId: originalDemandId },
  });

  for (const original of originalTransactions) {
    // Не разворачиваем одну и ту же операцию дважды при повторном запросе.
    const alreadyReversed = await prisma.pointsTransaction.findFirst({
      where: { reversesTransactionId: original.id },
    });
    if (alreadyReversed) continue;

    await applyPointsTransaction({
      accountId: original.accountId,
      type: 'REFUND',
      amount: -original.amount,
      source: 'POS',
      storeId,
      msDemandId: returnId,
      reversesTransactionId: original.id,
      comment: `Возврат по продаже №${originalDemandId}`,
    });
  }

  return NextResponse.json({}, { status: 201 });
}
