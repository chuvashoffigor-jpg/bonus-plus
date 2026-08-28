import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, msError } from '@/lib/auth';
import { resolveAccount, applyPointsTransaction } from '@/lib/loyalty';
import { prisma } from '@/lib/prisma';

// Документация: POST /retaildemand
// Вызывается при закрытии чека — здесь и только здесь баллы реально
// списываются/начисляются в базе (в отличие от /recalc, который лишь считает превью).
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return msError(403, 'Неверный токен авторизации', 401);

  const body = await req.json();
  const demandId: string | undefined = body?.meta?.id;
  const storeId: string | undefined = body?.retailStore?.meta?.id;
  const bonusValueToSpend: number = body?.bonusProgram?.bonusValueToSpend ?? 0;
  const bonusValueToEarn: number = body?.bonusProgram?.bonusValueToEarn ?? 0;

  const account = await resolveAccount({
    msCounterpartyId: body?.agent?.meta?.id,
    discountCardNumber: body?.agent?.discountCardNumber,
    phone: body?.agent?.phone,
  });

  if (!account) {
    // Продажа без покупателя, участвующего в программе лояльности — это нормально,
    // просто баллы не начисляем и не списываем.
    return NextResponse.json({}, { status: 201 });
  }

  // Идемпотентность: МойСклад может повторить запрос при сбое сети —
  // если по этой продаже операции уже проведены, не повторяем их.
  if (demandId) {
    const already = await prisma.pointsTransaction.findFirst({ where: { msDemandId: demandId } });
    if (already) {
      return NextResponse.json({}, { status: 201 });
    }
  }

  if (bonusValueToSpend > 0) {
    await applyPointsTransaction({
      accountId: account.id,
      type: 'SPENDING',
      amount: -bonusValueToSpend,
      source: 'POS',
      storeId,
      msDemandId: demandId,
      comment: `Списание при продаже №${body?.name ?? ''}`.trim(),
    });
  }

  if (bonusValueToEarn > 0) {
    await applyPointsTransaction({
      accountId: account.id,
      type: 'EARNING',
      amount: bonusValueToEarn,
      source: 'POS',
      storeId,
      msDemandId: demandId,
      comment: `Начисление при продаже №${body?.name ?? ''}`.trim(),
    });
  }

  return NextResponse.json({}, { status: 201 });
}
