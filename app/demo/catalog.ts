import type { SellerRow, VisibleListingRow, PreOrderWindowRow } from '../types/database';

const created = '2026-01-01T12:00:00.000Z';
export const DEMO_ADDRESS = '12 Maple Road, Edmonton · Sample address';
export const isDemoId = (id?: string | null) => !!id?.startsWith('demo-');

function seller(
  id: string,
  name: string,
  type: SellerRow['seller_type'],
  photo: string,
  tags: string[],
  description: string,
  rating: number,
  count: number,
  minutes = 25,
): SellerRow {
  return {
    id: `demo-${id}`,
    user_id: `demo-owner-${id}`,
    business_name: name,
    seller_type: type,
    description,
    cuisine_tags: tags,
    verification_status: 'approved',
    rejection_reason: null,
    food_category_tier: type === 'home_cook' ? 'low_risk' : null,
    permit_status: 'none',
    compliance_label: null,
    licence_doc_path: null,
    permit_doc_path: null,
    id_doc_path: null,
    food_handler_cert_path: null,
    commission_rate: 0,
    address: 'Sample neighbourhood, Edmonton',
    location: null,
    open_hours: {},
    prep_time_mins: minutes,
    accepts_realtime: type !== 'home_cook',
    accepts_scheduled: true,
    is_open: type !== 'home_cook',
    avg_rating: rating,
    rating_count: count,
    logo_url: `demo:${photo}`,
    banner_url: `demo:${photo}`,
    created_at: created,
    updated_at: created,
  };
}

/** Fictional sellers and illustrative photos. Never inserted into the backend. */
export const demoSellers = [
  seller(
    'olive',
    'Olive & Ember',
    'restaurant',
    'grill',
    ['Middle Eastern', 'Grill', 'Rice bowls'],
    'Flame-grilled favourites, fragrant rice and generous portions. A little comfort in every bite.',
    4.9,
    524,
  ),
  seller(
    'joint',
    'The Halal Joint',
    'restaurant',
    'burger',
    ['Burgers', 'Comfort food', 'Fries'],
    'Smashed fresh, stacked high. Your new favourite burger night starts here.',
    4.8,
    286,
    20,
  ),
  seller(
    'saffron',
    'Saffron Table',
    'restaurant',
    'curry',
    ['South Asian', 'Curries', 'Family meals'],
    'Slow-cooked curries and warming spices, made for sharing around the table.',
    4.7,
    318,
    30,
  ),
  seller(
    'cedar',
    'Cedar Shawarma',
    'restaurant',
    'shawarma',
    ['Lebanese', 'Wraps', 'Grill'],
    'Toasted wraps, bright herbs and our house garlic sauce. Lunch, sorted.',
    4.6,
    179,
    15,
  ),
  seller(
    'meadow',
    'Meadow Halal Butchers',
    'butcher',
    'butcher',
    ['Fresh cuts', 'Family boxes', 'Local'],
    'Freshly prepared cuts for your kitchen. Discover our family favourites and weekend grill boxes.',
    4.9,
    204,
    40,
  ),
  {
    ...seller(
      'farm',
      'Green Pasture Farm',
      'butcher',
      'butcher',
      ['Farm shop', 'Beef', 'Lamb'],
      'Thoughtfully selected cuts for the meals you love to make at home.',
      4.5,
      88,
      45,
    ),
    is_open: false,
  },
  seller(
    'amina',
    'Amina’s Bakehouse',
    'home_cook',
    'baklava',
    ['Home baked', 'Pistachio', 'Small batch'],
    'Flaky layers, fragrant honey and a whole lot of care. Reserve a box from the next neighbourhood bake.',
    4.9,
    96,
  ),
  seller(
    'sana',
    'Sana’s Sweet Table',
    'home_cook',
    'baklava',
    ['Baklava', 'Desserts', 'Sharing boxes'],
    'Sweet treats for sharing. Small batches prepared for scheduled neighbourhood meal drops.',
    4.8,
    72,
  ),
];

function listing(
  sellerIndex: number,
  slug: string,
  name: string,
  price: number,
  photo: string,
  description: string,
  category = 'Favourites',
  soldOut = false,
): VisibleListingRow {
  const s = demoSellers[sellerIndex];
  return {
    id: `demo-${slug}`,
    seller_id: s.id,
    name,
    description,
    price,
    image_url: `demo:${photo}`,
    category,
    is_low_risk: s.seller_type === 'home_cook',
    is_available: true,
    sold_out: soldOut,
    business_name: s.business_name,
    seller_type: s.seller_type,
    is_open: s.is_open,
    avg_rating: s.avg_rating,
    rating_count: s.rating_count,
    created_at: created,
    updated_at: created,
  };
}

