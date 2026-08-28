import { NextRequest, NextResponse } from 'next/server';
import { isAuthorized, msError } from '@/lib/auth';
import { resolveAccount, calcOrderTotal, getSettings } from '@/lib/loyalty';

type Position = { price: number; quantity: number; [key: string]: unknown };

// Документация: POST /retaildemand/recalc
// Вызывается кассой в реальном времени по мере сканирования товаров.
// Важно: этот метод ничего не меняет в базе — только считает и возвращает превью.
// Реальное списание/начисление происходит только в /retaildemand при закрытии чека.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return msError(403, 'Неверный токен авторизации', 401);

  const body = await req.json();
  const positions: Position[] = body.positions ?? [];
  const transactionType: 'EARNING' | 'SPENDING' = body?.bonusProgram?.transactionType ?? 'EARNING';
  const preferredBonusToSpend: number | null = body?.bonusProgram?.preferredBonusToSpend ?? null;

  const settings = await getSettings();
  const account = await resolveAccount({
    msCounterpartyId: body?.agent?.meta?.id,
    discountCardNumber: body?.agent?.discountCardNumber,
    phone: body?.agent?.phone,
  });

  const balance = account?.balance ?? 0;
  const orderTotal = calcOrderTotal(positions.map((p) => ({ price: p.price, quantity: p.quantity })));

  let bonusValueToSpend = 0;
  let bonusValueToEarn = 0;
  let paidByBonusPoints = 0;

  if (transactionType === 'SPENDING' && account) {
    const maxByOrderCap = Math.floor(
      (orderTotal * settings.maxPaymentPercent) / 100 / settings.redeemRateRub
    );
    const maxRedeemable = Math.max(0, Math.min(maxByOrderCap, balance));
    bonusValueToSpend =
      preferredBonusToSpend != null ? Math.min(preferredBonusToSpend, maxRedeemable) : maxRedeemable;
    paidByBonusPoints = Math.round(bonusValueToSpend * settings.redeemRateRub * 100) / 100;
  } else {
    bonusValueToEarn = Math.floor((orderTotal * settings.earnRatePercent) / 100);
  }

  // Скидку от списания баллов размазываем пропорционально по всем позициям чека.
  const discountRatio = orderTotal > 0 ? paidByBonusPoints / orderTotal : 0;
  const outPositions = positions.map((p) => ({
    ...p,
    discountPercent: Math.round(discountRatio * 10000) / 100,
    discountedPrice: Math.round(p.price * (1 - discountRatio) * 100) / 100,
  }));

  const agentBonusBalanceAfter = balance - bonusValueToSpend + bonusValueToEarn;

  let receiptExtraInfo: string | undefined;
  if (bonusValueToEarn > 0) receiptExtraInfo = `Будет начислено ${bonusValueToEarn} баллов`;
  else if (bonusValueToSpend > 0) receiptExtraInfo = `Списано ${bonusValueToSpend} баллов`;

  return NextResponse.json({
    agent: body.agent,
    positions: outPositions,
    bonusProgram: {
      transactionType,
      agentBonusBalance: balance,
      bonusValueToSpend,
      bonusValueToEarn,
      agentBonusBalanceAfter,
      paidByBonusPoints,
      receiptExtraInfo,
    },
    needVerification: false,
  });
}
