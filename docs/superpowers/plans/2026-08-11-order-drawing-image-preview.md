# Order Drawing Image Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open uploaded order images in an authenticated modal preview and let users move through every previewable image on that order.

**Architecture:** Add a shared pure classifier that maps approved raster extensions to fixed MIME types, extend the protected drawing route with an inline preview mode, and move drawing-tree interaction into a focused client gallery. The order detail page remains a server component and passes serialized drawing metadata to the gallery.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind CSS, lucide-react, Vitest, Testing Library, Playwright.

## Global Constraints

- Preview only JPG/JPEG, PNG, WebP, and GIF; do not preview PDF, CAD, archives, SVG, or unknown files.
- Keep ordinary file, folder ZIP, and all-drawings ZIP downloads unchanged.
- Authenticate every preview and scope the file lookup by the logged-in user’s `workspaceId`.
- Use fixed safe MIME mappings and `X-Content-Type-Options: nosniff` for inline responses.
- Switch across all previewable images on the current order, sorted by `relativePath`.
- Disable previous on the first image and next on the last image; do not wrap.
- Support `ArrowLeft`, `ArrowRight`, `Escape`, focus restoration, and background scroll locking.
- Do not add a third-party gallery or image-preview dependency.
- Follow TDD: observe focused tests fail before implementing each behavior.

---

## File Structure

- Create `src/domain/order-drawings.ts` for browser-safe preview classification shared by route and client component.
- Modify `src/app/api/order-drawings/[id]/route.ts` to support `?preview=1` without changing default downloads.
- Create `src/app/(dashboard)/orders/[id]/order-drawing-gallery.tsx` for the tree, modal, controls, keyboard behavior, and load errors.
- Modify `src/app/(dashboard)/orders/[id]/page.tsx` to delegate drawing rendering to the gallery.
- Create `tests/domain/order-drawings.test.ts` and `tests/components/order-drawing-gallery.test.tsx`.
- Modify route, order-page, and end-to-end tests.
- Modify `docs/project-current-state.md` after browser verification.

### Task 1: Safe Image Classification and Protected Preview Route

**Files:**
- Create: `src/domain/order-drawings.ts`
- Modify: `src/app/api/order-drawings/[id]/route.ts`
- Create: `tests/domain/order-drawings.test.ts`
- Modify: `tests/auth/order-drawings-route.test.ts`

**Interfaces:**
- Produces:
  - `getOrderDrawingPreviewMimeType(originalName: string, storedMimeType: string | null): string | null`.
  - `GET /api/order-drawings/[id]?preview=1` returning inline bytes only for approved images.
- Consumed by: gallery classification in Task 2.

- [ ] **Step 1: Write the failing classifier tests**

Create:

```ts
import { describe, expect, it } from "vitest";
import { getOrderDrawingPreviewMimeType } from "@/domain/order-drawings";

describe("order drawing image classification", () => {
  it.each([
    ["part.JPG", "image/jpeg", "image/jpeg"],
    ["part.jpeg", null, "image/jpeg"],
    ["part.png", "image/png", "image/png"],
    ["part.webp", "image/webp", "image/webp"],
    ["part.gif", "image/gif", "image/gif"],
  ])("allows safe raster image %s", (name, stored, expected) => {
    expect(getOrderDrawingPreviewMimeType(name, stored)).toBe(expected);
  });

  it.each([
    ["drawing.svg", "image/svg+xml"],
    ["drawing.pdf", "application/pdf"],
    ["drawing.step", "model/step"],
    ["fake.png", "text/html"],
    ["no-extension", "image/png"],
  ])("rejects non-previewable or mismatched file %s", (name, stored) => {
    expect(getOrderDrawingPreviewMimeType(name, stored)).toBeNull();
  });
});
```

- [ ] **Step 2: Run classifier tests and verify red**

Run:

```bash
npm run test:run -- tests/domain/order-drawings.test.ts
```

Expected: FAIL because `@/domain/order-drawings` does not exist.

- [ ] **Step 3: Implement the pure classifier**

Create a fixed extension map and reject non-empty conflicting stored MIME:

```ts
const previewMimeTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export function getOrderDrawingPreviewMimeType(
  originalName: string,
  storedMimeType: string | null,
) {
  const dotIndex = originalName.lastIndexOf(".");
  const extension =
    dotIndex >= 0 ? originalName.slice(dotIndex).toLowerCase() : "";
  const expected = previewMimeTypes[extension];
  if (!expected) return null;

  const normalizedStored = storedMimeType?.split(";")[0].trim().toLowerCase();
  if (normalizedStored && normalizedStored !== expected) return null;
  return expected;
}
```

