import { prisma } from './prisma';
import { msGet, msPost, msPut } from './msClient';
import { getSettings } from './loyalty';

const ATTRIBUTE_NAME = 'Баланс баллов';

// Находит доп. поле "Баланс баллов" у контрагента в МойСклад, а если его ещё нет —
// создаёт один раз и запоминает id в Settings, чтобы не создавать повторно.
// Это то, что делает баланс видимым прямо в карточке клиента в МойСклад,
// без всякого LoyaltyAPI — потому что доп. поля это часть обычного JSON API.
export async function getOrCreatePointsAttributeId(): Promise<string> {
  const settings = await getSettings();
  if (settings.pointsAttributeId) return settings.pointsAttributeId;

  const metadata = await msGet('/entity/counterparty/metadata');
  const existing = (metadata?.attributes ?? []).find(
    (a: { name: string; id: string }) => a.name === ATTRIBUTE_NAME
  );

  let attributeId: string | undefined = existing?.id;

  if (!attributeId) {
    const created = await msPost('/entity/counterparty/metadata/attributes', {
      name: ATTRIBUTE_NAME,
      type: 'long',
    });
    attributeId = created.id;
  }

  await prisma.settings.update({
    where: { id: 1 },
    data: { pointsAttributeId: attributeId },
  });

  return attributeId!;
}

// Пишет актуальный баланс в доп. поле контрагента. Best-effort: если это не
// получилось (например, поменялось имя поля), операция с баллами в вашей
// базе всё равно уже сохранена — просто отображение в МойСклад отстанет.
export async function pushBalanceToCounterparty(msCounterpartyId: string, balance: number) {
  try {
    const attributeId = await getOrCreatePointsAttributeId();
    await msPut(`/entity/counterparty/${msCounterpartyId}`, {
      attributes: [
        {
          meta: {
            href: `https://api.moysklad.ru/api/remap/1.2/entity/counterparty/metadata/attributes/${attributeId}`,
            type: 'attributemetadata',
            mediaType: 'application/json',
          },
          value: balance,
        },
      ],
    });
  } catch (err) {
    console.error('Не удалось записать баланс баллов в МойСклад:', err);
  }
}
