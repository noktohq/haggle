// Shopify Admin GraphQL client. Product prices are ALWAYS fetched here —
// client-supplied prices are never trusted. With MOCK_PRODUCTS=1 the module
// serves a fixture catalog instead, so tests and judges can run without tokens.

const MOCK_CATALOG = [
  { id: 'gid://shopify/Product/1', handle: 'demo-ecoride-tripper', title: 'Ecoride Tripper Gen4 (demo)', price: 36995 },
  { id: 'gid://shopify/Product/2', handle: 'demo-ecoride-flexer', title: 'Ecoride Flexer Gen3 (demo)', price: 21995 },
];

function cfg() {
  return {
    mock: process.env.MOCK_PRODUCTS === '1',
    domain: process.env.SHOPIFY_STORE_DOMAIN,
    token: process.env.SHOPIFY_ADMIN_TOKEN,
    apiVersion: process.env.SHOPIFY_API_VERSION || '2026-07',
  };
}

async function adminGraphql(query, variables) {
  const { domain, token, apiVersion } = cfg();
  if (!domain || !token) throw new Error('Shopify credentials not configured');
  const res = await fetch(`https://${domain}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) throw new Error(`Shopify HTTP ${res.status}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Shopify: ${body.errors[0].message}`);
  return body.data;
}

export async function fetchProductByHandle(handle) {
  if (cfg().mock) {
    const p = MOCK_CATALOG.find((p) => p.handle === handle);
    if (!p) throw new Error('product not found');
    return { ...p };
  }
  const data = await adminGraphql(
    `query ($q: String!) {
       products(first: 1, query: $q) {
         edges { node { id handle title priceRangeV2 { minVariantPrice { amount } } } }
       }
     }`,
    { q: `handle:${JSON.stringify(handle)}` }
  );
  const node = data.products.edges[0]?.node;
  if (!node || node.handle !== handle) throw new Error('product not found');
  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    price: Number(node.priceRangeV2.minVariantPrice.amount),
  };
}

/** Create a single-use discount code worth (listPrice - dealPrice) NOK, scoped to the product. */
export async function createDealDiscount(session) {
  const amountOff = session.listPrice - session.dealPrice;
  const code = 'HAGGLE-' + Math.random().toString(36).slice(2, 8).toUpperCase();
  if (cfg().mock) return { code, amountOff };
  const now = new Date();
  const ends = new Date(now.getTime() + 48 * 3600 * 1000);
  const data = await adminGraphql(
    `mutation ($d: DiscountCodeBasicInput!) {
       discountCodeBasicCreate(basicCodeDiscount: $d) {
         codeDiscountNode { id }
         userErrors { field message }
       }
     }`,
    {
      d: {
        title: `Haggle deal: ${session.productTitle} @ ${session.dealPrice} NOK`,
        code,
        startsAt: now.toISOString(),
        endsAt: ends.toISOString(),
        usageLimit: 1,
        appliesOncePerCustomer: true,
        customerSelection: { all: true },
        customerGets: {
          value: { discountAmount: { amount: amountOff, appliesOnEachItem: false } },
          items: { products: { productsToAdd: [session.productId] } },
        },
      },
    }
  );
  const errs = data.discountCodeBasicCreate.userErrors;
  if (errs?.length) throw new Error(`Shopify discount: ${errs[0].message}`);
  return { code, amountOff };
}

export { MOCK_CATALOG };