- [ ] **Step 4: Run classifier tests and verify green**

Run:

```bash
npm run test:run -- tests/domain/order-drawings.test.ts
```

Expected: all classifier cases pass.

- [ ] **Step 5: Add failing preview-route tests**

Extend the authenticated route test with a PNG drawing and request:

```ts
const response = await GET(
  new Request("http://factory.test/api/order-drawings/drawing-1?preview=1"),
  { params: Promise.resolve({ id: "drawing-1" }) },
);

expect(response.status).toBe(200);
expect(response.headers.get("content-type")).toBe("image/png");
expect(response.headers.get("content-disposition")).toContain("inline");
expect(response.headers.get("x-content-type-options")).toBe("nosniff");
expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
```

Add a STEP drawing request with `?preview=1` and expect status 415. Keep the existing default request assertion and make it explicitly expect `attachment`.

- [ ] **Step 6: Run route tests and verify red**

Run:

```bash
npm run test:run -- tests/auth/order-drawings-route.test.ts
```

Expected: FAIL because the route always emits attachment responses and does not reject inline STEP files.

- [ ] **Step 7: Implement preview mode without changing downloads**

Read the query from the existing `Request` argument:

```ts
const previewRequested =
  new URL(request.url).searchParams.get("preview") === "1";
const previewMimeType = getOrderDrawingPreviewMimeType(
  drawing.originalName,
  drawing.mimeType,
);
if (previewRequested && !previewMimeType) {
  return new Response("Unsupported Media Type", { status: 415 });
}
```

Make `contentDisposition` accept `"inline" | "attachment"`. For preview use the fixed `previewMimeType`, inline disposition, `cache-control: private, max-age=3600`, and `x-content-type-options: nosniff`. For default requests keep the stored MIME fallback, attachment disposition, content length, and existing 401/404 behavior.

- [ ] **Step 8: Run focused route/domain tests**

Run:

```bash
npm run test:run -- tests/domain/order-drawings.test.ts tests/auth/order-drawings-route.test.ts
```

Expected: both suites pass.

- [ ] **Step 9: Commit the route deliverable**

```bash
git add src/domain/order-drawings.ts 'src/app/api/order-drawings/[id]/route.ts' tests/domain/order-drawings.test.ts tests/auth/order-drawings-route.test.ts
git commit -m "feat: add protected drawing image responses"
```

### Task 2: Drawing Gallery and Accessible Modal

**Files:**
- Create: `src/app/(dashboard)/orders/[id]/order-drawing-gallery.tsx`
- Create: `tests/components/order-drawing-gallery.test.tsx`

**Interfaces:**
- Consumes: `getOrderDrawingPreviewMimeType` from Task 1 and existing archive/file endpoints.
- Produces:

```ts
export type DrawingGalleryItem = {
  id: string;
  originalName: string;
  relativePath: string;
  sizeBytes: number;
  mimeType: string | null;
};

export function OrderDrawingGallery(props: {
  orderId: string;
  drawings: DrawingGalleryItem[];
}): React.ReactElement;
```

- [ ] **Step 1: Write the failing modal navigation test**

Create a fixture with `a.jpg`, `folder/b.png`, and `folder/model.step`. Render the gallery, click `预览 b.png`, and assert:

```tsx
expect(screen.getByRole("dialog", { name: "预览 b.png" })).toBeInTheDocument();
expect(screen.getByText("第 2 张 / 共 2 张")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "下一张" })).toBeDisabled();

fireEvent.click(screen.getByRole("button", { name: "上一张" }));
expect(screen.getByRole("img", { name: "a.jpg" })).toBeInTheDocument();
expect(screen.getByText("第 1 张 / 共 2 张")).toBeInTheDocument();
expect(screen.getByRole("button", { name: "上一张" })).toBeDisabled();
```

Assert the STEP file remains a link to `/api/order-drawings/step-1` and image rows contain separate `下载 a.jpg`/`下载 b.png` links.

- [ ] **Step 2: Add failing keyboard, error, and focus tests**

Add tests that:

