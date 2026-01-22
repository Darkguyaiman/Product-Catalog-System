const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure Multer for package image
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/packages';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

// List packages
router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        let query = 'SELECT * FROM packages';
        const params = [];

        if (search) {
            query += ' WHERE name LIKE ? OR description LIKE ?';
            const term = `%${search}%`;
            params.push(term, term);
        }

        query += ' ORDER BY created_at DESC';

        const [packages] = await pool.query(query, params);
        res.render('packages/index', { packages, search: search || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Create package form
router.get('/create', async (req, res) => {
    try {
        const [products] = await pool.query('SELECT id, model, code FROM products ORDER BY model ASC');
        res.render('packages/create', { products });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// Create package action
router.post('/create', upload.single('main_image'), async (req, res) => {
    const { name, description, bundle_label, product_ids, spec_icons, spec_texts } = req.body;
    const main_image = req.file ? `/uploads/packages/${req.file.filename}` : null;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query(
            'INSERT INTO packages (name, description, bundle_label, main_image) VALUES (?, ?, ?, ?)',
            [name, description, bundle_label, main_image]
        );
        const packageId = result.insertId;

        // Handle products with sort order
        if (product_ids) {
            const ids = Array.isArray(product_ids) ? product_ids : [product_ids];
            for (let i = 0; i < ids.length; i++) {
                await connection.query(
                    'INSERT INTO package_products (package_id, product_id, sort_order) VALUES (?, ?, ?)',
                    [packageId, ids[i], i]
                );
            }
        }

        // Handle specs
        if (spec_texts) {
            const texts = Array.isArray(spec_texts) ? spec_texts : [spec_texts];
            const icons = Array.isArray(spec_icons) ? spec_icons : [spec_icons];
            for (let i = 0; i < texts.length; i++) {
                if (texts[i].trim()) {
                    await connection.query(
                        'INSERT INTO package_specs (package_id, icon, spec_text, sort_order) VALUES (?, ?, ?, ?)',
                        [packageId, icons[i] || 'fa-solid fa-circle', texts[i], i]
                    );
                }
            }
        }

        await connection.commit();
        res.redirect('/admin/packages');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/packages/create?error=Failed to create package');
    } finally {
        if (connection) connection.release();
    }
});

// Edit package form
router.get('/edit/:id', async (req, res) => {
    try {
        const [packages] = await pool.query('SELECT * FROM packages WHERE id = ?', [req.params.id]);
        if (packages.length === 0) return res.redirect('/admin/packages');

        const [products] = await pool.query('SELECT id, model, code FROM products ORDER BY model ASC');

        // Fetch selected products with their sort order
        const [packageProducts] = await pool.query(
            'SELECT product_id FROM package_products WHERE package_id = ? ORDER BY sort_order ASC',
            [req.params.id]
        );
        const selectedProductIds = packageProducts.map(pp => pp.product_id);

        // Fetch specs
        const [specs] = await pool.query(
            'SELECT * FROM package_specs WHERE package_id = ? ORDER BY sort_order ASC',
            [req.params.id]
        );

        res.render('packages/edit', {
            package: packages[0],
            products,
            selectedProductIds,
            specs,
            error: req.query.error
        });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/packages');
    }
});

// Edit package action
router.post('/edit/:id', upload.single('main_image'), async (req, res) => {
    const { name, description, bundle_label, product_ids, spec_icons, spec_texts } = req.body;
    const packageId = req.params.id;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Handle image update
        let imageUpdateSql = 'UPDATE packages SET name = ?, description = ?, bundle_label = ? WHERE id = ?';
        let imageUpdateParams = [name, description, bundle_label, packageId];

        if (req.file) {
            imageUpdateSql = 'UPDATE packages SET name = ?, description = ?, bundle_label = ?, main_image = ? WHERE id = ?';
            imageUpdateParams = [name, description, bundle_label, `/uploads/packages/${req.file.filename}`, packageId];
        }

        await connection.query(imageUpdateSql, imageUpdateParams);

        // Update products: delete old ones and insert new ones with order
        await connection.query('DELETE FROM package_products WHERE package_id = ?', [packageId]);
        if (product_ids) {
            const ids = Array.isArray(product_ids) ? product_ids : [product_ids];
            for (let i = 0; i < ids.length; i++) {
                await connection.query(
                    'INSERT INTO package_products (package_id, product_id, sort_order) VALUES (?, ?, ?)',
                    [packageId, ids[i], i]
                );
            }
        }

        // Update specs: delete old ones and insert new ones
        await connection.query('DELETE FROM package_specs WHERE package_id = ?', [packageId]);
        if (spec_texts) {
            const texts = Array.isArray(spec_texts) ? spec_texts : [spec_texts];
            const icons = Array.isArray(spec_icons) ? spec_icons : [spec_icons];
            for (let i = 0; i < texts.length; i++) {
                if (texts[i].trim()) {
                    await connection.query(
                        'INSERT INTO package_specs (package_id, icon, spec_text, sort_order) VALUES (?, ?, ?, ?)',
                        [packageId, icons[i] || 'fa-solid fa-circle', texts[i], i]
                    );
                }
            }
        }

        await connection.commit();
        res.redirect('/admin/packages');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect(`/admin/packages/edit/${packageId}?error=Failed to update package`);
    } finally {
        if (connection) connection.release();
    }
});

// Delete package
router.post('/delete/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM packages WHERE id = ?', [req.params.id]);
        res.redirect('/admin/packages');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/packages?error=Failed to delete package');
    }
});

module.exports = router;
