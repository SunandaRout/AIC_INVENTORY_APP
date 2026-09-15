-- =====================================================================
-- AIC Inventory App — Indexes
-- Run after schema.sql. These target the exact query shapes the
-- dashboard and reports use (date-range + group-by-location/category).
-- =====================================================================
USE aic_inventory;

-- Products / catalog
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_status   ON products(status);

-- Inventory (low-stock / valuation lookups)
CREATE INDEX idx_inventory_product  ON inventory(product_id);
CREATE INDEX idx_inventory_location ON inventory(location_id);
CREATE INDEX idx_inventory_low_stock ON inventory(current_stock, reorder_level);

-- Purchases
CREATE INDEX idx_purchases_date     ON purchases(purchase_date);
CREATE INDEX idx_purchases_supplier ON purchases(supplier_id);
CREATE INDEX idx_purchases_location ON purchases(location_id);
CREATE INDEX idx_purchases_status   ON purchases(payment_status);
CREATE INDEX idx_pi_purchase        ON purchase_items(purchase_id);
CREATE INDEX idx_pi_product         ON purchase_items(product_id);

-- Sales
CREATE INDEX idx_sales_date         ON sales(sale_date);
CREATE INDEX idx_sales_customer     ON sales(customer_id);
CREATE INDEX idx_sales_location     ON sales(location_id);
CREATE INDEX idx_sales_status       ON sales(payment_status);
CREATE INDEX idx_si_sale            ON sale_items(sale_id);
CREATE INDEX idx_si_product         ON sale_items(product_id);

-- Money movements
CREATE INDEX idx_receipts_customer  ON receipts(customer_id);
CREATE INDEX idx_receipts_date      ON receipts(receipt_date);
CREATE INDEX idx_payments_supplier  ON payments(supplier_id);
CREATE INDEX idx_payments_date      ON payments(payment_date);

-- Audit
CREATE INDEX idx_audit_table_record ON audit_logs(table_name, record_id);
CREATE INDEX idx_audit_created      ON audit_logs(created_at);

-- Composite indexes for the most common dashboard group-bys
CREATE INDEX idx_sales_date_location ON sales(sale_date, location_id);
CREATE INDEX idx_purchases_date_location ON purchases(purchase_date, location_id);
