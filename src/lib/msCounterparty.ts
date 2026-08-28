import { msGetByHref, msPut } from './msClient';

export function fetchCounterparty(href: string) {
  return msGetByHref(href);
}

// Записывает штрихкод клиента в нативное поле "номер дисконтной карты" —
// то самое, по которому касса МойСклад сама находит покупателя при сканировании.
// Обёрнуто в try/catch: если точное имя поля в вашем аккаунте отличается,
// это не должно ронять начисление баллов — только запись обратно в МойСклад.
export async function writeDiscountCardNumber(msCounterpartyId: string, cardNumber: string) {
  try {
    await msPut(`/entity/counterparty/${msCounterpartyId}`, {
      discountCardNumber: cardNumber,
    });
  } catch (err) {
    console.error(
      'Не удалось записать номер карты в МойСклад (проверьте точное имя поля через GET /entity/counterparty/metadata):',
      err
    );
  }
}
