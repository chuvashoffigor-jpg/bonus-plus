import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, msError } from '@/lib/auth';
import { generateUniqueCardNumber } from '@/lib/barcode';
import { getSettings, applyPointsTransaction } from '@/lib/loyalty';

// МойСклад вызывает этот метод, когда кассир регистрирует нового покупателя
// (например, при первой покупке в офлайн-магазине).
// Документация: POST /counterparty
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) return msError(403, 'Неверный токен авторизации', 401);

  const body = await req.json();
  const msCounterpartyId: string | undefined = body?.meta?.id;

  if (!msCounterpartyId) {
    return msError(412, 'Не указан идентификатор покупателя', 999, 'meta.id');
  }

  const existing = await prisma.loyaltyAccount.findUnique({ where: { msCounterpartyId } });
  if (existing) {
    // Покупатель уже есть — ничего не создаём повторно.
    return NextResponse.json({}, { status: 201 });
  }

  const cardNumber = body.discountCardNumber || (await generateUniqueCardNumber());
  const settings = await getSettings();

  const account = await prisma.loyaltyAccount.create({
    data: {
      msCounterpartyId,
      discountCardNumber: cardNumber,
      name: body.name ?? null,
      phone: body.phone ?? null,
      email: body.email ?? null,
      legalFirstName: body.legalFirstName ?? null,
      legalMiddleName: body.legalMiddleName ?? null,
      legalLastName: body.legalLastName ?? null,
      birthDate: body.birthDate ? new Date(body.birthDate) : null,
      sex: body.sex === 'MALE' || body.sex === 'FEMALE' ? body.sex : null,
    },
  });

  if (settings.welcomeBonus > 0) {
    await applyPointsTransaction({
      accountId: account.id,
      type: 'WELCOME',
      amount: settings.welcomeBonus,
      source: 'SYSTEM',
      comment: 'Приветственные баллы за регистрацию',
    });
  }

  return NextResponse.json({}, { status: 201 });
}

// МойСклад вызывает этот метод, когда кассир ищет покупателя по номеру карты,
// телефону и т.п. (например, после сканирования штрихкода).
// Документация: GET /counterparty?search=...&retailStoreId=...
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) return msError(403, 'Неверный токен авторизации', 401);

  const { searchParams } = new URL(req.url);
  const search = (searchParams.get('search') ?? '').trim();

  if (!search) {
    return NextResponse.json({ rows: [] });
  }

  const accounts = await prisma.loyaltyAccount.findMany({
    where: {
      OR: [
        { discountCardNumber: search },
        { phone: search },
        { email: search },
        { msCounterpartyId: search },
      ],
    },
    take: 10,
  });

  return NextResponse.json({
    rows: accounts.map((a) => ({
      // Если клиент уже связан с контрагентом МойСклад — отдаём его id как основной,
      // иначе (клиент известен только нам, например зарегистрировался на сайте) — свой uuid.
      id: a.msCounterpartyId ?? a.id,
      msId: a.msCounterpartyId ?? undefined,
      name: a.name ?? '',
      discountCardNumber: a.discountCardNumber ?? undefined,
      phone: a.phone ?? undefined,
      email: a.email ?? undefined,
      legalFirstName: a.legalFirstName ?? undefined,
      legalMiddleName: a.legalMiddleName ?? undefined,
      legalLastName: a.legalLastName ?? undefined,
      birthDate: a.birthDate ?? undefined,
      sex: a.sex ?? undefined,
    })),
  });
}
