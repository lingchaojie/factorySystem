import { expect, test, type Locator, type Page } from "@playwright/test";

const username = process.env.BOOTSTRAP_USERNAME ?? "admin";
const password = process.env.BOOTSTRAP_PASSWORD ?? "change-me-before-use";
const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("账号").fill(username);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "登录" }).click();
  await expect(
    page.getByRole("heading", { name: "机器", exact: true }),
  ).toBeVisible();
}

async function createOrder(
  page: Page,
  order: { customerName: string; partName: string; unitPrice: string },
) {
  await page.goto("/orders");
  await expect(
    page.getByRole("heading", { name: "订单", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新增订单" }).click();
  const form = page
    .locator("dialog[open] form")
    .filter({ has: page.getByRole("button", { name: "创建订单" }) });
  await form.locator('input[name="customerName"]').fill(order.customerName);
  await form.locator('input[name="partName"]').fill(order.partName);
  await form.locator('input[name="plannedQuantity"]').fill("100");
  await form.locator('input[name="unitPrice"]').fill(order.unitPrice);
  await form.getByRole("button", { name: "创建订单" }).click();

  const row = page.locator("tbody tr").filter({ hasText: order.partName });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText(order.customerName);
  await expect(row).toContainText("12.34");
  await expect(row).toContainText("1,234.00");
  const orderName = `${order.customerName} / ${order.partName}`;
  await expect(row).toContainText(orderName);
  return orderName;
}

async function createMachine(
  page: Page,
  machine: { code: string },
) {
  await page.goto("/machines");
  await expect(
    page.getByRole("heading", { name: "机器", exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新增机器" }).click();
  const form = page
    .locator("dialog[open] form")
    .filter({ has: page.getByRole("button", { name: "创建机器" }) });
  await form.locator('input[name="code"]').fill(machine.code);
  await form.getByRole("button", { name: "创建机器" }).click();

  const row = page.locator("tbody tr").filter({ hasText: machine.code });
  await row.getByRole("link", { name: "详情" }).click();
  await expect(
    page.getByRole("heading", { name: machine.code }),
  ).toBeVisible();
}

async function linkMachineToOrder(page: Page, orderName: string) {
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "保存关联" }) });
  const orderValue = await form
    .locator("option")
    .filter({ hasText: orderName })
    .getAttribute("value");
  expect(orderValue).toBeTruthy();
  await form.locator('select[name="orderId"]').selectOption(orderValue ?? "");
  await form.getByRole("button", { name: "保存关联" }).click();
  const assignmentSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "关联订单", exact: true }),
    })
    .last();
  await expect(
    assignmentSection.getByRole("link", { name: orderName }),
  ).toBeVisible();
}

async function expectMachineOrderLink(page: Page, orderName: string) {
  await page.getByRole("link", { name: orderName }).first().click();
  await expect(page).toHaveURL(/\/orders\//);
  await expect(
    page.getByRole("heading", { name: orderName }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "录入记录", exact: true }),
  ).toBeVisible();
}

async function createProductionRecord(
  page: Page,
  orderName: string,
  record: { completed: string; shipped: string; notes: string },
) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="completedQuantity"]') })
    .filter({ has: page.locator('input[name="machineId"]') });
  await form.locator('select[name="orderId"]').selectOption({
    label: orderName,
  });
  await form.locator('input[name="completedQuantity"]').fill(record.completed);
  await form.locator('input[name="shippedQuantity"]').fill(record.shipped);
  await form.locator('textarea[name="notes"]').fill(record.notes);
  await form.locator('textarea[name="notes"]').blur();
  const saveButton = form.getByRole("button", { name: "保存记录" });
  await saveButton.scrollIntoViewIfNeeded();
  await expect(saveButton).toBeVisible();
  await expect(saveButton).toBeEnabled();
  await saveButton.click({ force: true });

  const row = page.locator("tbody tr").filter({ hasText: record.notes });
  await expect(row).toHaveCount(2);
  await expect(row.filter({ hasText: "加工" })).toContainText(record.completed);
  await expect(row.filter({ hasText: "出货" })).toContainText(record.shipped);
}

