import type { Reward } from '../lib/types'

/** Fictional placeholder rewards. Not connected to LionCash, Amazon or any payment system. */

export const REWARDS: Reward[] = [
  { id: '00000000-0000-4000-8003-000000000001', title: 'Amazon $5 Gift Card', description: 'Mock digital gift card for demonstration. Not a real Amazon card.', pointsRequired: 500, imageKey: 'gift', active: true },
  { id: '00000000-0000-4000-8003-000000000002', title: 'Campus Bookstore $5 Voucher', description: 'Mock voucher toward books or supplies at the campus store.', pointsRequired: 500, imageKey: 'book', active: true },
  { id: '00000000-0000-4000-8003-000000000003', title: 'Campus Dining $5 Credit', description: 'Mock credit for a coffee or snack on campus. Not connected to LionCash.', pointsRequired: 500, imageKey: 'dining', active: true },
  { id: '00000000-0000-4000-8003-000000000004', title: 'Campus Merchandise', description: 'Mock pick of a campus T-shirt, mug or water bottle.', pointsRequired: 700, imageKey: 'merch', active: true },
]
