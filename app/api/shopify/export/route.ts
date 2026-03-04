import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2025-01';
const VENDOR = 'Bear Silver and Stone';

function buildBodyHtml(item: {
  notes?: string | null;
  metals?: unknown[];
  stones?: unknown[];
}): string {
  const parts: string[] = [];
  if (item.notes?.trim()) {
    parts.push(`<p>${escapeHtml(item.notes.trim())}</p>`);
  }
  if (Array.isArray(item.metals) && item.metals.length > 0) {
    const metalsStr = item.metals
      .map((m: any) => `${m.type || 'Metal'}: ${m.weight || 0} ${m.unit || 'g'}`)
      .join(', ');
    parts.push(`<p><strong>Materials:</strong> ${escapeHtml(metalsStr)}</p>`);
  }
  if (Array.isArray(item.stones) && item.stones.length > 0) {
    const stonesStr = item.stones
      .map((s: any) => s.name || 'Stone')
      .join(', ');
    parts.push(`<p><strong>Stones:</strong> ${escapeHtml(stonesStr)}</p>`);
  }
  return parts.length > 0 ? parts.join('\n') : '<p>Handcrafted jewelry</p>';
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function shopifyGraphql(
  shopDomain: string,
  accessToken: string,
  query: string,
  variables?: Record<string, unknown>
): Promise<{ data?: any; errors?: any[] }> {
  const res = await fetch(
    `https://${shopDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.errors?.[0]?.message || `Shopify API ${res.status}`);
  }
  return json;
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { error: 'Supabase not configured', created: 0, errors: [] },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { accessToken, itemIds, shopDomain: requestedShop } = body;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Missing access token', created: 0, errors: [] },
        { status: 400 }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json(
        { error: userError?.message || 'Invalid session', created: 0, errors: [] },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let connections = await supabase
      .from('shopify_connections')
      .select('shop_domain, access_token')
      .eq('user_id', user.id);

    if (connections.error) {
      return NextResponse.json(
        { error: 'Shopify not connected', created: 0, errors: [] },
        { status: 400 }
      );
    }

    const conns = connections.data || [];
    let conn = conns[0];
    if (requestedShop && conns.length > 1) {
      conn = conns.find((c) => c.shop_domain === requestedShop) || conn;
    }
    if (!conn) {
      return NextResponse.json(
        { error: 'No Shopify store connected. Connect a store first.', created: 0, errors: [] },
        { status: 400 }
      );
    }

    const shopDomain = conn.shop_domain;
    const shopifyToken = conn.access_token;

    const ids = Array.isArray(itemIds)
      ? itemIds.filter((id: unknown) => typeof id === 'string')
      : [];

    if (ids.length === 0) {
      return NextResponse.json(
        { error: 'No items to export', created: 0, errors: [] },
        { status: 400 }
      );
    }

    const { data: items, error: fetchError } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', user.id)
      .in('id', ids);

    if (fetchError || !items?.length) {
      return NextResponse.json(
        { error: 'No matching items found', created: 0, errors: [] },
        { status: 400 }
      );
    }

    const errors: string[] = [];
    let created = 0;

    for (const item of items) {
      try {
        const title = (item.name || 'Untitled Piece').slice(0, 255);
        const bodyHtml = buildBodyHtml(item);
        const productType = item.tag || 'other';
        const retail = Number(item.retail ?? 0);
        const wholesale = Number(item.wholesale ?? 0);
        const sku = `VAULT-${(item.id || '').slice(0, 8)}`;
        const imageUrl = item.image_url?.trim();

        const productInput: Record<string, unknown> = {
          title,
          descriptionHtml: bodyHtml,
          productType,
          vendor: VENDOR,
          status: 'ACTIVE',
        };

        const mediaInput =
          imageUrl && imageUrl.startsWith('http')
            ? [{ mediaContentType: 'IMAGE', originalSource: imageUrl }]
            : [];

        const createMutation = `
          mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
            productCreate(product: $product, media: $media) {
              product {
                id
                variants(first: 1) {
                  nodes {
                    id
                  }
                }
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const createRes = await shopifyGraphql(shopDomain, shopifyToken, createMutation, {
          product: productInput,
          media: mediaInput,
        });

        const payload = createRes.data?.productCreate;
        const userErrors = payload?.userErrors || [];
        if (userErrors.length > 0) {
          errors.push(`${title}: ${userErrors.map((e: any) => e.message).join(', ')}`);
          continue;
        }

        const product = payload?.product;
        if (!product?.id) {
          errors.push(`${title}: No product returned`);
          continue;
        }

        const variantId = product.variants?.nodes?.[0]?.id;
        if (!variantId) {
          created++;
          continue;
        }

        const updateMutation = `
          mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors {
                field
                message
              }
            }
          }
        `;

        const variantInput: Record<string, unknown> = {
          id: variantId,
          price: retail.toFixed(2),
        };
        if (wholesale > 0) {
          variantInput.compareAtPrice = wholesale.toFixed(2);
        }
        variantInput.inventoryItem = { sku };

        const updateRes = await shopifyGraphql(shopDomain, shopifyToken, updateMutation, {
          productId: product.id,
          variants: [variantInput],
        });

        const updateErrors = updateRes.data?.productVariantsBulkUpdate?.userErrors || [];
        if (updateErrors.length > 0) {
          errors.push(`${title}: ${updateErrors.map((e: any) => e.message).join(', ')}`);
        } else {
          created++;
        }
      } catch (e: any) {
        errors.push(`${item.name || 'Item'}: ${e?.message || 'Export failed'}`);
      }
    }

    return NextResponse.json({
      created,
      errors,
    });
  } catch (e: any) {
    console.error('Shopify export error:', e);
    return NextResponse.json(
      {
        error: e?.message || 'Server error',
        created: 0,
        errors: [e?.message || 'Unknown error'],
      },
      { status: 500 }
    );
  }
}