export const demoListings = [
  listing(
    0,
    'chicken-rice',
    'Flame-grilled chicken & rice',
    18.5,
    'grill',
    'Charred chicken, saffron rice, fresh herbs and our house sauce.',
  ),
  listing(
    0,
    'olive-wrap',
    'Chicken shawarma wrap',
    13.5,
    'shawarma',
    'Warm toasted flatbread, juicy chicken, pickles and garlic sauce.',
  ),
  listing(
    0,
    'olive-feast',
    'The sharing feast',
    34,
    'grill',
    'Grilled chicken and fragrant rice for two. Made for a cosy night in.',
    'For the table',
  ),
  listing(
    0,
    'olive-baklava',
    'Pistachio baklava box',
    8.5,
    'baklava',
    'Four flaky, honey-glazed pieces finished with pistachio.',
    'Something sweet',
  ),
  listing(
    1,
    'classic-burger',
    'The double smash',
    16.5,
    'burger',
    'Two beef patties, melted cheddar, pickles and house sauce. Served with fries.',
  ),
  listing(
    1,
    'family-burgers',
    'Burger night for two',
    29,
    'burger',
    'Two double smash burgers and a generous portion of golden fries.',
    'For the table',
  ),
  listing(
    1,
    'joint-special',
    'Weekend special',
    18,
    'burger',
    'Our limited weekend burger and fries.',
    'Specials',
    true,
  ),
  listing(
    2,
    'chicken-curry',
    'Homestyle chicken curry',
    17.5,
    'curry',
    'Tender chicken simmered in a rich tomato sauce with warming spices.',
  ),
  listing(
    2,
    'saffron-rice',
    'Grilled chicken rice bowl',
    18,
    'grill',
    'A generous rice bowl with grilled chicken and fresh herbs.',
  ),
  listing(
    2,
    'curry-feast',
    'Family curry feast',
    39,
    'curry',
    'Our homestyle chicken curry, enough for the family.',
    'For the table',
  ),
  listing(
    3,
    'cedar-wrap',
    'Signature shawarma',
    12.5,
    'shawarma',
    'Grilled chicken, salad and creamy garlic sauce, toasted to order.',
  ),
  listing(
    3,
    'cedar-pair',
    'Shawarma duo',
    23,
    'shawarma',
    'Two signature chicken wraps for a delicious lunch together.',
  ),
  listing(
    4,
    'meadow-box',
    'Weekend grill box · 1 kg',
    32,
    'butcher',
    'A selection of fresh beef cuts for your weekend barbecue.',
    'Fresh cuts',
  ),
  listing(
    4,
    'meadow-steaks',
    'Premium steak selection · 500 g',
    24,
    'butcher',
    'Fresh steaks, ready for your favourite marinade.',
    'Fresh cuts',
  ),
  listing(
    5,
    'pasture-box',
    'Family beef box · 1 kg',
    29,
    'butcher',
    'A versatile selection of beef cuts for family cooking.',
    'Fresh cuts',
  ),
  listing(
    6,
    'amina-baklava',
    'Pistachio baklava · 6 pieces',
    14,
    'baklava',
    'Hand-layered pastry, fragrant honey and crushed pistachios.',
    'The next bake',
  ),
  listing(
    6,
    'amina-sharing',
    'Baklava sharing box · 12 pieces',
    26,
    'baklava',
    'A generous box of our signature pistachio baklava.',
    'The next bake',
  ),
  listing(
    7,
    'sana-baklava',
    'Honey baklava · 6 pieces',
    13.5,
    'baklava',
    'Crisp golden pastry with a delicate honey glaze.',
    'Sweet treats',
  ),
];

export function makeDemoWindows(now = Date.now()): PreOrderWindowRow[] {
  return [6, 7].map((index, i) => {
    const ready = new Date(now);
    ready.setDate(ready.getDate() + i + 2);
    ready.setHours(17, 30, 0, 0);
    const cutoff = new Date(ready);
    cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(20, 0, 0, 0);
    return {
      id: `demo-drop-${i + 1}`,
      seller_id: demoSellers[index].id,
      title: i === 0 ? 'The neighbourhood baklava drop' : 'A little sweetness to share',
      cook_date: localCookDate(ready),
      order_cutoff: cutoff.toISOString(),
      min_orders: 10,
      pickup_ready_at: ready.toISOString(),
      status: 'open',
      created_at: created,
    };
  });
}

export function localCookDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function searchDemo(
  query: string,
  filter: 'all' | SellerRow['seller_type'],
  saved?: string[],
) {
  const term = query.trim().toLowerCase();
  const inCategory = (row: { seller_type: SellerRow['seller_type'] }) =>
    filter === 'all' || row.seller_type === filter;
  return {
    sellers: demoSellers.filter(
      (s) =>
        inCategory(s) &&
        (!saved || saved.includes(s.id)) &&
        (!term || `${s.business_name} ${s.cuisine_tags.join(' ')}`.toLowerCase().includes(term)),
    ),
    items:
      term.length < 2
        ? []
        : demoListings.filter(
            (l) =>
              inCategory(l) &&
              (!saved || saved.includes(l.seller_id)) &&
              `${l.name} ${l.description} ${l.business_name}`.toLowerCase().includes(term),
          ),
  };
}
