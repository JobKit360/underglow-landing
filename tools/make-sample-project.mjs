// Writes a small made-up web shop ("Storefront") to a folder. The landing-page demo scans it with the REAL Code Map and
// Workflow scanners to record sample data, so nothing in the demo comes from a real project.
//   node website/tools/make-sample-project.mjs <empty folder>
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] || '');
if (!process.argv[2]) { console.error('usage: node make-sample-project.mjs <empty folder>'); process.exit(2); }

// file -> [imports, exported function names]
const F = {
  'src/app.js': [['./router.js', './store.js', './ui/header.js', './ui/footer.js', './ui/toast.js', './config.js'], ['start', 'render']],
  'src/router.js': [['./auth/session.js', './cart/cart.js', './checkout/checkout.js', './products/catalog.js'], ['route', 'navigate']],
  'src/store.js': [['./config.js', './utils/debounce.js'], ['getState', 'setState', 'subscribe']],
  'src/config.js': [[], ['config']],
  'src/auth/login.js': [['./session.js', './password.js', '../api/users.js', '../ui/toast.js'], ['login', 'logout']],
  'src/auth/session.js': [['../store.js', '../utils/dates.js'], ['currentUser', 'saveSession', 'clearSession']],
  'src/auth/password.js': [['../utils/validate.js'], ['checkStrength', 'hashHint']],
  'src/cart/cart.js': [['./totals.js', './storage.js', './coupons.js', '../store.js', '../ui/toast.js'], ['addItem', 'removeItem', 'clearCart']],
  'src/cart/totals.js': [['../utils/money.js', './coupons.js'], ['subtotal', 'total']],
  'src/cart/storage.js': [['../store.js'], ['loadCart', 'saveCart']],
  'src/cart/coupons.js': [['../api/client.js', '../utils/validate.js'], ['applyCoupon', 'discountFor']],
  'src/checkout/checkout.js': [['./payment.js', './shipping.js', './receipt.js', '../cart/cart.js', '../cart/totals.js', '../api/orders.js'], ['startCheckout', 'placeOrder']],
  'src/checkout/payment.js': [['../api/client.js', '../utils/validate.js', '../ui/modal.js'], ['chargeCard', 'validateCard']],
  'src/checkout/shipping.js': [['../utils/validate.js', '../utils/money.js'], ['shippingOptions', 'estimateDays']],
  'src/checkout/receipt.js': [['../email/send.js', '../email/templates.js', '../utils/format.js', '../utils/dates.js'], ['sendReceipt', 'receiptText']],
  'src/products/catalog.js': [['../api/products.js', './search.js', './images.js', '../ui/button.js'], ['listProducts', 'productCard']],
  'src/products/search.js': [['../utils/debounce.js', '../api/products.js'], ['searchProducts', 'suggest']],
  'src/products/images.js': [['../utils/format.js'], ['imageUrl', 'lazyImage']],
  'src/products/reviews.js': [['../api/products.js', '../utils/dates.js', '../ui/button.js'], ['loadReviews', 'addReview']],
  'src/api/client.js': [['../config.js', '../auth/session.js'], ['request', 'get', 'post']],
  'src/api/orders.js': [['./client.js'], ['createOrder', 'listOrders']],
  'src/api/products.js': [['./client.js'], ['fetchProducts', 'fetchProduct']],
  'src/api/users.js': [['./client.js'], ['fetchUser', 'updateUser']],
  'src/ui/header.js': [['./button.js', './theme.js', '../cart/cart.js', '../auth/session.js'], ['renderHeader']],
  'src/ui/footer.js': [['./theme.js'], ['renderFooter']],
  'src/ui/button.js': [['./theme.js'], ['button']],
  'src/ui/modal.js': [['./button.js', './theme.js'], ['openModal', 'closeModal']],
  'src/ui/toast.js': [['./theme.js'], ['toast']],
  'src/ui/theme.js': [['../config.js'], ['theme', 'applyTheme']],
  'src/utils/format.js': [[], ['formatName', 'slugify']],
  'src/utils/money.js': [['./format.js'], ['formatMoney', 'toCents']],
  'src/utils/dates.js': [[], ['formatDate', 'daysFromNow']],
  'src/utils/validate.js': [[], ['isEmail', 'isPostcode', 'isCardNumber']],
  'src/utils/debounce.js': [[], ['debounce', 'throttle']],
  'src/email/send.js': [['./templates.js', '../api/client.js'], ['sendEmail']],
  'src/email/templates.js': [['../utils/format.js', '../utils/money.js'], ['welcomeEmail', 'receiptEmail']],
  'test/cart.test.js': [['../src/cart/cart.js', '../src/cart/totals.js'], ['testCart']],
  'test/checkout.test.js': [['../src/checkout/checkout.js', '../src/checkout/payment.js'], ['testCheckout']],
  'test/auth.test.js': [['../src/auth/login.js', '../src/auth/password.js'], ['testAuth']],
  'test/money.test.js': [['../src/utils/money.js'], ['testMoney']],
  'test/search.test.js': [['../src/products/search.js'], ['testSearch']],
};

const camel = (s) => s.replace(/[^a-z0-9]+(.)/gi, (_, c) => c.toUpperCase());
for (const [file, [imports, fns]] of Object.entries(F)) {
  const lines = [];
  imports.forEach((imp, i) => lines.push(`import * as dep${i}_${camel(path.basename(imp, '.js'))} from '${imp}';`));
  lines.push('');
  fns.forEach((fn, i) => {
    lines.push(`export function ${fn}(input) {`);
    lines.push(`  // ${fn}: sample code for the demo`);
    imports.slice(0, 2).forEach((imp, j) => lines.push(`  const part${j} = dep${j}_${camel(path.basename(imp, '.js'))};`));
    lines.push(`  return { ok: true, input${imports.length ? ', part0' : ''} };`);
    lines.push('}');
    if (i < fns.length - 1) lines.push('');
  });
  const p = path.join(root, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, lines.join('\n') + '\n');
}

const W = (f, t) => { const p = path.join(root, f); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, t); };
W('package.json', JSON.stringify({ name: 'storefront', version: '1.0.0', type: 'module', scripts: { dev: 'node src/app.js', build: 'node build.js', test: 'node --test test/' } }, null, 2) + '\n');
W('README.md', `# Storefront

A small online shop used as sample data.

## How changes go out

1. Agents make a change in their own copy of the project.
2. The automatic checks run on every change.
3. A test build is made on this computer for you to try.
4. When you are happy, the change goes to a staging site for testers.
5. After your OK, it goes live for all customers.
`);
W('.github/workflows/ci.yml', `name: Checks
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm test
  build:
    runs-on: ubuntu-latest
    needs: test
    steps:
      - uses: actions/checkout@v4
      - run: npm run build
`);
W('render.yaml', `services:
  - type: web
    name: storefront
    env: node
    buildCommand: npm run build
    startCommand: npm start
`);
console.log('wrote', Object.keys(F).length + 4, 'files to', root);
