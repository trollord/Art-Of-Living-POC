# Art of Living - Intuition Process Teacher Supplies (POC)

A demo ordering portal that replaces the Google Form teachers use to order Intuition Process (IP) blindfolds. Teachers pick quantities, see a server-calculated total, enter delivery details and pay through a simulated Google Pay / UPI QR flow, then get a printable receipt.

One NestJS app serves both the JSON API (`/api`) and a single static page (`public/`, plain HTML + CSS + vanilla JS).

## Run

```bash
npm install
npm run start:dev
```

Open http://localhost:3000. Use `PORT=3100 npm run start:dev` if port 3000 is taken.

`npm run build` then `npm run start:prod` runs the compiled build.

## Pricing rules

Rules live as data on each product in `src/products/products.catalog.ts` (`minQty`, `maxQty`, `tiers`). The server computes every price; the page only displays it.

| Product | Price | Rule |
| --- | --- | --- |
| Batman Blindfold | Rs 80 per piece | Minimum order 25 pieces (quantity is 0 or 25+) |
| Demo Blindfold | Rs 800 per piece for 1-10, Rs 730 per piece for 11+ | The lower rate applies to all pieces once quantity is 11 or more |

No shipping or tax lines. Examples: 10 Demo = Rs 8,000; 11 Demo = Rs 8,030; 25 Batman = Rs 2,000; 24 Batman is rejected.

To add a product, append an entry to the catalog with its tiers and minimum, and add an illustration key in `public/app.js`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/products` | Products with tiers and minimums |
| POST | `/api/orders/quote` | `{items:[{productId, quantity}]}` returns per-line unit price, tier, line total, savings and grand total |
| POST | `/api/orders` | Creates an order (`PENDING_PAYMENT`) with id like `AOL-IP-2026-0001`, UPI deep link and QR code |
| POST | `/api/orders/:id/pay` | `{method: "gpay" \| "upi_qr"}` simulates payment and marks the order `PAID` |
| GET | `/api/orders/:id` | Returns the order |

Inputs are validated with class-validator: 10-digit Indian mobile (a `+91` prefix is accepted), email, 6-digit pincode, Indian state or UT, required fields.

## What is simulated

- Payment. No money moves. The UPI link and QR point at the fake VPA `artofliving.demo@upi`; the pay endpoint generates a mock 12-digit UPI reference.
- Storage. Orders live in memory and disappear when the server restarts. There is no database and no login.
- Emails. The confirmation page says a confirmation will be sent, but nothing is sent.

The browser keeps the cart, the current step and the form fields in localStorage, so a refresh does not lose the cart.
