-- =====================================================================
-- Parameterised dashboard queries
-- Placeholders (?) map 1:1 to JDBC PreparedStatement params set in
-- Dashboard.gs → getDashboardData(filters). Views (views.sql) are the
-- unfiltered baseline; these are what actually run when a person
-- changes the date range / location / category filters in the UI.
-- =====================================================================

-- KPIs for a date range + optional location
-- params: fromDate, toDate, locationId(or NULL), fromDate, toDate, locationId(or NULL)
SELECT
  (SELECT COALESCE(SUM(total_amount),0) FROM sales
     WHERE sale_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)) AS total_sales,
  (SELECT COALESCE(SUM(total_amount),0) FROM purchases
     WHERE purchase_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)) AS total_purchases;

-- Monthly sales trend within a range
-- params: fromDate, toDate
SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, SUM(total_amount) AS sales
FROM sales
WHERE sale_date BETWEEN ? AND ?
GROUP BY month
ORDER BY month;

-- Top N customers within a range
-- params: fromDate, toDate, limitN
SELECT c.customer_name, SUM(s.total_amount) AS total_sales
FROM sales s JOIN customers c ON c.customer_id = s.customer_id
WHERE s.sale_date BETWEEN ? AND ?
GROUP BY c.customer_id, c.customer_name
ORDER BY total_sales DESC
LIMIT ?;

-- Sales by location within a range
-- params: fromDate, toDate
SELECT l.location_name, SUM(s.total_amount) AS total_sales
FROM sales s JOIN locations l ON l.location_id = s.location_id
WHERE s.sale_date BETWEEN ? AND ?
GROUP BY l.location_id, l.location_name
ORDER BY total_sales DESC;

-- Sales by category within a range, optional location filter
-- params: fromDate, toDate, locationId(or NULL), locationId(or NULL)
SELECT cat.category_name, SUM(si.total_amount) AS total_sales
FROM sale_items si
JOIN sales s ON s.sale_id = si.sale_id
JOIN products p ON p.product_id = si.product_id
JOIN categories cat ON cat.category_id = p.category_id
WHERE s.sale_date BETWEEN ? AND ?
  AND (? IS NULL OR s.location_id = ?)
GROUP BY cat.category_id, cat.category_name
ORDER BY total_sales DESC;

-- Low stock report, optional location
-- params: locationId(or NULL), locationId(or NULL)
SELECT * FROM vw_low_stock
WHERE (? IS NULL OR location_name = (SELECT location_name FROM locations WHERE location_id = ?));

-- Product performance (sales value + margin) within a range
-- params: fromDate, toDate
SELECT p.product_name,
       SUM(si.quantity) AS units_sold,
       SUM(si.total_amount) AS revenue,
       SUM(si.quantity * p.purchase_price) AS cost,
       SUM(si.total_amount) - SUM(si.quantity * p.purchase_price) AS profit
FROM sale_items si
JOIN sales s ON s.sale_id = si.sale_id
JOIN products p ON p.product_id = si.product_id
WHERE s.sale_date BETWEEN ? AND ?
GROUP BY p.product_id, p.product_name
ORDER BY revenue DESC;
