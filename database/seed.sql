-- Product Catalog System demo seed
-- Run after schema.sql:
--   mysql -u root -p product_catalog < database/seed.sql
--
-- All seed users share password: 1234567890
--   admin@admin.com              Super Admin
--   superadmin@admin.com         Super Admin
--   admin@meditech.my            Admin
--   specialist@meditech.my       Product Specialist
--   designer@meditech.my         Graphic Designer
--   specialist@lifecare.my       Product Specialist
--
-- Public catalog shortnames: /meditech, /lifecare, /surgipro, /vitalpath
-- File paths are placeholders; the UI already shows empty-state icons when files are missing.

USE `product_catalog`;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

TRUNCATE TABLE `package_specs`;
TRUNCATE TABLE `package_products`;
TRUNCATE TABLE `packages`;
TRUNCATE TABLE `product_testimonies`;
TRUNCATE TABLE `testimony_links`;
TRUNCATE TABLE `testimonies`;
TRUNCATE TABLE `product_events`;
TRUNCATE TABLE `event_links`;
TRUNCATE TABLE `events`;
TRUNCATE TABLE `product_activity_logs`;
TRUNCATE TABLE `product_marketing`;
TRUNCATE TABLE `marketing_materials`;
TRUNCATE TABLE `product_images`;
TRUNCATE TABLE `product_specifications`;
TRUNCATE TABLE `product_categories`;
TRUNCATE TABLE `product_types`;
TRUNCATE TABLE `products`;
TRUNCATE TABLE `supplier_companies`;
TRUNCATE TABLE `suppliers`;
TRUNCATE TABLE `affiliated_companies`;
TRUNCATE TABLE `categories`;
TRUNCATE TABLE `settings`;
TRUNCATE TABLE `users`;

SET FOREIGN_KEY_CHECKS = 1;

-- ---------------------------------------------------------------------------
-- Users  (bcrypt hash of 1234567890, cost 10)
-- ---------------------------------------------------------------------------
INSERT INTO `users` (`id`, `email`, `password`, `role`, `created_at`) VALUES
(1, 'admin@admin.com',        '$2b$10$dc3b31SeMz3H6YNPgmv6Ouluw6mCnli7.VvTlTGOB.UaaHLcnmFh2', 'Super Admin',        '2025-11-02 09:00:00'),
(2, 'superadmin@admin.com',   '$2b$10$dc3b31SeMz3H6YNPgmv6Ouluw6mCnli7.VvTlTGOB.UaaHLcnmFh2', 'Super Admin',        '2025-11-02 09:05:00'),
(3, 'admin@meditech.my',      '$2b$10$dc3b31SeMz3H6YNPgmv6Ouluw6mCnli7.VvTlTGOB.UaaHLcnmFh2', 'Admin',              '2026-01-08 10:12:00'),
(4, 'specialist@meditech.my', '$2b$10$dc3b31SeMz3H6YNPgmv6Ouluw6mCnli7.VvTlTGOB.UaaHLcnmFh2', 'Product Specialist', '2026-01-15 11:20:00'),
(5, 'designer@meditech.my',   '$2b$10$dc3b31SeMz3H6YNPgmv6Ouluw6mCnli7.VvTlTGOB.UaaHLcnmFh2', 'Graphic Designer',   '2026-02-03 14:40:00'),
(6, 'specialist@lifecare.my', '$2b$10$dc3b31SeMz3H6YNPgmv6Ouluw6mCnli7.VvTlTGOB.UaaHLcnmFh2', 'Product Specialist', '2026-03-11 08:55:00');

-- ---------------------------------------------------------------------------
-- Settings: countries (1-10) and product types (11-18)
-- ---------------------------------------------------------------------------
INSERT INTO `settings` (`id`, `type`, `value`) VALUES
(1,  'country', 'Malaysia'),
(2,  'country', 'Germany'),
(3,  'country', 'Japan'),
(4,  'country', 'United States'),
(5,  'country', 'China'),
(6,  'country', 'South Korea'),
(7,  'country', 'Singapore'),
(8,  'country', 'Italy'),
(9,  'country', 'United Kingdom'),
(10, 'country', 'Netherlands'),
(11, 'product_type', 'Capital Equipment'),
(12, 'product_type', 'Consumable'),
(13, 'product_type', 'Implant'),
(14, 'product_type', 'Diagnostic Device'),
(15, 'product_type', 'Surgical Instrument'),
(16, 'product_type', 'Patient Monitoring'),
(17, 'product_type', 'Rehabilitation Device'),
(18, 'product_type', 'Disinfectant');

