import { prisma } from './prisma';
import { TxType, TxSource } from '@prisma/client';

export async function getSettings() {
  const settings = await prisma.settings.findUnique({ where: { id: 1 } });
  if (settings) return settings;
  // Если строка настроек ещё не создана — создаём со значениями по умолчанию.
  return prisma.settings.create({ data: { id: 1 } });
}

// Находит счёт клиента по любому из известных идентификаторов.
// Порядок важен: id контрагента МойСклад — самый надёжный, дальше номер карты, дальше телефон.
export async function resolveAccount(params: {
  msCounterpartyId?: string | null;
  discountCardNumber?: string | null;
  phone?: string | null;
}) {
  const { msCounterpartyId, discountCardNumber, phone } = params;

  if (msCounterpartyId) {
    const byMs = await prisma.loyaltyAccount.findUnique({ where: { msCounterpartyId } });
    if (byMs) return byMs;
  }
  if (discountCardNumber) {
    const byCard = await prisma.loyaltyAccount.findUnique({ where: { discountCardNumber } });
    if (byCard) return byCard;
  }
  if (phone) {
    const byPhone = await prisma.loyaltyAccount.findFirst({ where: { phone } });
    if (byPhone) return byPhone;
  }
  return null;
}

export function calcOrderTotal(positions: { price: number; quantity: number }[]): number {
  return positions.reduce((sum, p) => sum + p.price * p.quantity, 0);
}

// Атомарно меняет баланс и пишет запись в историю операций.
export async function applyPointsTransaction(params: {
  accountId: string;
  type: TxType;
  amount: number; // со знаком: + начисление, - списание
  source: TxSource;
  storeId?: string | null;
  msDemandId?: string | null;
  reversesTransactionId?: string | null;
  comment?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const account = await tx.loyaltyAccount.update({
      where: { id: params.accountId },
      data: { balance: { increment: params.amount } },
    });

    await tx.pointsTransaction.create({
      data: {
        accountId: params.accountId,
        type: params.type,
        amount: params.amount,
        balanceAfter: account.balance,
        source: params.source,
        storeId: params.storeId ?? undefined,
        msDemandId: params.msDemandId ?? undefined,
        reversesTransactionId: params.reversesTransactionId ?? undefined,
        comment: params.comment ?? undefined,
      },
    });

    return account;
  });
}
