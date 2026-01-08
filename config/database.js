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
                role ENUM('Admin', 'Product Specialist', 'User') NOT NULL DEFAULT 'User',
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
                country VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
                reg_no VARCHAR(100),
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
                type_value VARCHAR(255),
                PRIMARY KEY (product_id, type_value),
                FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
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
                file_path VARCHAR(255) NOT NULL,
                file_type VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        `;

        await connection.query(createTablesSql);

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

        const [rows] = await connection.query('SELECT * FROM users WHERE email = ?', ['admin@admin.com']);
        if (rows.length === 0) {
            const hashedPassword = await bcrypt.hash('1234567890', 10);
            await connection.query('INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
                ['admin@admin.com', hashedPassword, 'Admin']);
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