async function orderRow(page: Page, orderName: string): Promise<Locator> {
  await page.goto(`/orders?query=${encodeURIComponent(orderName)}`);
  const row = page.locator("tbody tr").filter({ hasText: orderName });
  await expect(row).toHaveCount(1);
  return row;
}

async function expectOrderSummary(
  page: Page,
  orderName: string,
  summary: {
    completed: string;
    shipped: string;
    remaining: string;
    overPlanned: boolean;
  },
) {
  const row = await orderRow(page, orderName);
  const cells = row.locator("td");
  await expect(cells.nth(5)).toHaveText(summary.completed);
  await expect(cells.nth(6)).toHaveText(summary.shipped);
  await expect(cells.nth(7)).toHaveText(summary.remaining);

  if (summary.overPlanned) {
    await expect(row.getByText("超出计划")).toBeVisible();
  } else {
    await expect(row.getByText("超出计划")).toHaveCount(0);
  }
}

test("factory order, machine, production, and deletion flow updates totals", async ({
  page,
}, testInfo) => {
  const projectCode = testInfo.project.name === "mobile-chrome" ? "m" : "d";
  const suffix = `${projectCode}${Date.now().toString(36).slice(-5)}${testInfo.workerIndex}`;
  const order = {
    customerName: `客户${suffix}`,
    partName: `工件${suffix}`,
    unitPrice: "12.34",
  };
  const machine = {
    code: `M${suffix}`,
  };
  const firstRecord = { completed: "60", shipped: "20", notes: `记录1-${suffix}` };
  const secondRecord = { completed: "50", shipped: "90", notes: `记录2-${suffix}` };

  await login(page);
  const orderName = await createOrder(page, order);
  await createMachine(page, machine);
  await linkMachineToOrder(page, orderName);
  await expectMachineOrderLink(page, orderName);
  await createProductionRecord(page, orderName, firstRecord);
  await createProductionRecord(page, orderName, secondRecord);
  await expectOrderSummary(page, orderName, {
    completed: "110",
    shipped: "110",
    remaining: "0",
    overPlanned: true,
  });

  await page.goto(`/records?customerName=${encodeURIComponent(order.customerName)}`);
  for (const recordType of ["加工", "出货"]) {
    const recordSelector =
      recordType === "加工"
        ? 'article[data-record-type="completed"]'
        : 'article[data-record-type="shipped"]';
    const record = page
      .locator(recordSelector)
      .filter({ hasText: secondRecord.notes });
    await expect(record).toHaveCount(1);
    await record.getByRole("button", { name: "修改" }).click();
    const dialog = page
      .locator("dialog[open]")
      .filter({ has: page.getByRole("heading", { name: "修改记录" }) });
    await expect(dialog).toBeVisible();
    page.once("dialog", async (confirmDialog) => {
      expect(confirmDialog.type()).toBe("confirm");
      await confirmDialog.accept();
    });
    await dialog.getByRole("button", { name: "删除" }).click();
    await expect(record).toHaveCount(0);
  }

  await expectOrderSummary(page, orderName, {
    completed: "60",
    shipped: "20",
    remaining: "80",
    overPlanned: false,
  });
});

test("one machine records against two associated orders", async ({
  page,
}, testInfo) => {
  const suffix = `multi${Date.now().toString(36).slice(-5)}${testInfo.workerIndex}`;
  await login(page);
  const firstOrderName = await createOrder(page, {
    customerName: `甲方${suffix}`,
    partName: `法兰${suffix}`,
    unitPrice: "12.34",
  });
  const secondOrderName = await createOrder(page, {
    customerName: `乙方${suffix}`,
    partName: `轴套${suffix}`,
    unitPrice: "12.34",
  });

  await createMachine(page, { code: `MM${suffix}` });
  await linkMachineToOrder(page, firstOrderName);
  await linkMachineToOrder(page, secondOrderName);
  await page.goto(new URL(page.url()).pathname);

  const recordForm = page
    .locator("form")
    .filter({ has: page.locator('input[name="completedQuantity"]') });
  const targetOrder = recordForm.locator('select[name="orderId"]');
  await expect(targetOrder).toHaveValue("");
  await expect(
    targetOrder.locator("option", { hasText: firstOrderName }),
  ).toHaveCount(1);
  await expect(
    targetOrder.locator("option", { hasText: secondOrderName }),
  ).toHaveCount(1);

  await createProductionRecord(page, firstOrderName, {
    completed: "11",
    shipped: "3",
    notes: `甲方记录-${suffix}`,
  });
  await createProductionRecord(page, secondOrderName, {
    completed: "7",
    shipped: "2",
    notes: `乙方记录-${suffix}`,
  });
  await expectOrderSummary(page, firstOrderName, {
    completed: "11",
    shipped: "3",
    remaining: "97",
    overPlanned: false,
  });
  await expectOrderSummary(page, secondOrderName, {
    completed: "7",
    shipped: "2",
    remaining: "98",
    overPlanned: false,
  });
});

