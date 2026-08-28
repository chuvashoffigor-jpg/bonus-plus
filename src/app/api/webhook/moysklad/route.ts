import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { msGetByHref } from '@/lib/msClient';
import { fetchCounterparty, writeDiscountCardNumber } from '@/lib/msCounterparty';
import { pushBalanceToCounterparty } from '@/lib/msAttributes';
import { generateUniqueCardNumber } from '@/lib/barcode';
import { getSettings, resolveAccount, applyPointsTransaction } from '@/lib/loyalty';

// МойСклад стучится сюда при создании розничной продажи или возврата.
// Регистрируется один раз через POST /entity/webhook (см. README) —
// это обычный JSON API, доступ к нему не требует регистрации разработчика.
//
// ВАЖНО: формат тела, которое реально присылает МойСклад, стоит сверить на
// практике при первом подключении — ниже код логирует сырой payload и разбирает
// его по наиболее распространённой для МойСклад схеме {"events":[...]}.
// Если структура окажется другой — это будет сразу видно в логах Vercel.
export async function POST(req: NextRequest) {
  const secret = new URL(req.url).searchParams.get('secret');
  if (!secret || secret !== process.env.MS_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const raw = await req.text();
  console.log('MoySklad webhook payload:', raw);

  let body: { events?: Array<{ entityType: string; action: string; meta: { href: string } }> };
  try {
    body = JSON.parse(raw);
  } catch {
    // Пустое или нераспознанное тело — не роняем вебхук, просто ничего не делаем.
    return NextResponse.json({ ok: true });
  }

  const events = body.events ?? [];

  for (const event of events) {
    try {
      if (event.entityType === 'retaildemand' && event.action === 'CREATE') {
        await handleRetailDemand(event.meta.href);
      } else if (event.entityType === 'retailsalesreturn' && event.action === 'CREATE') {
        await handleRetailReturn(event.meta.href);
      }
    } catch (err) {
      // Одна ошибка не должна ронять обработку остальных событий в пачке.
      console.error('Ошибка обработки события вебхука МойСклад:', err);
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleRetailDemand(href: string) {
  const demand = await msGetByHref(`${href}?expand=agent,retailStore`);
  const demandId: string = demand.id;

  const agentHref: string | undefined = demand.agent?.meta?.href;
  if (!agentHref) return; // продажа без покупателя — участия в программе нет

  const counterparty = await fetchCounterparty(agentHref);
  const msCounterpartyId: string = counterparty.id;

  let account = await resolveAccount({ msCounterpartyId, phone: counterparty.phone });

  if (!account) {
    const cardNumber = counterparty.discountCardNumber || (await generateUniqueCardNumber());
    account = await prisma.loyaltyAccount.create({
      data: {
        msCounterpartyId,
        discountCardNumber: cardNumber,
        name: counterparty.name ?? null,
        phone: counterparty.phone ?? null,
        email: counterparty.email ?? null,
      },
    });
    if (!counterparty.discountCardNumber) {
      await writeDiscountCardNumber(msCounterpartyId, cardNumber);
    }
  }

  // Идемпотентность: одна и та же продажа не должна начислить баллы дважды.
  const already = await prisma.pointsTransaction.findFirst({ where: { msDemandId: demandId } });
  if (already) return;

  const settings = await getSettings();
  const orderTotal = (demand.sum ?? 0) / 100; // МойСклад хранит суммы в копейках
  const bonusValueToEarn = Math.floor((orderTotal * settings.earnRatePercent) / 100);
  if (bonusValueToEarn <= 0) return;

  const updated = await applyPointsTransaction({
    accountId: account.id,
    type: 'EARNING',
    amount: bonusValueToEarn,
    source: 'POS',
    storeId: demand.retailStore?.id ?? null,
    msDemandId: demandId,
    comment: `Начисление за продажу №${demand.name ?? ''}`.trim(),
  });

  await pushBalanceToCounterparty(msCounterpartyId, updated.balance);
}

async function handleRetailReturn(href: string) {
  const ret = await msGetByHref(`${href}?expand=demand`);
  const originalDemandHref: string | undefined = ret.demand?.meta?.href;
  if (!originalDemandHref) return;

  const originalDemand = await msGetByHref(originalDemandHref);
  const originalDemandId: string = originalDemand.id;

  const originalTransactions = await prisma.pointsTransaction.findMany({
    where: { msDemandId: originalDemandId },
  });

  for (const original of originalTransactions) {
    const alreadyReversed = await prisma.pointsTransaction.findFirst({
      where: { reversesTransactionId: original.id },
    });
    if (alreadyReversed) continue;

    const updated = await applyPointsTransaction({
      accountId: original.accountId,
      type: 'REFUND',
      amount: -original.amount,
      source: 'POS',
      msDemandId: ret.id,
      reversesTransactionId: original.id,
      comment: `Возврат по продаже №${originalDemand.name ?? ''}`,
    });

    const account = await prisma.loyaltyAccount.findUnique({ where: { id: original.accountId } });
    if (account?.msCounterpartyId) {
      await pushBalanceToCounterparty(account.msCounterpartyId, updated.balance);
    }
  }
}