-- ---------------------------------------------------------------------------
-- Categories (parents first, then children)
-- ---------------------------------------------------------------------------
INSERT INTO `categories` (`id`, `name`, `parent_id`) VALUES
(1,  'Diagnostic Equipment', NULL),
(2,  'Imaging Systems', 1),
(3,  'Patient Monitoring', 1),
(4,  'Surgical Instruments', NULL),
(5,  'Laparoscopic', 4),
(6,  'Orthopedic', 4),
(7,  'Consumables', NULL),
(8,  'Wound Care', 7),
(9,  'Infection Control', 7),
(10, 'Rehabilitation', NULL),
(11, 'Mobility Aids', 10);

-- ---------------------------------------------------------------------------
-- Affiliated companies
-- ---------------------------------------------------------------------------
INSERT INTO `affiliated_companies`
  (`id`, `name`, `shortname`, `logo`, `reg_no`, `reg_date`, `address`, `website`, `email`, `contact_number`, `created_at`)
VALUES
(1, 'MediTech Holdings Sdn Bhd', 'meditech', NULL, '202101012345', '2021-03-18',
    'Level 12, Menara Meditech, Jalan Tun Razak, 50400 Kuala Lumpur',
    'https://meditech.example', 'hello@meditech.example', '+603-2166-1100', '2026-01-10 09:00:00'),
(2, 'LifeCare Medical Group Sdn Bhd', 'lifecare', NULL, '201801045678', '2018-07-02',
    'No. 8, Jalan Teknologi 3/4, Taman Sains Selangor, 47810 Petaling Jaya',
    'https://lifecare.example', 'info@lifecare.example', '+603-7956-4420', '2026-01-22 11:30:00'),
(3, 'SurgiPro Asia Sdn Bhd', 'surgipro', NULL, '201901023456', '2019-11-14',
    'Lot 21, Jalan Bukit Minyak 7, Taman Perindustrian Bukit Minyak, 14100 Penang',
    'https://surgipro.example', 'sales@surgipro.example', '+604-507-2288', '2026-02-18 15:10:00'),
(4, 'VitalPath Diagnostics Sdn Bhd', 'vitalpath', NULL, '202201067890', '2022-05-09',
    'Suite 5-2, The Vertical, Bangsar South, 59200 Kuala Lumpur',
    'https://vitalpath.example', 'contact@vitalpath.example', '+603-2242-9090', '2026-03-04 10:45:00');

-- ---------------------------------------------------------------------------
-- Suppliers
-- ---------------------------------------------------------------------------
INSERT INTO `suppliers` (`id`, `name`, `country_id`, `created_at`) VALUES
(1, 'Siemens Healthineers',  2,  '2026-01-12 09:20:00'),
(2, 'Olympus Medical',       3,  '2026-01-18 13:00:00'),
(3, 'Medtronic',             4,  '2026-02-02 10:15:00'),
(4, 'Mindray',               5,  '2026-02-14 16:40:00'),
(5, 'Smith & Nephew',        9,  '2026-03-01 08:30:00'),
(6, '3M Healthcare',         4,  '2026-03-20 11:05:00'),
(7, 'Stryker',               4,  '2026-04-08 14:22:00'),
(8, 'Philips Healthcare',   10,  '2026-04-25 09:50:00');

INSERT INTO `supplier_companies` (`supplier_id`, `company_id`) VALUES
(1, 1), (1, 4),
(2, 1), (2, 3),
(3, 2), (3, 3),
(4, 2), (4, 4),
(5, 2),
(6, 1), (6, 2),
(7, 3),
(8, 1), (8, 4);

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
INSERT INTO `products`
  (`id`, `code`, `model`, `mda_reg_no`, `description`, `product_image`, `mda_cert`, `supplier_id`, `is_active`, `created_at`)
VALUES
(1,  'USG-ACU-S2000', 'ACUSON S2000', 'GB123456789012',
    'Premium ultrasound system for general imaging, obstetrics, and vascular studies with high-resolution transducers.',
    NULL, NULL, 1, 1, '2026-01-20 10:00:00'),