- press `ArrowRight` and `ArrowLeft` to change images;
- press `Escape` to close the dialog;
- click the backdrop to close;
- fire an image `error` event and expect `图片加载失败` plus the current download link;
- verify `document.body.style.overflow` is `hidden` while open and restored on close;
- verify the clicked preview button regains focus after close.

- [ ] **Step 3: Run the gallery tests and verify red**

Run:

```bash
npm run test:run -- tests/components/order-drawing-gallery.test.tsx
```

Expected: FAIL because the gallery component does not exist.

- [ ] **Step 4: Implement tree construction and stable preview ordering**

Move the existing `Drawing`/`DrawingFolder` types, `buildDrawingTree`, `archiveHref`, `sortFolders`, `sortFiles`, and file-size formatting into the client component. Derive previewable images with:

```ts
const previewableDrawings = [...drawings]
  .filter((drawing) =>
    Boolean(
      getOrderDrawingPreviewMimeType(
        drawing.originalName,
        drawing.mimeType,
      ),
    ),
  )
  .sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath, "zh-CN"),
  );
```

Image file rows use a button named `预览 <filename>`. The button stores itself as the return-focus element and opens the matching index. A separate download link uses the default attachment URL. Non-images retain the default file link. Folder links retain `/api/order-drawings/archive`.

- [ ] **Step 5: Implement modal state and controls**

Use these state/ref boundaries:

```ts
const [activeIndex, setActiveIndex] = useState<number | null>(null);
const [imageFailed, setImageFailed] = useState(false);
const closeButtonRef = useRef<HTMLButtonElement>(null);
const returnFocusRef = useRef<HTMLButtonElement | null>(null);

const activeDrawing =
  activeIndex === null ? null : previewableDrawings[activeIndex];
```

Render a fixed full-screen element with `role="dialog"`, `aria-modal="true"`, and `aria-label={`预览 ${activeDrawing.originalName}`}`. Use `next/image` with `fill`, `unoptimized`, `sizes="100vw"`, `object-contain`, source `/api/order-drawings/${id}?preview=1`, and `onError={() => setImageFailed(true)}`.

Previous/next handlers guard the boundaries and clear `imageFailed` before changing index. The counter is `第 ${activeIndex + 1} 张 / 共 ${previewableDrawings.length} 张`.

- [ ] **Step 6: Implement keyboard, scroll, backdrop, and focus lifecycle**

In an effect that runs only while a drawing is active:

```ts
const previousOverflow = document.body.style.overflow;
document.body.style.overflow = "hidden";
closeButtonRef.current?.focus();

function onKeyDown(event: KeyboardEvent) {
  if (event.key === "Escape") closePreview();
  if (event.key === "ArrowLeft") showPrevious();
  if (event.key === "ArrowRight") showNext();
}

window.addEventListener("keydown", onKeyDown);
return () => {
  window.removeEventListener("keydown", onKeyDown);
  document.body.style.overflow = previousOverflow;
};
```

`closePreview` sets the index to null and schedules `returnFocusRef.current?.focus()` after React removes the modal. The backdrop mouse handler closes only when `event.target === event.currentTarget`, so clicks on the image or controls do not close it.

- [ ] **Step 7: Run gallery tests and verify green**

Run:

```bash
npm run test:run -- tests/components/order-drawing-gallery.test.tsx
```

Expected: navigation, keyboard, error, scroll, link, and focus tests all pass.

- [ ] **Step 8: Commit the gallery deliverable**

```bash
git add 'src/app/(dashboard)/orders/[id]/order-drawing-gallery.tsx' tests/components/order-drawing-gallery.test.tsx
git commit -m "feat: add order drawing image gallery"
```

### Task 3: Integrate Gallery into Order Detail

**Files:**
- Modify: `src/app/(dashboard)/orders/[id]/page.tsx`
- Modify: `tests/pages/orders-page.test.tsx`

**Interfaces:**
- Consumes: `OrderDrawingGallery` and `DrawingGalleryItem` from Task 2.
- Produces: order detail with unchanged empty/upload behavior and gallery rendering for saved drawings.

- [ ] **Step 1: Expand the order-detail fixture and write failing assertions**

Keep the existing STEP drawing and add:

