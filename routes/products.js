const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Configure Multer (Memory Storage for Sharp processing of images, direct save for PDFs if needed manually)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const handleUploads = upload.fields([
    { name: 'mda_cert', maxCount: 1 },
    { name: 'product_image', maxCount: 1 }
]);

router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

// Helper to get all child category IDs recursively
function getCategoryChildIds(allCategories, parentId) {
    let ids = [parseInt(parentId)];
    const children = allCategories.filter(c => c.parent_id === parseInt(parentId));
    for (const child of children) {
        ids = ids.concat(getCategoryChildIds(allCategories, child.id));
    }
    return ids;
}

router.get('/', async (req, res) => {
    try {
        const { search, category } = req.query;
        let query = "SELECT * FROM products";
        const params = [];
        const conditions = [];

        // Fetch all categories for filter dropdown and recursion logic
        const [allCategories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");

        if (search) {
            // Simple text search
            conditions.push("(model LIKE ? OR code LIKE ? OR description LIKE ? OR reg_no LIKE ?)");
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        if (category) {
            // Recursive category filter
            // 1. Get all category IDs (parent + children)
            const familyIds = getCategoryChildIds(allCategories, category);

            // 2. Filter products that belong to ANY of these categories
            if (familyIds.length > 0) {
                // Safe injection since familyIds are integers from logic
                conditions.push(`id IN (SELECT product_id FROM product_categories WHERE category_id IN (${familyIds.join(',')}))`);
            }
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY id DESC";

        const [products] = await pool.query(query, params);

        // Pass necessary data to view
        res.render('products/index', {
            products,
            categories: allCategories,
            search: search || '',
            selectedCategory: category || ''
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/create', async (req, res) => {
    try {
        const [types] = await pool.query("SELECT * FROM settings WHERE type = 'product_type'");
        const [categories] = await pool.query("SELECT * FROM categories");
        res.render('products/create', { types, categories });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/edit/:id', async (req, res) => {
    try {
        const [products] = await pool.query("SELECT * FROM products WHERE id = ?", [req.params.id]);
        if (products.length === 0) return res.redirect('/admin/products');

        const product = products[0];

        // Fetch related data
        const [types] = await pool.query("SELECT * FROM settings WHERE type = 'product_type'");
        const [categories] = await pool.query("SELECT * FROM categories");
        const [prodTypes] = await pool.query("SELECT type_value FROM product_types WHERE product_id = ?", [product.id]);
        const [prodCats] = await pool.query("SELECT category_id FROM product_categories WHERE product_id = ?", [product.id]);
        const [specs] = await pool.query("SELECT spec_key as `key`, spec_value as `value` FROM product_specifications WHERE product_id = ?", [product.id]);

        product.product_types = prodTypes.map(t => t.type_value);
        product.categories = prodCats.map(c => c.category_id);
        product.specs = specs;

        res.render('products/edit', { product, types, categories });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products');
    }
});

// Helper function to process files
async function processFiles(files) {
    let mda_cert_path = null;
    let product_image_path = null;

    // Handle MDA Cert (PDF or Image - Save directly if PDF, resize if Image?)
    if (files['mda_cert']) {
        const file = files['mda_cert'][0];
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase();
        const mkdir = (dir) => { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); };

        const uploadDir = path.join(__dirname, '../public/uploads/products');
        mkdir(uploadDir);

        if (ext === '.pdf') {
            const filename = `cert-${uniqueSuffix}${ext}`;
            fs.writeFileSync(path.join(uploadDir, filename), file.buffer);
            mda_cert_path = '/uploads/products/' + filename;
        } else {
            // It's an image, let's optimize it lightly but keep it as a cert
            const filename = `cert-${uniqueSuffix}.webp`;
            await sharp(file.buffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80 })
                .toFile(path.join(uploadDir, filename));
            mda_cert_path = '/uploads/products/' + filename;
        }
    }

    // Handle Product Image (Strictly Image - Process like Companies)
    if (files['product_image']) {
        const file = files['product_image'][0];
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const uploadDir = path.join(__dirname, '../public/uploads/products');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const filename = `prod-${uniqueSuffix}.webp`;
        try {
            await sharp(file.buffer)
                .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80, effort: 2 })
                .toFile(path.join(uploadDir, filename));
            product_image_path = '/uploads/products/' + filename;
        } catch (e) {
            console.error('Sharp error processing product image:', e);
        }
    }

    return { mda_cert_path, product_image_path };
}

router.post('/create', handleUploads, async (req, res) => {
    const {
        code, model, reg_no, mda_reg_no, description,
        product_types, product_categories,
        spec_key, spec_value
    } = req.body;

    let connection;
    try {
        const paths = await processFiles(req.files || {});

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Insert Product
        const [result] = await connection.query(
            "INSERT INTO products (code, model, reg_no, mda_reg_no, description, mda_cert, product_image) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [code, model, reg_no, mda_reg_no, description, paths.mda_cert_path, paths.product_image_path]
        );
        const productId = result.insertId;

        // Insert Types
        if (product_types) {
            const types = Array.isArray(product_types) ? product_types : [product_types];
            const typeValues = types.map(t => [productId, t]);
            await connection.query("INSERT INTO product_types (product_id, type_value) VALUES ?", [typeValues]);
        }

        // Insert Categories
        if (product_categories) {
            const cats = Array.isArray(product_categories) ? product_categories : [product_categories];
            const catValues = cats.map(c => [productId, c]);
            await connection.query("INSERT INTO product_categories (product_id, category_id) VALUES ?", [catValues]);
        }

        // Insert Specifications
        if (spec_key && spec_value) {
            const keys = Array.isArray(spec_key) ? spec_key : [spec_key];
            const values = Array.isArray(spec_value) ? spec_value : [spec_value];

            const specValues = [];
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] && values[i]) {
                    specValues.push([productId, keys[i], values[i]]);
                }
            }
            if (specValues.length > 0) {
                await connection.query("INSERT INTO product_specifications (product_id, spec_key, spec_value) VALUES ?", [specValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/products');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/products/create?error=Failed to create product');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/edit/:id', handleUploads, async (req, res) => {
    const {
        code, model, reg_no, mda_reg_no, description,
        product_types, product_categories,
        spec_key, spec_value,
        existing_mda_cert, mda_cert_removed,
        existing_product_image, product_image_removed
    } = req.body;

    let connection;
    try {
        const paths = await processFiles(req.files || {});

        // Determine final paths
        let finalCertPath = paths.mda_cert_path || existing_mda_cert;
        if (mda_cert_removed === 'true' && !paths.mda_cert_path) finalCertPath = null;

        let finalImagePath = paths.product_image_path || existing_product_image;
        if (product_image_removed === 'true' && !paths.product_image_path) finalImagePath = null;

        // Cleanup old files if replaced/removed
        if ((paths.mda_cert_path || mda_cert_removed === 'true') && existing_mda_cert) {
            const oldPath = path.join(__dirname, '../public', existing_mda_cert);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        if ((paths.product_image_path || product_image_removed === 'true') && existing_product_image) {
            const oldPath = path.join(__dirname, '../public', existing_product_image);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Update Product
        await connection.query(
            "UPDATE products SET code=?, model=?, reg_no=?, mda_reg_no=?, description=?, mda_cert=?, product_image=? WHERE id=?",
            [code, model, reg_no, mda_reg_no, description, finalCertPath, finalImagePath, req.params.id]
        );

        const productId = req.params.id;

        // Reset Relations
        await connection.query("DELETE FROM product_types WHERE product_id = ?", [productId]);
        await connection.query("DELETE FROM product_categories WHERE product_id = ?", [productId]);
        await connection.query("DELETE FROM product_specifications WHERE product_id = ?", [productId]);

        // Insert Types
        if (product_types) {
            const types = Array.isArray(product_types) ? product_types : [product_types];
            const typeValues = types.map(t => [productId, t]);
            await connection.query("INSERT INTO product_types (product_id, type_value) VALUES ?", [typeValues]);
        }

        // Insert Categories
        if (product_categories) {
            const cats = Array.isArray(product_categories) ? product_categories : [product_categories];
            const catValues = cats.map(c => [productId, c]);
            if (catValues.length > 0) {
                await connection.query("INSERT INTO product_categories (product_id, category_id) VALUES ?", [catValues]);
            }
        }

        // Insert Specifications
        if (spec_key && spec_value) {
            const keys = Array.isArray(spec_key) ? spec_key : [spec_key];
            const values = Array.isArray(spec_value) ? spec_value : [spec_value];

            const specValues = [];
            for (let i = 0; i < keys.length; i++) {
                if (keys[i] && values[i]) {
                    specValues.push([productId, keys[i], values[i]]);
                }
            }
            if (specValues.length > 0) {
                await connection.query("INSERT INTO product_specifications (product_id, spec_key, spec_value) VALUES ?", [specValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/products');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect(`/admin/products/edit/${req.params.id}?error=Failed to update product`);
    } finally {
        if (connection) connection.release();
    }
});

router.post('/delete/:id', async (req, res) => {
    try {
        // Cleanup files
        const [rows] = await pool.query("SELECT mda_cert, product_image FROM products WHERE id = ?", [req.params.id]);
        if (rows.length > 0) {
            if (rows[0].mda_cert) {
                const p = path.join(__dirname, '../public', rows[0].mda_cert);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
            if (rows[0].product_image) {
                const p = path.join(__dirname, '../public', rows[0].product_image);
                if (fs.existsSync(p)) fs.unlinkSync(p);
            }
        }

        await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products?error=Failed to delete');
    }
});

module.exports = router;