(2,  'END-EVS-X1', 'EVIS X1', 'GB234567890123',
    'Video endoscopy platform with dual-focus imaging and narrow-band imaging for GI procedures.',
    NULL, NULL, 2, 1, '2026-01-28 14:30:00'),
(3,  'PM-INT-MX40', 'IntelliVue MX40', 'GB345678901234',
    'Wearable patient monitor for telemetry wards with ECG, SpO2, and NIBP trending.',
    NULL, NULL, 8, 1, '2026-02-06 09:15:00'),
(4,  'SUR-HAR-SI', 'Harmonic Scalpel SI', 'GB456789012345',
    'Ultrasonic cutting and coagulation instrument for laparoscopic and open surgery.',
    NULL, NULL, 3, 1, '2026-02-19 11:45:00'),
(5,  'ORT-TRI-GEN3', 'Triathlon Knee System', 'GB567890123456',
    'Primary total knee arthroplasty implant system with cementless and cemented options.',
    NULL, NULL, 7, 1, '2026-03-05 08:20:00'),
(6,  'WC-ALLEV-AG', 'Allevyn Ag Foam Dressing', 'GB678901234567',
    'Silver-impregnated foam dressing for moderately to highly exuding wounds.',
    NULL, NULL, 5, 1, '2026-03-12 13:10:00'),
(7,  'IC-3M-1860', 'N95 Particulate Respirator 1860', 'GB789012345678',
    'Healthcare particulate respirator for infection-control use in clinical settings.',
    NULL, NULL, 6, 1, '2026-03-22 16:00:00'),
(8,  'MON-BENE-N12', 'BeneVision N12', 'GB890123456789',
    'Bedside patient monitor with 12-inch display, multi-parameter modules, and EMR connectivity.',
    NULL, NULL, 4, 1, '2026-04-02 10:35:00'),
(9,  'IMG-DIG-DRX', 'DigitalRadiography DR-X', 'GB901234567890',
    'Floor-mounted digital X-ray system with wireless detector and dose-reduction software.',
    NULL, NULL, 1, 0, '2026-04-16 15:25:00'),
(10, 'REH-ROLL-A4', 'Rollator A4 Lite', 'GB012345678901',
    'Lightweight aluminium rollator with seat, brakes, and folding frame for outpatient rehab.',
    NULL, NULL, 4, 1, '2026-05-07 09:40:00'),
(11, 'LAP-TRO-5MM', 'Trocar 5mm Optical', 'GB112233445566',
    'Optical bladeless trocar for laparoscopic access with low-profile seal housing.',
    NULL, NULL, 3, 1, '2026-06-11 12:05:00'),
(12, 'DIS-STER-5L', 'Sterilox Surface Disinfectant 5L', 'GB223344556677',
    'Hospital-grade surface disinfectant concentrate for wards, theatres, and CSSD.',
    NULL, NULL, 6, 1, '2026-07-03 11:18:00');

INSERT INTO `product_types` (`product_id`, `type_id`) VALUES
(1, 11), (1, 14),
(2, 11), (2, 15),
(3, 11), (3, 16),
(4, 15),
(5, 13),
(6, 12),
(7, 12),
(8, 11), (8, 16),
(9, 11), (9, 14),
(10, 17),
(11, 12), (11, 15),
(12, 12), (12, 18);

INSERT INTO `product_categories` (`product_id`, `category_id`) VALUES
(1, 1), (1, 2),
(2, 4), (2, 5),
(3, 1), (3, 3),
(4, 4), (4, 5),
(5, 4), (5, 6),
(6, 7), (6, 8),
(7, 7), (7, 9),
(8, 1), (8, 3),
(9, 1), (9, 2),
(10, 10), (10, 11),
(11, 4), (11, 5),
(12, 7), (12, 9);

