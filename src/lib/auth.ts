import { NextRequest, NextResponse } from 'next/server';

// МойСклад присылает токен в заголовке Lognex-Discount-API-Auth-Token
// с каждым запросом к LoyaltyAPI. Значение — то, что вы сами сгенерировали
// и один раз передали в настройках решения в личном кабинете разработчика.
export function isAuthorized(req: NextRequest): boolean {
  const token = req.headers.get('lognex-discount-api-auth-token');
  const expected = process.env.MS_LOYALTY_AUTH_TOKEN;
  if (!expected) return false;
  return token === expected;
}

// Формат ошибок строго определён спецификацией LoyaltyAPI МойСклад:
// { errors: [{ error, parameter, code, error_message }] }
export function msError(
  status: number,
  message: string,
  code = 999,
  parameter?: string
) {
  return NextResponse.json(
    {
      errors: [
        {
          error: message,
          parameter,
          code,
          error_message: message,
        },
      ],
    },
    { status }
  );
}
