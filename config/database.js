const mysql = require('mysql2/promise');
const mysqlSync = require('mysql2');
require('dotenv').config();
const bcrypt = require('bcrypt');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
};

// Session store configuration (uses synchronous mysql2 connection)
const sessionStoreConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'product_catalog',
    clearExpired: true,
    checkExpirationInterval: 900000, // 15 minutes
    expiration: 86400000, // 24 hours
    createDatabaseTable: true,
    connectionLimit: 1,
    endConnectionOnClose: true,
    charset: 'utf8mb4_bin',
    schema: {
        tableName: 'sessions',
        columnNames: {
            session_id: 'session_id',
            expires: 'expires',
            data: 'data'
        }
    }
};

async function initializeDatabase() {
    let connection;
    try {
        connection = await mysql.createConnection(dbConfig);

        await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'product_catalog'}\`;`);
        await connection.query(`USE \`${process.env.DB_NAME || 'product_catalog'}\`;`);

        const createTablesSql = `
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                email VARCHAR(255) NOT NULL UNIQUE,
                password VARCHAR(255) NOT NULL,
                role ENUM('Super Admin', 'Admin', 'Product Specialist', 'Graphic Designer') NOT NULL DEFAULT 'Product Specialist',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS settings (
                id INT AUTO_INCREMENT PRIMARY KEY,
                type VARCHAR(50) NOT NULL,
                value VARCHAR(255) NOT NULL,
                UNIQUE KEY unique_setting (type, value)
            );

            CREATE TABLE IF NOT EXISTS categories (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                parent_id INT DEFAULT NULL,
                FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS affiliated_companies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                shortname VARCHAR(100) UNIQUE,
                logo VARCHAR(255),
                reg_no VARCHAR(100),
                reg_date DATE,
                address TEXT,
                website VARCHAR(255),
                email VARCHAR(255),
                contact_number VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS suppliers (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                country_id INT DEFAULT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (country_id) REFERENCES settings(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS supplier_companies (
                supplier_id INT,
                company_id INT,
                PRIMARY KEY (supplier_id, company_id),
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
                FOREIGN KEY (company_id) REFERENCES affiliated_companies(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS products (
                id INT AUTO_INCREMENT PRIMARY KEY,
                code VARCHAR(100) NOT NULL,
                model VARCHAR(100),
                mda_reg_no VARCHAR(100),
                description TEXT,
                product_image VARCHAR(255),
                mda_cert VARCHAR(255),
                supplier_id INT DEFAULT NULL,
                FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS product_types (
                product_id INT,
                type_id INT,
                PRIMARY KEY (product_id, type_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (type_id) REFERENCES settings(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS product_categories (
                product_id INT,
                category_id INT,
                PRIMARY KEY (product_id, category_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS product_specifications (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT,
                spec_key VARCHAR(255),
                spec_value TEXT,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS product_images (
                id INT AUTO_INCREMENT PRIMARY KEY,
                product_id INT NOT NULL,
                image_path VARCHAR(255) NOT NULL,
                is_main BOOLEAN DEFAULT FALSE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                INDEX idx_product_main (product_id, is_main)
            );

            CREATE TABLE IF NOT EXISTS marketing_materials (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255),
                category VARCHAR(50) DEFAULT 'BROCHURE',
                company_id INT DEFAULT NULL,
                file_path VARCHAR(255) NOT NULL,
                file_type VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (company_id) REFERENCES affiliated_companies(id) ON DELETE SET NULL
            );

            CREATE TABLE IF NOT EXISTS product_marketing (
                product_id INT,
                material_id INT,
                PRIMARY KEY (product_id, material_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (material_id) REFERENCES marketing_materials(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                location VARCHAR(255),
                start_date DATE,
                end_date DATE,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS event_links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_id INT,
                title VARCHAR(255),
                url TEXT,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS product_events (
                product_id INT,
                event_id INT,
                PRIMARY KEY (product_id, event_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS testimonies (
                id INT AUTO_INCREMENT PRIMARY KEY,
                client_name VARCHAR(255) NOT NULL,
                location VARCHAR(255),
                start_date DATE,
                end_date DATE,
                treatment VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS testimony_links (
                id INT AUTO_INCREMENT PRIMARY KEY,
                testimony_id INT,
                title VARCHAR(255),
                url TEXT,
                FOREIGN KEY (testimony_id) REFERENCES testimonies(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS product_testimonies (
                product_id INT,
                testimony_id INT,
                PRIMARY KEY (product_id, testimony_id),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
                FOREIGN KEY (testimony_id) REFERENCES testimonies(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS packages (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                bundle_label VARCHAR(255),
                main_image TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS package_products (
                package_id INT,
                product_id INT,
                sort_order INT DEFAULT 0,
                PRIMARY KEY (package_id, product_id),
                FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS package_specs (
                id INT AUTO_INCREMENT PRIMARY KEY,
                package_id INT,
                icon VARCHAR(255) DEFAULT 'fa-solid fa-circle',
                spec_text TEXT,
                sort_order INT DEFAULT 0,
                FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE
            );
        `;

        await connection.query(createTablesSql);

        // Migration: Transition product_types from raw text to type_id
        try {
            const [typeColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_types' AND COLUMN_NAME = 'type_id'
            `, [process.env.DB_NAME || 'product_catalog']);

            const [checkTypeValueColumn] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_types' AND COLUMN_NAME = 'type_value'
            `, [process.env.DB_NAME || 'product_catalog']);

            if (checkTypeValueColumn.length > 0) {
                if (typeColumns.length === 0) {
                    await connection.query('ALTER TABLE product_types ADD COLUMN type_id INT');
                }

                // Migrate data
                await connection.query(`
                    UPDATE product_types pt
                    JOIN settings st ON pt.type_value = st.value
                    SET pt.type_id = st.id
                    WHERE st.type = 'product_type'
                `);

                // Drop old column after migration
                await connection.query('ALTER TABLE product_types DROP COLUMN type_value');
            }

            // EXTREMELY ROBUST PK FIX:
            // 1. Get current primary key columns
            const [pkColumns] = await connection.query(`
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'product_types' AND CONSTRAINT_NAME = 'PRIMARY'
            `, [process.env.DB_NAME || 'product_catalog']);

            const hasCompositePK = pkColumns.length === 2 &&
                pkColumns.some(c => c.COLUMN_NAME === 'product_id') &&
                pkColumns.some(c => c.COLUMN_NAME === 'type_id');

            if (!hasCompositePK) {
                console.log('⚡ Normalizing product_types primary key...');
                // To safely change PK, we might need to drop FKs first if they depend on it
                try {
                    // Try dropping the PK directly first
                    await connection.query('ALTER TABLE product_types DROP PRIMARY KEY');
                } catch (e) {
                    console.log('Note: Drop PK failed or not found, continuing...');
                }

                // Remove any rogue unique indices on product_id
                try {
                    await connection.query('DROP INDEX product_id ON product_types');
                } catch (e) { }

                // Add the correct composite PK
                await connection.query('ALTER TABLE product_types ADD PRIMARY KEY (product_id, type_id)');

                // Ensure type_id has its FK
                try {
                    await connection.query('ALTER TABLE product_types ADD FOREIGN KEY (type_id) REFERENCES settings(id) ON DELETE CASCADE');
                } catch (e) { }

                console.log('✓ Fixed product_types composite primary key');
            }
        } catch (migrationError) {
            console.log('Migration for product_types failed or skipped:', migrationError.message);
        }

        // Migration: Drop reg_no from products if it exists
        try {
            const [checkRegNo] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'reg_no'
            `, [process.env.DB_NAME || 'product_catalog']);

            if (checkRegNo.length > 0) {
                await connection.query('ALTER TABLE products DROP COLUMN reg_no');
                console.log('✓ Dropped reg_no column from products');
            }
        } catch (err) {
            console.log('Migration to drop reg_no skipped:', err.message);
        }

        // Migration: Transition suppliers country from raw text to country_id
        try {
            const [countryColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'country_id'
            `, [process.env.DB_NAME || 'product_catalog']);

            // If the table exists but doesn't have country_id, OR if we want to ensure data is migrated
            // Since we updated CREATE TABLE, new installations are fine.
            // For existing installations, we might need to add the column if it was created before our change.

            const [checkTextColumn] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'suppliers' AND COLUMN_NAME = 'country'
            `, [process.env.DB_NAME || 'product_catalog']);

            if (checkTextColumn.length > 0) {
                // If country (text) exists, check if country_id exists
                if (countryColumns.length === 0) {
                    await connection.query(`
                        ALTER TABLE suppliers 
                        ADD COLUMN country_id INT DEFAULT NULL,
                        ADD FOREIGN KEY (country_id) REFERENCES settings(id) ON DELETE SET NULL
                    `);
                    console.log('✓ Added country_id column to suppliers table');
                }

                // Migrate data from 'country' text column to country_id
                await connection.query(`
                    UPDATE suppliers s
                    JOIN settings st ON s.country = st.value
                    SET s.country_id = st.id
                    WHERE st.type = 'country' AND s.country_id IS NULL
                `);
                console.log('✓ Migrated supplier countries to country_id');

                // Note: We keep the old column for now to avoid breaking things if migration fails half-way
                // or if the user wants to keep it as backup.
            }
        } catch (migrationError) {
            console.log('Migration for suppliers.country_id skipped or failed:', migrationError.message);
        }

        // Migration: Update file_type column size if it exists and is too small
        try {
            const [columns] = await connection.query(`
                SELECT COLUMN_TYPE FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'marketing_materials' AND COLUMN_NAME = 'file_type'
            `, [process.env.DB_NAME || 'product_catalog']);

            if (columns.length > 0 && columns[0].COLUMN_TYPE.includes('varchar(50)')) {
                await connection.query('ALTER TABLE marketing_materials MODIFY COLUMN file_type VARCHAR(255)');
                console.log('✓ Updated marketing_materials.file_type column size');
            }
        } catch (migrationError) {
            console.log('Migration check skipped (table may not exist yet)');
        }

        // Migration: Add shortname column to affiliated_companies (renamed from subdomain)
        try {
            const [shortnameColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'affiliated_companies' AND COLUMN_NAME = 'shortname'
            `, [process.env.DB_NAME || 'product_catalog']);

            if (shortnameColumns.length === 0) {
                // Check if old 'subdomain' column exists to rename it
                const [oldSubdomainColumns] = await connection.query(`
                    SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                    WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'affiliated_companies' AND COLUMN_NAME = 'subdomain'
                `, [process.env.DB_NAME || 'product_catalog']);

                if (oldSubdomainColumns.length > 0) {
                    await connection.query(`
                        ALTER TABLE affiliated_companies 
                        RENAME COLUMN subdomain TO shortname
                    `);
                    console.log('✓ Renamed column subdomain to shortname');
                } else {
                    await connection.query(`
                        ALTER TABLE affiliated_companies 
                        ADD COLUMN shortname VARCHAR(100) UNIQUE AFTER name
                    `);
                    console.log('✓ Added shortname column to affiliated_companies table');
                }
            }
        } catch (migrationError) {
            console.log('Migration check for shortname skipped:', migrationError.message);
        }

        // Migration: Add supplier_id column to products table if it doesn't exist
        try {
            const [supplierColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'products' AND COLUMN_NAME = 'supplier_id'
            `, [process.env.DB_NAME || 'product_catalog']);

            if (supplierColumns.length === 0) {
                await connection.query(`
                    ALTER TABLE products 
                    ADD COLUMN supplier_id INT DEFAULT NULL,
                    ADD FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL
                `);
                console.log('✓ Added supplier_id column to products table');
            }
        } catch (migrationError) {
            console.log('Migration check for supplier_id skipped (table may not exist yet)');
        }

        // Migration for Packages enhancements
        try {
            const dbName = process.env.DB_NAME || 'product_catalog';

            // Check bundle_label and main_image in packages
            const [pkgColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'packages' AND COLUMN_NAME IN ('bundle_label', 'main_image')
            `, [dbName]);

            if (pkgColumns.length < 2) {
                const existingCols = pkgColumns.map(c => c.COLUMN_NAME);
                if (!existingCols.includes('bundle_label')) {
                    await connection.query('ALTER TABLE packages ADD COLUMN bundle_label VARCHAR(255) AFTER description');
                    console.log('✓ Added bundle_label column to packages table');
                }
                if (!existingCols.includes('main_image')) {
                    await connection.query('ALTER TABLE packages ADD COLUMN main_image TEXT AFTER bundle_label');
                    console.log('✓ Added main_image column to packages table');
                }
            }

            // Check sort_order in package_products
            const [ppColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'package_products' AND COLUMN_NAME = 'sort_order'
            `, [dbName]);

            if (ppColumns.length === 0) {
                await connection.query('ALTER TABLE package_products ADD COLUMN sort_order INT DEFAULT 0');
                console.log('✓ Added sort_order column to package_products table');
            }
        } catch (migrationError) {
            console.log('Migration check for packages enhancements failed:', migrationError.message);
        }

        // Migration: Add category and company_id to marketing_materials
        try {
            const dbName = process.env.DB_NAME || 'product_catalog';
            const [materialColumns] = await connection.query(`
                SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'marketing_materials' AND COLUMN_NAME IN ('category', 'company_id')
            `, [dbName]);

            if (materialColumns.length < 2) {
                const existingCols = materialColumns.map(c => c.COLUMN_NAME);
                if (!existingCols.includes('category')) {
                    await connection.query("ALTER TABLE marketing_materials ADD COLUMN category VARCHAR(50) DEFAULT 'BROCHURE' AFTER name");
                    console.log('✓ Added category column to marketing_materials');
                }
                if (!existingCols.includes('company_id')) {
                    await connection.query("ALTER TABLE marketing_materials ADD COLUMN company_id INT DEFAULT NULL AFTER category");
                    await connection.query("ALTER TABLE marketing_materials ADD FOREIGN KEY (company_id) REFERENCES affiliated_companies(id) ON DELETE SET NULL");
                    console.log('✓ Added company_id column to marketing_materials');
                }
            }
        } catch (migrationError) {
            console.log('Migration for marketing_materials category/company failed or skipped:', migrationError.message);
        }

        // Migration: Update users role enum
        try {
            // First update any existing 'User' roles to 'Product Specialist' to prevent data loss
            await connection.query("UPDATE users SET role = 'Product Specialist' WHERE role = 'User'");

            await connection.query(`
                ALTER TABLE users 
                MODIFY COLUMN role ENUM('Super Admin', 'Admin', 'Product Specialist', 'Graphic Designer') 
                NOT NULL DEFAULT 'Product Specialist'
            `);
            console.log('✓ Updated users role enum to include Super Admin');
        } catch (err) {
            console.log('Migration for users role enum skipped:', err.message);
        }

        const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', ['admin@admin.com']);
        if (rows.length === 0) {
            const hashedPassword = await bcrypt.hash('1234567890', 10);
            await connection.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
                ['admin@admin.com', hashedPassword, 'Super Admin']);
        }

        const [superAdminRows] = await connection.query('SELECT * FROM users WHERE email = ?', ['superadmin@admin.com']);
        if (superAdminRows.length === 0) {
            const hashedSuperPassword = await bcrypt.hash('1234567890', 10);
            await connection.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
                ['superadmin@admin.com', hashedSuperPassword, 'Super Admin']);
        }

    } catch (error) {
        console.error('Database initialization failed:', error);
        process.exit(1);
    } finally {
        if (connection) await connection.end();
    }
}

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'product_catalog',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = {
    initializeDatabase,
    pool,
    sessionStoreConfig
};