INSERT INTO `product_specifications` (`product_id`, `spec_key`, `spec_value`) VALUES
(1,  'Display', '21.5-inch LED'),
(1,  'Transducers', 'Convex, Linear, Endocavity'),
(1,  'Power', '100-240V AC'),
(2,  'Light source', 'LED 4K'),
(2,  'Processor', 'CV-1500'),
(2,  'Scope compatibility', 'GIF/CF HQ series'),
(3,  'Parameters', 'ECG, SpO2, NIBP, Resp'),
(3,  'Battery life', 'Up to 24 hours'),
(3,  'Connectivity', 'Wi-Fi / short-range radio'),
(4,  'Handpiece', 'Reusable'),
(4,  'Frequency', '55.5 kHz'),
(5,  'Sizes', '1–14'),
(5,  'Fixation', 'Cemented / cementless'),
(5,  'Material', 'Cobalt-chrome / UHMWPE'),
(6,  'Sizes', '10x10 cm, 15x15 cm, 20x20 cm'),
(6,  'Wear time', 'Up to 7 days'),
(7,  'Filter', 'N95 / P2'),
(7,  'Pack size', '20 pcs'),
(8,  'Screen', '12-inch capacitive touch'),
(8,  'Modules', 'ECG, SpO2, NIBP, IBP, EtCO2, Temp'),
(9,  'Detector', '17x17 wireless'),
(9,  'Generator', '65 kW'),
(10, 'Max user weight', '120 kg'),
(10, 'Folded size', '28 x 64 x 82 cm'),
(11, 'Diameter', '5 mm'),
(11, 'Length', '100 mm'),
(12, 'Volume', '5 litres'),
(12, 'Dilution', '1:50 / 1:100');

INSERT INTO `product_images` (`product_id`, `image_path`, `is_main`, `created_at`) VALUES
(1,  '/uploads/products/acuson-s2000-main.webp', 1, '2026-01-20 10:05:00'),
(1,  '/uploads/products/acuson-s2000-side.webp', 0, '2026-01-20 10:06:00'),
(2,  '/uploads/products/evis-x1-main.webp', 1, '2026-01-28 14:35:00'),
(3,  '/uploads/products/mx40-main.webp', 1, '2026-02-06 09:20:00'),
(4,  '/uploads/products/harmonic-si-main.webp', 1, '2026-02-19 11:50:00'),
(5,  '/uploads/products/triathlon-main.webp', 1, '2026-03-05 08:25:00'),
(6,  '/uploads/products/allevyn-ag-main.webp', 1, '2026-03-12 13:15:00'),
(8,  '/uploads/products/benevision-n12-main.webp', 1, '2026-04-02 10:40:00'),
(10, '/uploads/products/rollator-a4-main.webp', 1, '2026-05-07 09:45:00'),
(11, '/uploads/products/trocar-5mm-main.webp', 1, '2026-06-11 12:10:00');

-- ---------------------------------------------------------------------------
-- Marketing materials
-- ---------------------------------------------------------------------------
INSERT INTO `marketing_materials`
  (`id`, `name`, `category`, `company_id`, `file_path`, `file_type`, `created_at`)
VALUES
(1,  'ACUSON S2000 Product Brochure',           'BROCHURE',  1,    '/uploads/marketing/acuson-s2000-brochure.pdf', 'application/pdf', '2026-02-01 10:00:00'),
(2,  'LifeCare Imaging Portfolio',              'BROCHURE',  2,    '/uploads/marketing/lifecare-imaging.pdf', 'application/pdf', '2026-02-20 11:30:00'),
(3,  'General Wound Care Catalogue',            'BROCHURE',  NULL, '/uploads/marketing/wound-care-catalogue.pdf', 'application/pdf', '2026-03-15 09:10:00'),
(4,  'EVIS X1 Launch Flier',                    'FLIERS',    1,    '/uploads/marketing/evis-x1-flier.pdf', 'application/pdf', '2026-03-28 14:00:00'),
(5,  'N95 Stock Availability Flier',            'FLIERS',    2,    '/uploads/marketing/n95-stock-flier.pdf', 'application/pdf', '2026-04-10 16:20:00'),
(6,  'MediTech Exhibition Roll-Up',             'ROLL-UP',   1,    '/uploads/marketing/meditech-rollup.png', 'image/png', '2026-04-18 09:45:00'),
(7,  'SurgiPro Theatre Roll-Up',                'ROLL-UP',   3,    '/uploads/marketing/surgipro-rollup.png', 'image/png', '2026-05-02 13:15:00'),
(8,  'Patient Monitoring Poster A1',            'POSTER',    4,    '/uploads/marketing/monitoring-poster.png', 'image/png', '2026-05-21 10:30:00'),
(9,  'Infection Control Awareness Poster',      'POSTER',    NULL, '/uploads/marketing/infection-control-poster.png', 'image/png', '2026-06-06 15:40:00'),
(10, 'MediTech Booth Back-Drop 3x2m',           'BACK-DROP', 1,    '/uploads/marketing/meditech-backdrop.png', 'image/png', '2026-06-24 11:00:00'),
(11, 'VitalPath Diagnostics Back-Drop',         'BACK-DROP', 4,    '/uploads/marketing/vitalpath-backdrop.png', 'image/png', '2026-07-14 09:25:00');

