import { randomInt } from 'crypto';
import { prisma } from './prisma';

// Генерирует случайный 12-значный числовой номер карты.
// 12 цифр удобны тем, что подходят и под Code128 (без ограничений),
// и при желании легко превращаются в EAN-13 (добавлением контрольной цифры).
function randomCardNumber(): string {
  let code = '';
  for (let i = 0; i < 12; i++) code += randomInt(0, 10).toString();
  return code;
}

// Подбирает номер карты, гарантированно не занятый другим клиентом.
export async function generateUniqueCardNumber(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = randomCardNumber();
    const exists = await prisma.loyaltyAccount.findUnique({
      where: { discountCardNumber: candidate },
    });
    if (!exists) return candidate;
  }
  throw new Error('Не удалось сгенерировать уникальный номер карты за 5 попыток');
}
