import type {
  OrderRow,
  OrderItemRow,
  OrderStatus,
  ReviewRow,
  SellerRow,
  PreOrderWindowRow,
} from '../types/database';
import type { CartItem, CartSellerInfo } from '../context/CartContext';
import { demoListings, demoSellers, DEMO_ADDRESS, isDemoId, makeDemoWindows } from './catalog';

export type DemoOrder = OrderRow & {
  order_items: OrderItemRow[];
  sellers: SellerRow;
  reviews: ReviewRow[];
};
export type DemoState = {
  version: 1;
  enabled: boolean;
  favourites: string[];
  address: string;
  orders: DemoOrder[];
  windows: PreOrderWindowRow[];
};
export const DEMO_STEPS: OrderStatus[] = [
  'paid',
  'accepted',
  'preparing',
  'ready',
  'driver_assigned',
  'picked_up',
  'en_route',
  'delivered',
];
const round = (n: number) => Math.round(n * 100) / 100;
export function demoQuote(subtotal: number) {
  const tax = round(subtotal * 0.05);
  return {
    subtotal: round(subtotal),
    deliveryFee: 3.99,
    serviceFee: 1.49,
    tax,
    total: round(subtotal + 3.99 + 1.49 + tax),
    commissionRate: 0,
    commissionAmount: 0,
  };
}

export function createDemoOrder(
  items: CartItem[],
  cart: CartSellerInfo,
  address: string,
  instructions: string,
  windows: PreOrderWindowRow[],
  now = Date.now(),
): DemoOrder {
  const seller = demoSellers.find((s) => s.id === cart.sellerId);
  if (!seller || !items.length || !address.trim())
    throw new Error('Choose a seller, items and delivery address.');
  if (!seller.is_open && seller.seller_type !== 'home_cook')
    throw new Error('This seller is closed. Try another favourite.');
  if (seller.seller_type === 'home_cook') {
    const drop = windows.find((w) => w.id === cart.preOrderWindowId && w.seller_id === seller.id);
    if (!drop || drop.status !== 'open' || Date.parse(drop.order_cutoff) <= now)
      throw new Error('Choose an open meal drop before ordering.');
  }
  for (const item of items) {
    const original = demoListings.find((l) => l.id === item.listing.id);
    if (
      !original ||
      original.seller_id !== seller.id ||
      original.sold_out ||
      !original.is_available ||
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 99 ||
      item.listing.price !== original.price
    )
      throw new Error('An item in your basket is unavailable. Please add it again.');
  }
  const q = demoQuote(items.reduce((sum, item) => sum + item.quantity * item.listing.price, 0));
  const id = `demo-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const timestamp = new Date(now).toISOString();
  return {
    id,
    customer_id: 'demo-customer',
    seller_id: seller.id,
    sellers: seller,
    reviews: [],
    driver_id: null,
    pre_order_window_id: cart.preOrderWindowId ?? null,
    status: 'paid',
    delivery_address: address.trim(),
    delivery_instructions: instructions.trim() || null,
    delivery_location: null,
    subtotal: q.subtotal,
    delivery_fee: q.deliveryFee,
    service_fee: q.serviceFee,
    tax: q.tax,
    total: q.total,
    commission_rate: 0,
    commission_amount: 0,
    payment_intent_id: null,
    payment_status: 'pending',
    placed_at: timestamp,
    created_at: timestamp,
    updated_at: timestamp,
    accepted_at: null,
    ready_at: null,
    picked_up_at: null,
    delivered_at: null,
    cancelled_at: null,
    cancellation_reason: null,
    order_items: items.map((item, i) => ({
      id: `${id}-${i}`,
      order_id: id,
      listing_id: item.listing.id,
      name: item.listing.name,
      quantity: item.quantity,
      unit_price: item.listing.price,
    })),
  };
}

export function initialDemoState(enabled: boolean, now = Date.now()): DemoState {
  const windows = makeDemoWindows(now);
  const seed = (index: number, status: OrderStatus, age: number) => {
    const listing = demoListings[index];
    const order = createDemoOrder(
      [{ listing, quantity: 1 }],
      {
        sellerId: listing.seller_id,
        sellerType: listing.seller_type,
        businessName: listing.business_name,
      },
      DEMO_ADDRESS,
      'Leave at the door',
      windows,
      now - age,
    );
    return { ...order, status, delivered_at: status === 'delivered' ? order.placed_at : null };
  };
  return {
    version: 1,
    enabled,
    favourites: [],
    address: DEMO_ADDRESS,
    windows,
    orders: [
      seed(0, 'preparing', 600000),
      seed(4, 'delivered', 86400000),
      seed(10, 'delivered', 3 * 86400000),
    ],
  };
}

export function advanceDemoOrder(order: DemoOrder, now = Date.now()): DemoOrder {
  if (!isDemoId(order.id)) throw new Error('This order cannot be advanced here.');
  const index = DEMO_STEPS.indexOf(order.status);
  if (index < 0 || index === DEMO_STEPS.length - 1) return order;
  const status = DEMO_STEPS[index + 1];
  const timestamp = new Date(now).toISOString();
  return {
    ...order,
    status,
    updated_at: timestamp,
    ...(status === 'accepted' ? { accepted_at: timestamp } : {}),
    ...(status === 'ready' ? { ready_at: timestamp } : {}),
    ...(status === 'picked_up' ? { picked_up_at: timestamp } : {}),
    ...(status === 'delivered' ? { delivered_at: timestamp } : {}),
  };
}

export function reviewDemoOrder(order: DemoOrder, rating: number, comment: string): DemoOrder {
  if (!isDemoId(order.id) || order.status !== 'delivered')
    throw new Error('Only delivered orders in this marketplace can be reviewed.');
  if (!Number.isInteger(rating) || rating < 1 || rating > 5)
    throw new Error('Choose a rating from 1 to 5.');
  if (order.reviews.length) throw new Error('You already reviewed this order.');
  return {
    ...order,
    reviews: [
      {
        id: `${order.id}-review`,
        order_id: order.id,
        customer_id: 'demo-customer',
        seller_id: order.seller_id,
        rating,
        comment: comment.trim().slice(0, 500) || null,
        created_at: new Date().toISOString(),
      },
    ],
  };
}