test("previews and switches uploaded order images", async ({ page }, testInfo) => {
  const suffix = `img${Date.now().toString(36).slice(-5)}${testInfo.workerIndex}`;
  await login(page);
  const orderName = await createOrder(page, {
    customerName: `图纸客户${suffix}`,
    partName: `图纸工件${suffix}`,
    unitPrice: "12.34",
  });
  const row = await orderRow(page, orderName);
  await row.getByRole("link", { name: "详情" }).click();
  await expect(page.getByRole("heading", { name: orderName })).toBeVisible();

  await page.locator('input[name="drawings"]').setInputFiles([
    { name: "front.png", mimeType: "image/png", buffer: onePixelPng },
    { name: "side.png", mimeType: "image/png", buffer: onePixelPng },
  ]);
  await expect(
    page.getByRole("button", { name: "预览 front.png" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "预览 side.png" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "预览 side.png" }).click();
  const dialog = page.getByRole("dialog", { name: "预览 side.png" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("第 2 张 / 共 2 张")).toBeVisible();
  const sideImage = dialog.getByRole("img", { name: "side.png" });
  await expect(sideImage).toBeVisible();
  await expect
    .poll(() => sideImage.evaluate((image) => (image as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);

  await dialog.getByRole("button", { name: "上一张" }).click();
  await expect(page.getByRole("img", { name: "front.png" })).toBeVisible();
  await expect(page.getByText("第 1 张 / 共 2 张")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "下载 front.png" }),
  ).toHaveAttribute("href", /^\/api\/order-drawings\/[^?]+$/);
});

test("manages machines from an order detail", async ({ page }, testInfo) => {
  const suffix = `om${Date.now().toString(36).slice(-5)}${testInfo.workerIndex}`;
  const firstMachineCode = `OA${suffix}`;
  const secondMachineCode = `OB${suffix}`;

  await login(page);
  const orderName = await createOrder(page, {
    customerName: `订单关联客户${suffix}`,
    partName: `订单关联工件${suffix}`,
    unitPrice: "12.34",
  });
  await createMachine(page, { code: firstMachineCode });
  await createMachine(page, { code: secondMachineCode });

  const row = await orderRow(page, orderName);
  await row.getByRole("link", { name: "详情" }).click();
  const assignmentRegion = page.getByRole("region", { name: "关联机器" });
  const machineSelect = assignmentRegion.getByLabel("可关联机器");

  await machineSelect.selectOption({ label: firstMachineCode });
  await assignmentRegion.getByRole("button", { name: "保存关联" }).click();
  await expect(
    assignmentRegion.getByRole("link", { name: firstMachineCode }),
  ).toBeVisible();

  page.once("dialog", (dialog) => dialog.accept());
  await assignmentRegion.getByRole("button", { name: "解除关联" }).click();
  await expect(
    assignmentRegion.getByRole("link", { name: firstMachineCode }),
  ).toHaveCount(0);

  await assignmentRegion
    .getByLabel("可关联机器")
    .selectOption({ label: secondMachineCode });
  await assignmentRegion.getByRole("button", { name: "保存关联" }).click();
  await assignmentRegion
    .getByRole("link", { name: secondMachineCode })
    .click();

  await expect(
    page.getByRole("heading", { name: secondMachineCode }),
  ).toBeVisible();
  const orderAssignmentSection = page
    .locator("section")
    .filter({
      has: page.getByRole("heading", { name: "关联订单", exact: true }),
    })
    .last();
  await expect(
    orderAssignmentSection.getByRole("link", { name: orderName }),
  ).toBeVisible();
});
