---
sidebar_position: 10
---

# IEcommercePort

E-commerce platform interactions for Shopify, WooCommerce, Wix, and Webflow.

## Interface

```typescript
type EcommercePlatform = 'shopify' | 'woocommerce' | 'wix' | 'webflow' | 'unknown';

interface IEcommercePort {
  // Platform detection
  detectPlatform(): EcommercePlatform;
  isEcommerce(): boolean;
  isAdminPage(): boolean;

  // Product browsing
  getProductInfo(): Promise<ProductInfo | null>;
  addToCart(quantity?: number, variant?: string): Promise<void>;
  selectVariant(variant: string): Promise<void>;
  setQuantity(qty: number): Promise<void>;

  // Cart
  viewCart(): Promise<void>;
  getCartItems(): Promise<CartItem[]>;
  removeFromCart(itemName: string): Promise<void>;
  updateCartQuantity(itemName: string, quantity: number): Promise<void>;
  goToCheckout(): Promise<void>;

  // Search & navigation
  searchProducts(query: string): Promise<void>;
  filterByCategory(category: string): Promise<void>;
  sortProducts(by: 'price-asc' | 'price-desc' | 'newest' | 'popular'): Promise<void>;

  // Order management
  getOrders(): Promise<OrderSummary[]>;
  getOrderDetails(orderId: string): Promise<OrderDetails | null>;
  trackOrder(orderId: string): Promise<OrderTracking | null>;

  // Inventory (admin)
  getInventoryStatus(): Promise<InventoryItem[]>;
  updateInventory(productId: string, quantity: number): Promise<void>;

  // Product CRUD (admin)
  createProduct(data: ProductCreateData): Promise<void>;
  updateProduct(productId: string, data: Partial<ProductCreateData>): Promise<void>;
  deleteProduct(productId: string): Promise<void>;
}
```

## Supported Platforms

| Platform | Detection | Browsing | Cart | Orders | Admin |
|----------|-----------|----------|------|--------|-------|
| Shopify | ✅ `window.Shopify` | ✅ | ✅ | ✅ | ✅ |
| WooCommerce | ✅ `.woocommerce` class | ✅ | ✅ | ✅ | ✅ |
| Wix | ✅ `wixBiSession` | ✅ | ✅ | ✅ | ✅ |
| Webflow | ✅ `data-wf-site` | ✅ | ✅ | ✅ | ✅ |

## Key Types

```typescript
interface OrderSummary {
  orderId: string;
  date: string;
  total: string;
  status: string;
}

interface OrderDetails extends OrderSummary {
  items: CartItem[];
  shippingAddress?: string;
  trackingNumber?: string;
}

interface OrderTracking {
  orderId: string;
  carrier?: string;
  trackingNumber?: string;
  status: string;
  estimatedDelivery?: string;
  events: TrackingEvent[];
}

interface TrackingEvent {
  date: string;
  description: string;
  location?: string;
}

interface InventoryItem {
  productId: string;
  productName: string;
  sku?: string;
  quantity: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
}

interface ProductCreateData {
  name: string;
  description?: string;
  price: number;
  currency?: string;
  sku?: string;
  quantity?: number;
  images?: string[];
  variants?: { name: string; options: string[] }[];
  category?: string;
}
```

## Order Management

- **`getOrders()`** — Returns an array of `OrderSummary` for the logged-in customer's recent orders.
- **`getOrderDetails(orderId)`** — Returns full `OrderDetails` including line items, and optionally shipping address and tracking number.
- **`trackOrder(orderId)`** — Returns `OrderTracking` with optional carrier info, estimated delivery, and a timeline of `TrackingEvent` entries.

## Inventory (Admin)

Requires `isAdminPage() === true`. Methods throw if called outside an admin context.

- **`getInventoryStatus()`** — Returns all `InventoryItem` entries with a `status` of `'in_stock'`, `'low_stock'`, or `'out_of_stock'`.
- **`updateInventory(productId, quantity)`** — Sets the stock quantity for a product. Pass `quantity = 0` to mark as out-of-stock.

## Product CRUD (Admin)

Requires `isAdminPage() === true`. The adapter verifies page context before executing mutations.

- **`createProduct(data)`** — Creates a new product from `ProductCreateData`. Navigates to the platform's product creation form and fills fields via DOM selectors.
- **`updateProduct(productId, data)`** — Partially updates an existing product. Accepts `Partial<ProductCreateData>`.
- **`deleteProduct(productId)`** — Deletes a product. Triggers platform-specific confirmation dialogs.

## Admin Detection

**`isAdminPage()`** detects admin URLs per platform:

| Platform | Admin URL Patterns |
|----------|-------------------|
| Shopify | `/admin`, `myshopify.com/admin` |
| WooCommerce | `/wp-admin`, `/wp-admin/…wc` |
| Wix | `/dashboard`, `manage.wix.com` |
| Webflow | `/designer`, `webflow.com/design/` |

## Adapter

`EcommerceAdapter` — DOM-based with platform-specific selector chains and fallbacks.
