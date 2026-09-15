-- =====================================================================
-- AIC Inventory App — Database Schema
-- Target: MySQL 8.0+ / MariaDB 10.5+ (PostgreSQL notes inline where it differs)
-- =====================================================================

CREATE DATABASE IF NOT EXISTS aic_inventory CHARACTER SET utf8mb4;
USE aic_inventory;

-- ---------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------
CREATE TABLE locations (
  location_id     VARCHAR(20)  PRIMARY KEY,
  location_name   VARCHAR(120) NOT NULL,
  city            VARCHAR(120),
  state           VARCHAR(120),
  country         VARCHAR(120),
  status          ENUM('Active','Inactive') DEFAULT 'Active'
);

CREATE TABLE categories (
  category_id     VARCHAR(20)  PRIMARY KEY,
  category_name   VARCHAR(120) NOT NULL,
  description     VARCHAR(255),
  status          ENUM('Active','Inactive') DEFAULT 'Active'
);

CREATE TABLE users (
  user_id         VARCHAR(20)  PRIMARY KEY,
  name            VARCHAR(120) NOT NULL,
  email           VARCHAR(160) NOT NULL UNIQUE,
  password_hash   VARCHAR(255) NOT NULL,
  role            ENUM('Admin','Manager','Staff','Viewer') NOT NULL DEFAULT 'Viewer',
  status          ENUM('Active','Inactive') DEFAULT 'Active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Parties
-- ---------------------------------------------------------------------
CREATE TABLE suppliers (
  supplier_id     VARCHAR(20)  PRIMARY KEY,
  supplier_name   VARCHAR(160) NOT NULL,
  phone           VARCHAR(40),
  email           VARCHAR(160),
  address         VARCHAR(255),
  city            VARCHAR(120),
  state           VARCHAR(120),
  country         VARCHAR(120),
  gst_number      VARCHAR(40),
  opening_balance DECIMAL(16,2) DEFAULT 0,
  status          ENUM('Active','Inactive') DEFAULT 'Active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE customers (
  customer_id     VARCHAR(20)  PRIMARY KEY,
  customer_name   VARCHAR(160) NOT NULL,
  phone           VARCHAR(40),
  email           VARCHAR(160),
  address         VARCHAR(255),
  city            VARCHAR(120),
  state           VARCHAR(120),
  country         VARCHAR(120),
  gst_number      VARCHAR(40),
  credit_limit    DECIMAL(16,2) DEFAULT 0,
  opening_balance DECIMAL(16,2) DEFAULT 0,
  status          ENUM('Active','Inactive') DEFAULT 'Active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Catalog & stock
-- ---------------------------------------------------------------------
CREATE TABLE products (
  product_id      VARCHAR(20)  PRIMARY KEY,
  sku             VARCHAR(60)  NOT NULL UNIQUE,
  product_name    VARCHAR(180) NOT NULL,
  category_id     VARCHAR(20)  NOT NULL,
  brand           VARCHAR(120),
  unit            VARCHAR(30),
  purchase_price  DECIMAL(14,2) NOT NULL DEFAULT 0,
  sale_price      DECIMAL(14,2) NOT NULL DEFAULT 0,
  reorder_level   DECIMAL(12,2) DEFAULT 0,
  supplier_id     VARCHAR(20),
  status          ENUM('Active','Inactive') DEFAULT 'Active',
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_products_category FOREIGN KEY (category_id) REFERENCES categories(category_id),
  CONSTRAINT fk_products_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  CONSTRAINT chk_products_prices CHECK (purchase_price >= 0 AND sale_price >= 0)
);

CREATE TABLE inventory (
  inventory_id    VARCHAR(20)  PRIMARY KEY,
  product_id      VARCHAR(20)  NOT NULL,
  location_id     VARCHAR(20)  NOT NULL,
  opening_stock   DECIMAL(14,2) DEFAULT 0,
  current_stock   DECIMAL(14,2) DEFAULT 0,
  reorder_level   DECIMAL(12,2) DEFAULT 0,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventory_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT fk_inventory_location FOREIGN KEY (location_id) REFERENCES locations(location_id),
  UNIQUE KEY uq_inventory_product_location (product_id, location_id)
);

-- ---------------------------------------------------------------------
-- Purchases
-- ---------------------------------------------------------------------
CREATE TABLE purchases (
  purchase_id     VARCHAR(20)  PRIMARY KEY,
  supplier_id     VARCHAR(20)  NOT NULL,
  purchase_date   DATE NOT NULL,
  invoice_number  VARCHAR(60),
  discount        DECIMAL(14,2) DEFAULT 0,
  tax             DECIMAL(14,2) DEFAULT 0,
  total_amount    DECIMAL(16,2) NOT NULL DEFAULT 0,
  payment_status  ENUM('Paid','Partial','Unpaid') DEFAULT 'Unpaid',
  location_id     VARCHAR(20),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_purchases_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  CONSTRAINT fk_purchases_location FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE purchase_items (
  purchase_item_id VARCHAR(20) PRIMARY KEY,
  purchase_id      VARCHAR(20) NOT NULL,
  product_id       VARCHAR(20) NOT NULL,
  quantity         DECIMAL(14,2) NOT NULL,
  unit_price       DECIMAL(14,2) NOT NULL,
  discount         DECIMAL(14,2) DEFAULT 0,
  tax              DECIMAL(14,2) DEFAULT 0,
  total_amount     DECIMAL(16,2) NOT NULL,
  CONSTRAINT fk_pi_purchase FOREIGN KEY (purchase_id) REFERENCES purchases(purchase_id) ON DELETE CASCADE,
  CONSTRAINT fk_pi_product  FOREIGN KEY (product_id)  REFERENCES products(product_id),
  CONSTRAINT chk_pi_qty CHECK (quantity > 0)
);

-- ---------------------------------------------------------------------
-- Sales
-- ---------------------------------------------------------------------
CREATE TABLE sales (
  sale_id         VARCHAR(20)  PRIMARY KEY,
  customer_id     VARCHAR(20)  NOT NULL,
  sale_date       DATE NOT NULL,
  invoice_number  VARCHAR(60),
  discount        DECIMAL(14,2) DEFAULT 0,
  tax             DECIMAL(14,2) DEFAULT 0,
  total_amount    DECIMAL(16,2) NOT NULL DEFAULT 0,
  payment_status  ENUM('Paid','Partial','Unpaid') DEFAULT 'Unpaid',
  location_id     VARCHAR(20),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  CONSTRAINT fk_sales_location FOREIGN KEY (location_id) REFERENCES locations(location_id)
);

CREATE TABLE sale_items (
  sale_item_id     VARCHAR(20) PRIMARY KEY,
  sale_id          VARCHAR(20) NOT NULL,
  product_id       VARCHAR(20) NOT NULL,
  quantity         DECIMAL(14,2) NOT NULL,
  unit_price       DECIMAL(14,2) NOT NULL,
  discount         DECIMAL(14,2) DEFAULT 0,
  tax              DECIMAL(14,2) DEFAULT 0,
  total_amount     DECIMAL(16,2) NOT NULL,
  CONSTRAINT fk_si_sale    FOREIGN KEY (sale_id)    REFERENCES sales(sale_id) ON DELETE CASCADE,
  CONSTRAINT fk_si_product FOREIGN KEY (product_id) REFERENCES products(product_id),
  CONSTRAINT chk_si_qty CHECK (quantity > 0)
);

-- ---------------------------------------------------------------------
-- Money in / out
-- ---------------------------------------------------------------------
CREATE TABLE receipts (
  receipt_id       VARCHAR(20) PRIMARY KEY,
  customer_id      VARCHAR(20) NOT NULL,
  receipt_date     DATE NOT NULL,
  amount           DECIMAL(16,2) NOT NULL,
  payment_method   ENUM('Cash','Bank Transfer','UPI','Card','Cheque','Other') DEFAULT 'Cash',
  reference_number VARCHAR(80),
  notes            VARCHAR(255),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_receipts_customer FOREIGN KEY (customer_id) REFERENCES customers(customer_id),
  CONSTRAINT chk_receipt_amount CHECK (amount > 0)
);

CREATE TABLE payments (
  payment_id       VARCHAR(20) PRIMARY KEY,
  supplier_id      VARCHAR(20) NOT NULL,
  payment_date     DATE NOT NULL,
  amount           DECIMAL(16,2) NOT NULL,
  payment_method   ENUM('Cash','Bank Transfer','UPI','Card','Cheque','Other') DEFAULT 'Cash',
  reference_number VARCHAR(80),
  notes            VARCHAR(255),
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_payments_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id),
  CONSTRAINT chk_payment_amount CHECK (amount > 0)
);

-- ---------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
  log_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(20),
  action        VARCHAR(80) NOT NULL,     -- e.g. SALE_CREATED, PRODUCT_UPDATED
  table_name    VARCHAR(80),
  record_id     VARCHAR(40),
  details       JSON,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Sheets <-> SQL sync bookkeeping
-- ---------------------------------------------------------------------
CREATE TABLE sync_log (
  sync_id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  sheet_name     VARCHAR(60) NOT NULL,
  started_at     DATETIME NOT NULL,
  finished_at    DATETIME,
  rows_inserted  INT DEFAULT 0,
  rows_updated   INT DEFAULT 0,
  rows_failed    INT DEFAULT 0,
  status         ENUM('SUCCESS','PARTIAL','FAILED') DEFAULT 'SUCCESS',
  error_details  TEXT
);
