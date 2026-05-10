# Order Status and Record Split Design

## Goal

Update the factory MVP so orders move through the requested CNC workflow, daily machine entry still feels like one operation, and the stored production data separates machining from shipping.

## Current Context

- Orders currently have `open` and `closed` statuses, a required planned quantity, and optional unit price.
- Production records currently store `completedQuantity` and `shippedQuantity` on the same row.
- Machine entry already has one form that accepts both machining and shipping counts.
- Machines still expose separate code/name/model/location fields in parts of the UI, even though the intended product language is now just "机器名称".

## Design

### Order Status Lifecycle

`OrderStatus` becomes:

- `development_pending`: 待开发
- `processing_pending`: 待加工
- `in_progress`: 进行中
- `completed`: 完成

New orders default to `development_pending`. Replacing/uploading drawings automatically moves an order from `development_pending` to `processing_pending`. Linking a machine to an order automatically moves `development_pending` or `processing_pending` to `in_progress`. Users can manually set any of the four statuses from the order detail page.

The `completed` status replaces the old "closed" behavior. Completed orders cannot receive, update, or delete production/shipping records, and cannot be linked to a machine.

### Optional Order Values

`plannedQuantity` is optional on create and in the database. `unitPriceCents` already supports `null`; the create form and parser keep it optional. Order summary fields treat a missing planned quantity as "unknown target": completed/shipped totals are still shown, remaining quantity and over-plan checks display as unavailable, and amount displays as `-` unless both unit price and planned quantity exist.

### Split Production Records

`ProductionRecord` stores one `type` plus one `quantity`:

- `completed`: 加工
- `shipped`: 出货

The machine detail entry form remains unchanged. If the user enters both 加工数量 and 出货数量, the backend creates two rows with the same machine, order, time, and notes. If only one side is positive, it creates one row. If both are zero, validation still fails.

Records page editing changes from always-expanded inline forms to a per-record `修改` dialog. The dialog edits that one row's type, quantity, recorded time, and notes; delete remains available inside the dialog.

### Machine Naming

The UI no longer asks users to manage a separate machine number and name. The existing `Machine.code` column remains the unique machine name to avoid a destructive machine-table migration. New machine creation stores the submitted machine name in both `code` and `name`, with `model` and `location` left empty. Machine list/search and machine detail labels use "机器名称". Machine detail shows only machine name and notes in the machine information area.

## Data Migration

The migration is intentionally destructive for production records because the app has not been put into production yet:

- Replace the order status enum and set existing orders to `development_pending`.
- Make `Order.plannedQuantity` nullable.
- Replace `ProductionRecord.completedQuantity` and `ProductionRecord.shippedQuantity` with `type` and `quantity`.
- Delete existing local/business production record rows during migration.

Local test business data can also be cleared after migration while preserving the bootstrap workspace/user.

## Testing

Tests should cover:

- Optional planned quantity parsing and order summary calculations.
- Status labels and status parser behavior.
- Upload drawings moves only `development_pending` orders to `processing_pending`.
- Linking a machine moves pending orders to `in_progress` and rejects completed orders.
- Machine daily entry creates separate completed/shipped rows while preserving the current form UX.
- Records page renders a `修改` dialog per record instead of default expanded edit fields.
- Order and machine pages display the simplified labels and optional numeric fields correctly.
