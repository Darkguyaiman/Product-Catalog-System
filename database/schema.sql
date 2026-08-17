-- Product Catalog System schema
-- Run: mysql -u root -p < database/schema.sql
-- Database name matches DB_NAME in .env (default: product_catalog)

CREATE DATABASE IF NOT EXISTS `product_catalog`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `product_catalog`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `package_specs`;
DROP TABLE IF EXISTS `package_products`;
DROP TABLE IF EXISTS `packages`;
DROP TABLE IF EXISTS `product_testimonies`;
DROP TABLE IF EXISTS `testimony_links`;
DROP TABLE IF EXISTS `testimonies`;
DROP TABLE IF EXISTS `product_events`;
DROP TABLE IF EXISTS `event_links`;
DROP TABLE IF EXISTS `events`;
DROP TABLE IF EXISTS `product_activity_logs`;
DROP TABLE IF EXISTS `product_marketing`;
DROP TABLE IF EXISTS `marketing_materials`;
DROP TABLE IF EXISTS `product_images`;
DROP TABLE IF EXISTS `product_specifications`;
DROP TABLE IF EXISTS `product_categories`;
DROP TABLE IF EXISTS `product_types`;
DROP TABLE IF EXISTS `products`;
DROP TABLE IF EXISTS `supplier_companies`;
DROP TABLE IF EXISTS `suppliers`;
DROP TABLE IF EXISTS `affiliated_companies`;
DROP TABLE IF EXISTS `categories`;
DROP TABLE IF EXISTS `settings`;
DROP TABLE IF EXISTS `users`;
DROP TABLE IF EXISTS `sessions`;

SET FOREIGN_KEY_CHECKS = 1;

CREATE TABLE `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(255) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `role` ENUM('Super Admin', 'Admin', 'Product Specialist', 'Graphic Designer') NOT NULL DEFAULT 'Product Specialist',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `type` VARCHAR(50) NOT NULL,
  `value` VARCHAR(255) NOT NULL,
  UNIQUE KEY `unique_setting` (`type`, `value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `categories` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `parent_id` INT DEFAULT NULL,
  FOREIGN KEY (`parent_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `affiliated_companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `shortname` VARCHAR(100) UNIQUE,
  `logo` VARCHAR(255),
  `reg_no` VARCHAR(100),
  `reg_date` DATE,
  `address` TEXT,
  `website` VARCHAR(255),
  `email` VARCHAR(255),
  `contact_number` VARCHAR(50),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_companies_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `suppliers` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `country_id` INT DEFAULT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`country_id`) REFERENCES `settings`(`id`) ON DELETE SET NULL,
  INDEX `idx_suppliers_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `supplier_companies` (
  `supplier_id` INT,
  `company_id` INT,
  PRIMARY KEY (`supplier_id`, `company_id`),
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`company_id`) REFERENCES `affiliated_companies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `products` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `code` VARCHAR(100) NOT NULL,
  `model` VARCHAR(100),
  `mda_reg_no` VARCHAR(100),
  `description` TEXT,
  `product_image` VARCHAR(255),
  `mda_cert` VARCHAR(255),
  `supplier_id` INT DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON DELETE SET NULL,
  INDEX `idx_products_created_at` (`created_at`),
  INDEX `idx_products_active_created_at` (`is_active`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_types` (
  `product_id` INT,
  `type_id` INT,
  PRIMARY KEY (`product_id`, `type_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`type_id`) REFERENCES `settings`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_categories` (
  `product_id` INT,
  `category_id` INT,
  PRIMARY KEY (`product_id`, `category_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_specifications` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT,
  `spec_key` VARCHAR(255),
  `spec_value` TEXT,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_images` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `image_path` VARCHAR(255) NOT NULL,
  `is_main` BOOLEAN DEFAULT FALSE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX `idx_product_main` (`product_id`, `is_main`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `marketing_materials` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255),
  `category` VARCHAR(50) DEFAULT 'BROCHURE',
  `company_id` INT DEFAULT NULL,
  `file_path` VARCHAR(255) NOT NULL,
  `file_type` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `affiliated_companies`(`id`) ON DELETE SET NULL,
  INDEX `idx_materials_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_marketing` (
  `product_id` INT,
  `material_id` INT,
  PRIMARY KEY (`product_id`, `material_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`material_id`) REFERENCES `marketing_materials`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_activity_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `product_id` INT NOT NULL,
  `activity_type` ENUM('product_updated', 'material_added', 'material_updated', 'product_status_updated') NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX `idx_product_activity_created_at` (`created_at`),
  INDEX `idx_product_activity_product_created` (`product_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `events` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255),
  `start_date` DATE,
  `end_date` DATE,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_events_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `event_links` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `event_id` INT,
  `title` VARCHAR(255),
  `url` TEXT,
  FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_events` (
  `product_id` INT,
  `event_id` INT,
  PRIMARY KEY (`product_id`, `event_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `testimonies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `client_name` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255),
  `start_date` DATE,
  `end_date` DATE,
  `treatment` VARCHAR(255),
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_testimonies_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `testimony_links` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `testimony_id` INT,
  `title` VARCHAR(255),
  `url` TEXT,
  FOREIGN KEY (`testimony_id`) REFERENCES `testimonies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `product_testimonies` (
  `product_id` INT,
  `testimony_id` INT,
  PRIMARY KEY (`product_id`, `testimony_id`),
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`testimony_id`) REFERENCES `testimonies`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `packages` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `bundle_label` VARCHAR(255),
  `main_image` TEXT,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `package_products` (
  `package_id` INT,
  `product_id` INT,
  `sort_order` INT DEFAULT 0,
  PRIMARY KEY (`package_id`, `product_id`),
  FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `package_specs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `package_id` INT,
  `icon` VARCHAR(255) DEFAULT 'fa-solid fa-circle',
  `spec_text` TEXT,
  `sort_order` INT DEFAULT 0,
  FOREIGN KEY (`package_id`) REFERENCES `packages`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Created automatically by express-mysql-session at runtime; included here for a complete schema.
CREATE TABLE `sessions` (
  `session_id` VARCHAR(128) COLLATE utf8mb4_bin NOT NULL,
  `expires` INT UNSIGNED NOT NULL,
  `data` MEDIUMTEXT COLLATE utf8mb4_bin,
  PRIMARY KEY (`session_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