INSERT INTO `product_marketing` (`product_id`, `material_id`) VALUES
(1, 1), (1, 2), (1, 6), (1, 10),
(2, 4), (2, 7),
(3, 8), (3, 10),
(6, 3),
(7, 5), (7, 9),
(8, 8), (8, 11),
(9, 2),
(12, 9);

-- ---------------------------------------------------------------------------
-- Product activity (spread across months for dashboard charts)
-- ---------------------------------------------------------------------------
INSERT INTO `product_activity_logs` (`product_id`, `activity_type`, `created_at`) VALUES
(1,  'product_updated',        '2026-01-21 09:10:00'),
(1,  'material_added',         '2026-02-01 10:05:00'),
(2,  'product_updated',        '2026-02-03 11:00:00'),
(3,  'product_updated',        '2026-02-08 08:40:00'),
(4,  'material_added',         '2026-02-20 12:15:00'),
(2,  'material_added',         '2026-03-28 14:05:00'),
(6,  'product_updated',        '2026-03-13 10:00:00'),
(7,  'product_updated',        '2026-03-23 09:30:00'),
(7,  'material_added',         '2026-04-10 16:25:00'),
(9,  'product_status_updated', '2026-04-17 08:00:00'),
(8,  'product_updated',        '2026-04-03 13:20:00'),
(8,  'material_updated',       '2026-05-21 10:35:00'),
(10, 'product_updated',        '2026-05-08 11:10:00'),
(5,  'product_updated',        '2026-05-19 15:45:00'),
(11, 'product_updated',        '2026-06-12 09:00:00'),
(12, 'material_added',         '2026-06-06 15:45:00'),
(1,  'material_updated',       '2026-06-24 11:10:00'),
(12, 'product_updated',        '2026-07-04 10:00:00'),
(8,  'material_added',         '2026-07-14 09:30:00'),
(4,  'product_updated',        '2026-08-05 14:20:00');

-- ---------------------------------------------------------------------------
-- Events
-- ---------------------------------------------------------------------------
INSERT INTO `events` (`id`, `name`, `location`, `start_date`, `end_date`, `created_at`) VALUES
(1, 'Malaysia Healthcare Expo 2026',           'KLCC, Kuala Lumpur',           '2026-03-18', '2026-03-20', '2026-02-10 09:00:00'),
(2, 'ASEAN Endoscopy Workshop',                'Penang Convention Centre',     '2026-05-12', '2026-05-13', '2026-03-30 11:20:00'),
(3, 'National Wound Care Symposium',           'Shangri-La, Kuala Lumpur',     '2026-06-25', '2026-06-26', '2026-05-08 10:15:00'),
(4, 'Patient Monitoring Roadshow',             'Johor Bahru City Square',      '2026-08-04', '2026-08-05', '2026-07-01 13:40:00');

INSERT INTO `event_links` (`event_id`, `title`, `url`) VALUES
(1, 'Expo website',        'https://example.com/mhe-2026'),
(1, 'Booth map',           'https://example.com/mhe-2026/booth'),
(2, 'Workshop agenda',     'https://example.com/endoscopy-workshop'),
(3, 'Registration form',   'https://example.com/wound-care-symposium'),
(4, 'Roadshow schedule',   'https://example.com/monitoring-roadshow');

INSERT INTO `product_events` (`product_id`, `event_id`) VALUES
(1, 1), (8, 1), (9, 1),
(2, 2), (4, 2), (11, 2),
(6, 3), (12, 3),
(3, 4), (8, 4);

-- ---------------------------------------------------------------------------
-- Testimonies
-- ---------------------------------------------------------------------------
INSERT INTO `testimonies`
  (`id`, `client_name`, `location`, `start_date`, `end_date`, `treatment`, `created_at`)
