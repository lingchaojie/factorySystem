import { expect, test, type Locator, type Page } from "@playwright/test";

const username = process.env.BOOTSTRAP_USERNAME ?? "admin";
const password = process.env.BOOTSTRAP_PASSWORD ?? "change-me-before-use";

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
  const rowText = await row.innerText();
  const orderNo = rowText.match(/ORD-\d{8}-\d{4}/)?.[0];
  expect(orderNo).toBeTruthy();
  return orderNo ?? "";
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
    page.getByRole("heading", { name: `${machine.code} / ${machine.code}` }),
  ).toBeVisible();
}

async function linkMachineToOrder(page: Page, orderNo: string) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('select[name="orderId"]') });
  const orderValue = await form
    .locator("option")
    .filter({ hasText: orderNo })
    .getAttribute("value");
  expect(orderValue).toBeTruthy();
  await form.locator('select[name="orderId"]').selectOption(orderValue ?? "");
  await form.getByRole("button", { name: "保存关联" }).click();
  await expect(
    page.locator("section").filter({
      has: page.getByRole("heading", { name: "机器信息", exact: true }),
    }).last(),
  ).toContainText(orderNo);
}

async function expectMachineOrderLink(page: Page, orderNo: string) {
  await page.getByRole("link", { name: new RegExp(orderNo) }).first().click();
  await expect(page).toHaveURL(/\/orders\//);
  await expect(
    page.getByRole("heading", { name: new RegExp(orderNo) }),
  ).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "录入记录", exact: true }),
  ).toBeVisible();
}

async function createProductionRecord(
  page: Page,
  record: { completed: string; shipped: string; notes: string },
) {
  const form = page
    .locator("form")
    .filter({ has: page.locator('input[name="completedQuantity"]') })
    .filter({ has: page.locator('input[name="machineId"]') });
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
  await expect(row).toContainText(record.completed);
  await expect(row).toContainText(record.shipped);
}

async function orderRow(page: Page, orderNo: string): Promise<Locator> {
  await page.goto(`/orders?query=${encodeURIComponent(orderNo)}`);
  const row = page.locator("tbody tr").filter({ hasText: orderNo });
  await expect(row).toHaveCount(1);
  return row;
}

async function expectOrderSummary(
  page: Page,
  orderNo: string,
  summary: {
    completed: string;
    shipped: string;
    remaining: string;
    overPlanned: boolean;
  },
) {
  const row = await orderRow(page, orderNo);
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
  const orderNo = await createOrder(page, order);
  await createMachine(page, machine);
  await linkMachineToOrder(page, orderNo);
  await expectMachineOrderLink(page, orderNo);
  await createProductionRecord(page, firstRecord);
  await createProductionRecord(page, secondRecord);
  await expectOrderSummary(page, orderNo, {
    completed: "110",
    shipped: "110",
    remaining: "0",
    overPlanned: true,
  });

  await page.goto(`/records?customerName=${encodeURIComponent(order.customerName)}`);
  const record = page.locator("article").filter({ hasText: secondRecord.notes });
  await expect(record).toHaveCount(1);

  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    await dialog.accept();
  });
  await record.getByRole("button", { name: "删除" }).click();
  await expect(record).toHaveCount(0);

  await expectOrderSummary(page, orderNo, {
    completed: "60",
    shipped: "20",
    remaining: "80",
    overPlanned: false,
  });
});
