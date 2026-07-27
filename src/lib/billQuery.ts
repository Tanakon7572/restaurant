// Everything a receipt needs, in one shape shared by every bill endpoint.
// Orders carry their own `dailyNumber`, so nothing here has to work it out.
export const BILL_INCLUDE = {
  orders: {
    orderBy: { id: 'asc' as const },
    include: { items: { include: { options: true } } },
  },
}
