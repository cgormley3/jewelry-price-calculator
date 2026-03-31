import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  buildBodyHtml,
  SHOPIFY_PRODUCT_VENDOR,
  vaultExportItemTitle,
} from '@/lib/shopifyProductExport';
import {
  formatPriceForExport,
  parsePriceRoundingFromExportOptions,
  type PriceRoundingOption,
} from '@/lib/priceRounding';

export const dynamic = 'force-dynamic';

const SHOPIFY_API_VERSION = '2025-01';

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
    const { accessToken, itemIds, shopDomain: requestedShop, exportOptions: rawExportOptions, itemPrices: rawItemPrices } = body;
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

    const opts: {
      includeDescription: boolean;
      includeImage: boolean;
      includeRetail: boolean;
      includeWholesale: boolean;
      priceSource: 'live' | 'saved';
      priceRounding: PriceRoundingOption;
    } =
      rawExportOptions && typeof rawExportOptions === 'object'
        ? {
            includeDescription: !!rawExportOptions.includeDescription,
            includeImage: !!rawExportOptions.includeImage,
            includeRetail: rawExportOptions.includeRetail !== false,
            includeWholesale: rawExportOptions.includeWholesale !== false,
            priceSource: rawExportOptions.priceSource === 'live' ? 'live' : 'saved',
            priceRounding: parsePriceRoundingFromExportOptions(
              (rawExportOptions as { priceRounding?: unknown }).priceRounding
            ),
          }
        : {
            includeDescription: true,
            includeImage: true,
            includeRetail: true,
            includeWholesale: true,
            priceSource: 'saved' as const,
            priceRounding: 1,
          };
    const itemPricesMap = rawItemPrices && typeof rawItemPrices === 'object' ? rawItemPrices : {};

    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    const lookupBySkuQuery = `
      query LookupBySku($query: String!) {
        productVariants(first: 1, query: $query) {
          edges {
            node {
              id
              product { id }
            }
          }
        }
      }
    `;

    for (const item of items) {
      try {
        const title = vaultExportItemTitle(item.name);
        const bodyHtml = buildBodyHtml(item);
        const productType = item.tag || 'other';
        const skuPart = (item.id || '').slice(0, 8);
        const sku = `VAULT-${skuPart}`;
        const imageUrl = item.image_url?.trim();

        const prices = itemPricesMap[item.id];
        const retail = opts.priceSource === 'live' && prices
          ? Number(prices.retail ?? 0)
          : Number(item.retail ?? 0);
        const wholesale = opts.priceSource === 'live' && prices
          ? Number(prices.wholesale ?? 0)
          : Number(item.wholesale ?? 0);

        const lookupRes = await shopifyGraphql(shopDomain, shopifyToken, lookupBySkuQuery, {
          query: `sku:'${sku}'`,
        });
        const edges = lookupRes.data?.productVariants?.edges || [];
        const existingVariant = edges[0]?.node;
        const existingProductId = existingVariant?.product?.id;
        const existingVariantId = existingVariant?.id;

        if (existingProductId && existingVariantId) {
          const mediaInput = opts.includeImage && imageUrl?.startsWith('http')
            ? [{ mediaContentType: 'IMAGE', originalSource: imageUrl }]
            : [];

          const productInput: Record<string, unknown> = { id: existingProductId };
          if (opts.includeDescription) {
            productInput.title = title;
            productInput.descriptionHtml = bodyHtml;
            productInput.productType = productType;
          }

          const hasProductUpdates = Object.keys(productInput).length > 1 || mediaInput.length > 0;
          if (hasProductUpdates) {
            const productUpdateRes = await shopifyGraphql(shopDomain, shopifyToken, `
              mutation UpdateProduct($product: ProductUpdateInput!, $media: [CreateMediaInput!]) {
                productUpdate(product: $product, media: $media) {
                  product { id }
                  userErrors { field message }
                }
              }
            `, { product: productInput, media: mediaInput });

            const puErrors = productUpdateRes.data?.productUpdate?.userErrors || [];
            if (puErrors.length > 0) {
              errors.push(`${title}: ${puErrors.map((e: any) => e.message).join(', ')}`);
              continue;
            }
          }

          const variantInput: Record<string, unknown> = { id: existingVariantId };
          if (opts.includeRetail)
            variantInput.price = formatPriceForExport(retail, opts.priceRounding);
          if (opts.includeWholesale && wholesale > 0)
            variantInput.compareAtPrice = formatPriceForExport(wholesale, opts.priceRounding);
          variantInput.inventoryItem = { sku };

          const variantUpdateRes = await shopifyGraphql(shopDomain, shopifyToken, `
            mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
              productVariantsBulkUpdate(productId: $productId, variants: $variants) {
                userErrors { field message }
              }
            }
          `, { productId: existingProductId, variants: [variantInput] });

          const vuErrors = variantUpdateRes.data?.productVariantsBulkUpdate?.userErrors || [];
          if (vuErrors.length > 0) {
            errors.push(`${title}: ${vuErrors.map((e: any) => e.message).join(', ')}`);
          } else {
            updated++;
          }
          continue;
        }

        const productInput: Record<string, unknown> = {
          title,
          productType,
          vendor: SHOPIFY_PRODUCT_VENDOR,
          status: 'ACTIVE',
          descriptionHtml: opts.includeDescription ? bodyHtml : '<p>Handcrafted jewelry</p>',
        };

        const mediaInput = opts.includeImage && imageUrl?.startsWith('http')
          ? [{ mediaContentType: 'IMAGE', originalSource: imageUrl }]
          : [];

        const createRes = await shopifyGraphql(shopDomain, shopifyToken, `
          mutation CreateProduct($product: ProductCreateInput!, $media: [CreateMediaInput!]) {
            productCreate(product: $product, media: $media) {
              product {
                id
                variants(first: 1) { nodes { id } }
              }
              userErrors { field message }
            }
          }
        `, { product: productInput, media: mediaInput });

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

        const variantInput: Record<string, unknown> = { id: variantId, inventoryItem: { sku } };
        if (opts.includeRetail)
          variantInput.price = formatPriceForExport(retail, opts.priceRounding);
        if (opts.includeWholesale && wholesale > 0)
          variantInput.compareAtPrice = formatPriceForExport(wholesale, opts.priceRounding);

        const updateRes = await shopifyGraphql(shopDomain, shopifyToken, `
          mutation UpdateVariants($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              userErrors { field message }
            }
          }
        `, { productId: product.id, variants: [variantInput] });

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
      updated,
      errors,
    });
  } catch (e: any) {
    console.error('Shopify export error:', e);
    return NextResponse.json(
      {
        error: e?.message || 'Server error',
        created: 0,
        updated: 0,
        errors: [e?.message || 'Unknown error'],
      },
      { status: 500 }
    );
  }
}
