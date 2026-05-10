import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AnalyticsPage from "@/app/(dashboard)/analytics/page";

const { authMock, analyticsMock } = vi.hoisted(() => ({
  authMock: {
    requireManager: vi.fn(),
  },
  analyticsMock: {
    getWorkspaceAnalytics: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => authMock);
vi.mock("@/server/services/analytics", () => analyticsMock);

describe("analytics page", () => {
  it("renders manager-only operating metrics and charts", async () => {
    authMock.requireManager.mockResolvedValue({
      id: "user-1",
      workspaceId: "workspace-1",
      username: "manager",
      displayName: "王经理",
      role: "manager",
      workspace: { name: "精密加工一厂" },
    });
    analyticsMock.getWorkspaceAnalytics.mockResolvedValue({
      revenueCents: 120000,
      completedQuantity: 80,
      shippedQuantity: 65,
      unpricedShippedQuantity: 5,
      dailySeries: [
        {
          date: "2026-05-10",
          revenueCents: 120000,
          completedQuantity: 80,
          shippedQuantity: 65,
        },
      ],
      customerRevenue: [
        { customerName: "甲方", revenueCents: 120000, shippedQuantity: 60 },
      ],
      orderStatusDistribution: [{ status: "in_progress", count: 2 }],
      overPlannedOrders: [],
      completedOrders: [],
    });

    render(
      await AnalyticsPage({
        searchParams: Promise.resolve({
          from: "2026-05-10",
          to: "2026-05-10",
        }),
      }),
    );

    expect(authMock.requireManager).toHaveBeenCalledTimes(1);
    expect(analyticsMock.getWorkspaceAnalytics).toHaveBeenCalledWith(
      "workspace-1",
      expect.objectContaining({
        from: new Date("2026-05-09T16:00:00.000Z"),
        to: new Date("2026-05-10T16:00:00.000Z"),
      }),
    );
    expect(screen.getByRole("heading", { name: "经营" })).toBeInTheDocument();
    expect(screen.getAllByText("¥1,200.00").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("80")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("未定价出货 5 件")).toBeInTheDocument();
    expect(screen.getByText("客户营业额占比")).toBeInTheDocument();
    expect(screen.getByText("每日趋势")).toBeInTheDocument();
    expect(screen.getByText("订单状态分布")).toBeInTheDocument();
  });
});
