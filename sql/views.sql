-- =====================================================================
-- AIC Inventory App — Analytics Views
-- Run after schema.sql + indexes.sql. Dashboard.gs / Reports.gs query
-- these views (with date/location/category params applied as WHERE
-- clauses on top of them, or re-implemented as parameterised queries —
-- see dashboard_queries.sql for the parameterised versions).
-- =====================================================================
USE aic_inventory;

-- ---------------------------------------------------------------------
-- vw_monthly_sales — sales total per calendar month
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_monthly_sales AS
SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, SUM(total_amount) AS sales_total
FROM sales
GROUP BY DATE_FORMAT(sale_date, '%Y-%m');

-- ---------------------------------------------------------------------
-- vw_monthly_purchases — purchases total per calendar month
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_monthly_purchases AS
SELECT DATE_FORMAT(purchase_date, '%Y-%m') AS month, SUM(total_amount) AS purchases_total
FROM purchases
GROUP BY DATE_FORMAT(purchase_date, '%Y-%m');

-- ---------------------------------------------------------------------
-- vw_top_customers — lifetime sales value per customer
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_top_customers AS
SELECT c.customer_id, c.customer_name, SUM(s.total_amount) AS total_sales, COUNT(*) AS order_count
FROM sales s
JOIN customers c ON c.customer_id = s.customer_id
GROUP BY c.customer_id, c.customer_name
ORDER BY total_sales DESC;

-- ---------------------------------------------------------------------
-- vw_top_products — lifetime sales value per product
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_top_products AS
SELECT p.product_id, p.product_name, SUM(si.total_amount) AS total_sales, SUM(si.quantity) AS units_sold
FROM sale_items si
JOIN products p ON p.product_id = si.product_id
GROUP BY p.product_id, p.product_name
ORDER BY total_sales DESC;

-- ---------------------------------------------------------------------
-- vw_sales_by_location / vw_purchase_by_location
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_sales_by_location AS
SELECT l.location_id, l.location_name, SUM(s.total_amount) AS total_sales
FROM sales s
JOIN locations l ON l.location_id = s.location_id
GROUP BY l.location_id, l.location_name
ORDER BY total_sales DESC;

CREATE OR REPLACE VIEW vw_purchase_by_location AS
SELECT l.location_id, l.location_name, SUM(p.total_amount) AS total_purchases
FROM purchases p
JOIN locations l ON l.location_id = p.location_id
GROUP BY l.location_id, l.location_name
ORDER BY total_purchases DESC;

-- ---------------------------------------------------------------------
-- vw_sales_by_category
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_sales_by_category AS
SELECT cat.category_id, cat.category_name, SUM(si.total_amount) AS total_sales
FROM sale_items si
JOIN products p ON p.product_id = si.product_id
JOIN categories cat ON cat.category_id = p.category_id
GROUP BY cat.category_id, cat.category_name
ORDER BY total_sales DESC;

-- ---------------------------------------------------------------------
-- vw_sales_by_city
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_sales_by_city AS
SELECT l.city, SUM(s.total_amount) AS total_sales
FROM sales s
JOIN locations l ON l.location_id = s.location_id
GROUP BY l.city
ORDER BY total_sales DESC;

-- ---------------------------------------------------------------------
-- vw_customer_receivables — outstanding balance per customer
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_customer_receivables AS
SELECT c.customer_id, c.customer_name, c.credit_limit,
       c.opening_balance
       + COALESCE((SELECT SUM(s.total_amount) FROM sales s WHERE s.customer_id = c.customer_id), 0)
       - COALESCE((SELECT SUM(r.amount) FROM receipts r WHERE r.customer_id = c.customer_id), 0)
       AS outstanding_balance
FROM customers c
HAVING outstanding_balance > 0
ORDER BY outstanding_balance DESC;

-- ---------------------------------------------------------------------
-- vw_supplier_payables — outstanding balance per supplier
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_supplier_payables AS
SELECT s.supplier_id, s.supplier_name,
       s.opening_balance
       + COALESCE((SELECT SUM(p.total_amount) FROM purchases p WHERE p.supplier_id = s.supplier_id), 0)
       - COALESCE((SELECT SUM(pay.amount) FROM payments pay WHERE pay.supplier_id = s.supplier_id), 0)
       AS outstanding_balance
FROM suppliers s
HAVING outstanding_balance > 0
ORDER BY outstanding_balance DESC;

-- ---------------------------------------------------------------------
-- vw_inventory_status — stock health per product/location
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_inventory_status AS
SELECT i.inventory_id, p.product_id, p.product_name, p.sku, cat.category_name,
       l.location_name, i.current_stock, i.reorder_level,
       (i.current_stock * p.purchase_price) AS inventory_value,
       CASE
         WHEN i.current_stock <= 0 THEN 'OUT OF STOCK'
         WHEN i.current_stock <= i.reorder_level THEN 'LOW STOCK'
         ELSE 'IN STOCK'
       END AS stock_status
FROM inventory i
JOIN products p ON p.product_id = i.product_id
JOIN categories cat ON cat.category_id = p.category_id
JOIN locations l ON l.location_id = i.location_id;

-- ---------------------------------------------------------------------
-- vw_low_stock — items at/below reorder level
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_low_stock AS
SELECT * FROM vw_inventory_status WHERE stock_status IN ('LOW STOCK','OUT OF STOCK');

-- ---------------------------------------------------------------------
-- vw_payment_collection — receivable vs received vs outstanding
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_payment_collection AS
SELECT
  (SELECT COALESCE(SUM(opening_balance),0) FROM customers) +
  (SELECT COALESCE(SUM(total_amount),0) FROM sales) AS total_receivable_raised,
  (SELECT COALESCE(SUM(amount),0) FROM receipts) AS total_received,
  (
    (SELECT COALESCE(SUM(opening_balance),0) FROM customers) +
    (SELECT COALESCE(SUM(total_amount),0) FROM sales) -
    (SELECT COALESCE(SUM(amount),0) FROM receipts)
  ) AS outstanding;

-- ---------------------------------------------------------------------
-- vw_dashboard_summary — single-row KPI summary for the top cards
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW vw_dashboard_summary AS
SELECT
  (SELECT COALESCE(SUM(total_amount),0) FROM sales) AS total_sales,
  (SELECT COALESCE(SUM(total_amount),0) FROM purchases) AS total_purchases,
  (SELECT COALESCE(SUM(total_amount),0) FROM sales) -
    (SELECT COALESCE(SUM(si.quantity * p.purchase_price),0)
       FROM sale_items si JOIN products p ON p.product_id = si.product_id) AS net_profit,
  (SELECT COALESCE(SUM(outstanding_balance),0) FROM vw_customer_receivables) AS total_receivable,
  (SELECT COALESCE(SUM(outstanding_balance),0) FROM vw_supplier_payables) AS total_payable,
  (SELECT location_name FROM vw_sales_by_location ORDER BY total_sales DESC LIMIT 1) AS top_sales_location;