```ts
{
  id: "drawing-jpg",
  originalName: "front.jpg",
  relativePath: "images/front.jpg",
  storedPath: "workspace-1/order-1/images/front.jpg",
  sizeBytes: 2048,
  mimeType: "image/jpeg",
  createdAt: new Date("2026-05-10T01:01:00.000Z"),
},
{
  id: "drawing-png",
  originalName: "side.png",
  relativePath: "images/side.png",
  storedPath: "workspace-1/order-1/images/side.png",
  sizeBytes: 3072,
  mimeType: "image/png",
  createdAt: new Date("2026-05-10T01:02:00.000Z"),
},
```

Assert `预览 front.jpg` and `预览 side.png` buttons exist, clicking one opens the gallery dialog, and `fixture.step` remains the existing attachment link.

- [ ] **Step 2: Run the order page test and verify red**

Run:

```bash
npm run test:run -- tests/pages/orders-page.test.tsx -t "drawing"
```

Expected: FAIL because image files still render as direct download links.

- [ ] **Step 3: Replace page-local drawing rendering**

Remove the page-local drawing types and helpers:

- `Drawing`
- `DrawingFolder`
- `formatFileSize`
- `createFolder`
- `buildDrawingTree`
- `archiveHref`
- `sortFolders`
- `sortFiles`
- `DrawingTree`
- the `drawingTree` variable

Remove drawing-only lucide imports. Import `OrderDrawingGallery` and replace the non-empty block with:

```tsx
<OrderDrawingGallery orderId={order.id} drawings={order.drawings} />
```

Keep the heading, file count, zero-file message, manager-only overwrite text, and `OrderDrawingUpload` exactly where they are.

- [ ] **Step 4: Run order and gallery tests**

Run:

```bash
npm run test:run -- tests/pages/orders-page.test.tsx tests/components/order-drawing-gallery.test.tsx
```

Expected: all order-detail and gallery tests pass.

- [ ] **Step 5: Commit the integration deliverable**

```bash
git add 'src/app/(dashboard)/orders/[id]/page.tsx' tests/pages/orders-page.test.tsx
git commit -m "feat: preview images from order detail"
```

### Task 4: Browser Coverage, Documentation, and Full Verification

**Files:**
- Modify: `tests/e2e/factory-flow.spec.ts`
- Modify: `docs/project-current-state.md`

**Interfaces:**
- Consumes: protected preview route and integrated gallery from Tasks 1-3.
- Produces: real-browser coverage for upload, decode, modal navigation, and documentation.

- [ ] **Step 1: Add a valid in-memory PNG fixture**

At the E2E test module level define:

```ts
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
```

- [ ] **Step 2: Write the failing image-preview E2E scenario**

Log in, create a uniquely named order, enter its detail page, and upload:

```ts
await page.locator('input[name="drawings"]').setInputFiles([
  { name: "front.png", mimeType: "image/png", buffer: onePixelPng },
  { name: "side.png", mimeType: "image/png", buffer: onePixelPng },
]);
```

Click `预览 side.png` and assert `第 2 张 / 共 2 张`. Click `上一张` and assert the image accessible name is `front.png` and the counter is `第 1 张 / 共 2 张`. Press `Escape` and assert the dialog is hidden. Assert `下载 front.png` points to the attachment URL without `preview=1`.

- [ ] **Step 3: Run the focused browser test**

Run:

```bash
npm run test:e2e -- --grep "previews and switches uploaded order images" --project=chromium-desktop
```

Expected before implementation: FAIL because no preview button/modal exists. Expected after Tasks 1-3: PASS with both PNG responses decoded.

- [ ] **Step 4: Update current-state documentation**

Extend “图纸文件” in `docs/project-current-state.md` with:

```md
- JPG/JPEG、PNG、WebP 和 GIF 图片可在订单详情页弹窗预览。
- 同一订单有多张图片时，支持按钮和键盘左右切换；非图片继续下载。
```

- [ ] **Step 5: Run fresh full verification**

Run:

```bash
npm run test:run -- tests/domain/order-drawings.test.ts tests/auth/order-drawings-route.test.ts tests/components/order-drawing-gallery.test.tsx tests/pages/orders-page.test.tsx
npm run lint
DATABASE_URL="postgresql://factory:factory_password@localhost:5432/factory?schema=public" npm run build
npm run test:e2e
docker compose config
git diff --check
```

Expected: all focused and browser tests pass, lint/build exit 0, Compose validates, and Git reports no whitespace errors.

- [ ] **Step 6: Commit the E2E and documentation deliverable**

```bash
git add tests/e2e/factory-flow.spec.ts docs/project-current-state.md
git commit -m "test: cover order drawing image preview"
```