VALUES
(1, 'Sunway Medical Centre',          'Petaling Jaya, Selangor', '2025-09-01', '2026-03-01', 'Ultrasound imaging upgrade',     '2026-03-08 10:00:00'),
(2, 'Hospital Pulau Pinang',          'George Town, Penang',     '2025-11-15', '2026-04-30', 'GI endoscopy suite refresh',     '2026-05-02 09:30:00'),
(3, 'KPJ Ampang Puteri',              'Ampang, Selangor',        '2026-01-10', '2026-06-10', 'Ward telemetry rollout',         '2026-06-18 14:10:00'),
(4, 'Gleneagles Hospital Kuala Lumpur','Kuala Lumpur',           '2026-02-01', '2026-07-15', 'Orthopedic implant programme',   '2026-07-20 11:45:00');

INSERT INTO `testimony_links` (`testimony_id`, `title`, `url`) VALUES
(1, 'Case study PDF',  'https://example.com/testimony/sunway-ultrasound'),
(1, 'Video interview', 'https://example.com/testimony/sunway-video'),
(2, 'Department quote','https://example.com/testimony/hpp-endoscopy'),
(3, 'Nursing feedback','https://example.com/testimony/kpj-telemetry'),
(4, 'Surgeon review',  'https://example.com/testimony/gleneagles-knee');

INSERT INTO `product_testimonies` (`product_id`, `testimony_id`) VALUES
(1, 1), (9, 1),
(2, 2),
(3, 3), (8, 3),
(5, 4);

-- ---------------------------------------------------------------------------
-- Packages
-- ---------------------------------------------------------------------------
INSERT INTO `packages` (`id`, `name`, `description`, `bundle_label`, `main_image`, `created_at`) VALUES
(1, 'Imaging Starter Suite',
    'Core diagnostic imaging bundle for new outpatient centres: ultrasound plus digital radiography.',
    'Starter Bundle', NULL, '2026-04-20 10:00:00'),
(2, 'Theatre Laparoscopic Kit',
    'Endoscopy platform with harmonic energy device and optical trocars for day-surgery theatres.',
    'OT Bundle', NULL, '2026-05-28 09:30:00'),
(3, 'Ward Infection Control Pack',
    'Consumable pack covering respirators, wound dressings, and surface disinfectant for ward stocking.',
    'Ward Pack', NULL, '2026-07-08 14:00:00');

INSERT INTO `package_products` (`package_id`, `product_id`, `sort_order`) VALUES
(1, 1, 0), (1, 9, 1),
(2, 2, 0), (2, 4, 1), (2, 11, 2),
(3, 7, 0), (3, 6, 1), (3, 12, 2);

INSERT INTO `package_specs` (`package_id`, `icon`, `spec_text`, `sort_order`) VALUES
(1, 'fa-solid fa-microscope',      'Includes ultrasound and digital X-ray platforms', 0),
(1, 'fa-solid fa-certificate',     'MDA-registered capital equipment', 1),
(1, 'fa-solid fa-truck-fast',      'Installation and applications training included', 2),
(2, 'fa-solid fa-stethoscope',     'Complete laparoscopic visualisation stack', 0),
(2, 'fa-solid fa-kit-medical',     'Energy device and 5mm optical trocars', 1),
(2, 'fa-solid fa-user-doctor',     'Suitable for general and GI day surgery', 2),
(3, 'fa-solid fa-shield-medical',  'N95 respirators and hospital disinfectant', 0),
(3, 'fa-solid fa-heart-pulse',     'Silver foam dressings for wound care', 1),
(3, 'fa-solid fa-list-check',      'Ready for CSSD and ward replenishment', 2);

ALTER TABLE `users` AUTO_INCREMENT = 7;
ALTER TABLE `settings` AUTO_INCREMENT = 19;
ALTER TABLE `categories` AUTO_INCREMENT = 12;
ALTER TABLE `affiliated_companies` AUTO_INCREMENT = 5;
ALTER TABLE `suppliers` AUTO_INCREMENT = 9;
ALTER TABLE `products` AUTO_INCREMENT = 13;
ALTER TABLE `marketing_materials` AUTO_INCREMENT = 12;
ALTER TABLE `events` AUTO_INCREMENT = 5;
ALTER TABLE `testimonies` AUTO_INCREMENT = 5;
ALTER TABLE `packages` AUTO_INCREMENT = 4;
