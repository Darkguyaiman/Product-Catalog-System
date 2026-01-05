const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');

// Configure Multer for Marketing Uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const dir = 'public/uploads/marketing';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

// Helper to build WHERE clause
const buildWhere = (search, productId, linkTable, linkIdCol) => {
    let conditions = [];
    let params = [];

    if (search) {
        conditions.push(`(name LIKE ?)`);
        params.push(`%${search}%`);
    }

    if (productId) {
        conditions.push(`id IN (SELECT ${linkIdCol} FROM ${linkTable} WHERE product_id = ?)`);
        params.push(productId);
    }

    return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '', params };
};

const buildTestimonyWhere = (search, productId) => {
    let conditions = [];
    let params = [];

    if (search) {
        conditions.push(`(client_name LIKE ? OR treatment LIKE ? OR location LIKE ?)`);
        params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (productId) {
        conditions.push(`id IN (SELECT testimony_id FROM product_testimonies WHERE product_id = ?)`);
        params.push(productId);
    }

    return { where: conditions.length ? 'WHERE ' + conditions.join(' AND ') : '', params };
};

router.get('/', async (req, res) => {
    try {
        const { search, product_id } = req.query;

        // Materials
        const mQ = buildWhere(search, product_id, 'product_marketing', 'material_id');
        const [marketing] = await pool.query(`SELECT * FROM marketing_materials ${mQ.where} ORDER BY id DESC`, mQ.params);

        // Events
        const eQ = buildWhere(search, product_id, 'product_events', 'event_id');
        const [events] = await pool.query(`SELECT * FROM events ${eQ.where} ORDER BY start_date DESC`, eQ.params);

        // Testimonies
        const tQ = buildTestimonyWhere(search, product_id);
        const [testimonies] = await pool.query(`SELECT * FROM testimonies ${tQ.where} ORDER BY start_date DESC`, tQ.params);

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");

        res.render('marketing/index', { marketing, events, testimonies, products, search: search || '', selectedProduct: product_id || '' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// MATERIALS
// ==========================================

router.get('/materials/add', async (req, res) => {
    const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
    res.render('marketing/materials/add', { products });
});

router.post('/materials/add', upload.single('file'), async (req, res) => {
    const { name, product_ids } = req.body;
    let filePath = req.file ? '/uploads/marketing/' + req.file.filename : null;

    if (req.file && req.file.mimetype.startsWith('image/')) {
        try {
            const buffer = await sharp(req.file.path)
                .resize(1920, null, { withoutEnlargement: true })
                .jpeg({ quality: 80 })
                .toBuffer();
            fs.writeFileSync(req.file.path, buffer);
        } catch (e) { console.error("Compression error", e); }
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO marketing_materials (name, file_path, file_type) VALUES (?, ?, ?)", [name, filePath, req.file ? req.file.mimetype : 'unknown']);
        const materialId = result.insertId;

        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const values = pIds.map(pid => [pid, materialId]);
                await connection.query("INSERT INTO product_marketing (product_id, material_id) VALUES ?", [values]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing/materials/add?error=Failed');
    } finally {
        if (connection) connection.release();
    }
});

router.get('/materials/edit/:id', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT * FROM marketing_materials WHERE id = ?", [req.params.id]);
        if (rows.length === 0) return res.redirect('/admin/marketing');

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
        const [related] = await pool.query("SELECT product_id FROM product_marketing WHERE material_id = ?", [req.params.id]);

        const material = rows[0];
        material.product_ids = related.map(r => r.product_id);

        res.render('marketing/materials/edit', { material, products });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/marketing');
    }
});

router.post('/materials/edit/:id', upload.single('file'), async (req, res) => {
    const { name, product_ids } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        let filePath = undefined;
        let fileType = undefined;

        if (req.file) {
            filePath = '/uploads/marketing/' + req.file.filename;
            fileType = req.file.mimetype;

            if (req.file.mimetype.startsWith('image/')) {
                try {
                    const buffer = await sharp(req.file.path)
                        .resize(1920, null, { withoutEnlargement: true })
                        .jpeg({ quality: 80 })
                        .toBuffer();
                    fs.writeFileSync(req.file.path, buffer);
                } catch (e) { console.error("Compression error", e); }
            }
        }

        let query = "UPDATE marketing_materials SET name = ?";
        let params = [name];
        if (filePath) {
            query += ", file_path = ?, file_type = ?";
            params.push(filePath, fileType);
        }
        query += " WHERE id = ?";
        params.push(req.params.id);

        await connection.query(query, params);

        // Update Products
        await connection.query("DELETE FROM product_marketing WHERE material_id = ?", [req.params.id]);
        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const values = pIds.map(pid => [pid, req.params.id]);
                await connection.query("INSERT INTO product_marketing (product_id, material_id) VALUES ?", [values]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing');
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// EVENTS
// ==========================================

router.get('/events/add', async (req, res) => {
    const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
    res.render('marketing/events/add', { products });
});

router.post('/events/add', async (req, res) => {
    const { name, location, start_date, end_date, links, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO events (name, location, start_date, end_date) VALUES (?, ?, ?, ?)", [name, location, start_date, end_date]);
        const eventId = result.insertId;

        if (links) {
            const linkArr = Array.isArray(links) ? links : [links];
            const linkValues = linkArr.filter(l => l.trim() !== '').map(l => [eventId, l]);
            if (linkValues.length > 0) await connection.query("INSERT INTO event_links (event_id, url) VALUES ?", [linkValues]);
        }

        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const pValues = pIds.map(pid => [pid, eventId]);
                await connection.query("INSERT INTO product_events (product_id, event_id) VALUES ?", [pValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing/events/add?error=Failed');
    } finally {
        if (connection) connection.release();
    }
});

router.get('/events/edit/:id', async (req, res) => {
    try {
        const [events] = await pool.query("SELECT * FROM events WHERE id = ?", [req.params.id]);
        if (events.length === 0) return res.redirect('/admin/marketing');
        const event = events[0];

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
        const [related] = await pool.query("SELECT product_id FROM product_events WHERE event_id = ?", [event.id]);
        const [links] = await pool.query("SELECT url FROM event_links WHERE event_id = ?", [event.id]);

        event.product_ids = related.map(r => r.product_id);
        event.links = links.map(l => l.url);

        res.render('marketing/events/edit', { event, products });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/marketing');
    }
});

router.post('/events/edit/:id', async (req, res) => {
    const { name, location, start_date, end_date, links, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query("UPDATE events SET name=?, location=?, start_date=?, end_date=? WHERE id=?", [name, location, start_date, end_date, req.params.id]);

        // Links
        await connection.query("DELETE FROM event_links WHERE event_id = ?", [req.params.id]);
        if (links) {
            const linkArr = Array.isArray(links) ? links : [links];
            const linkValues = linkArr.filter(l => l.trim() !== '').map(l => [req.params.id, l]);
            if (linkValues.length > 0) await connection.query("INSERT INTO event_links (event_id, url) VALUES ?", [linkValues]);
        }

        // Products
        await connection.query("DELETE FROM product_events WHERE event_id = ?", [req.params.id]);
        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const pValues = pIds.map(pid => [pid, req.params.id]);
                await connection.query("INSERT INTO product_events (product_id, event_id) VALUES ?", [pValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing');
    } finally {
        if (connection) connection.release();
    }
});

// ==========================================
// TESTIMONIES
// ==========================================

router.get('/testimonies/add', async (req, res) => {
    const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
    res.render('marketing/testimonies/add', { products });
});

router.post('/testimonies/add', async (req, res) => {
    const { client_name, location, start_date, end_date, treatment, links, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO testimonies (client_name, location, start_date, end_date, treatment) VALUES (?, ?, ?, ?, ?)", [client_name, location, start_date, end_date, treatment]);
        const testimonyId = result.insertId;

        if (links) {
            const linkArr = Array.isArray(links) ? links : [links];
            const linkValues = linkArr.filter(l => l.trim() !== '').map(l => [testimonyId, l]);
            if (linkValues.length > 0) await connection.query("INSERT INTO testimony_links (testimony_id, url) VALUES ?", [linkValues]);
        }

        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const pValues = pIds.map(pid => [pid, testimonyId]);
                await connection.query("INSERT INTO product_testimonies (product_id, testimony_id) VALUES ?", [pValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing/testimonies/add?error=Failed');
    } finally {
        if (connection) connection.release();
    }
});

router.get('/testimonies/edit/:id', async (req, res) => {
    try {
        const [testimonies] = await pool.query("SELECT * FROM testimonies WHERE id = ?", [req.params.id]);
        if (testimonies.length === 0) return res.redirect('/admin/marketing');
        const testimony = testimonies[0];

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
        const [related] = await pool.query("SELECT product_id FROM product_testimonies WHERE testimony_id = ?", [testimony.id]);
        const [links] = await pool.query("SELECT url FROM testimony_links WHERE testimony_id = ?", [testimony.id]);

        testimony.product_ids = related.map(r => r.product_id);
        testimony.links = links.map(l => l.url);

        res.render('marketing/testimonies/edit', { testimony, products });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/marketing');
    }
});

router.post('/testimonies/edit/:id', async (req, res) => {
    const { client_name, location, start_date, end_date, treatment, links, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query("UPDATE testimonies SET client_name=?, location=?, start_date=?, end_date=?, treatment=? WHERE id=?", [client_name, location, start_date, end_date, treatment, req.params.id]);

        // Links
        await connection.query("DELETE FROM testimony_links WHERE testimony_id = ?", [req.params.id]);
        if (links) {
            const linkArr = Array.isArray(links) ? links : [links];
            const linkValues = linkArr.filter(l => l.trim() !== '').map(l => [req.params.id, l]);
            if (linkValues.length > 0) await connection.query("INSERT INTO testimony_links (testimony_id, url) VALUES ?", [linkValues]);
        }

        // Products
        await connection.query("DELETE FROM product_testimonies WHERE testimony_id = ?", [req.params.id]);
        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const pValues = pIds.map(pid => [pid, req.params.id]);
                await connection.query("INSERT INTO product_testimonies (product_id, testimony_id) VALUES ?", [pValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/materials/delete/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM marketing_materials WHERE id = ?", [req.params.id]);
        res.redirect('/admin/marketing');
    } catch (e) { console.error(e); res.redirect('/admin/marketing'); }
});

router.post('/events/delete/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM events WHERE id = ?", [req.params.id]);
        res.redirect('/admin/marketing');
    } catch (e) { console.error(e); res.redirect('/admin/marketing'); }
});

router.post('/testimonies/delete/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM testimonies WHERE id = ?", [req.params.id]);
        res.redirect('/admin/marketing');
    } catch (e) { console.error(e); res.redirect('/admin/marketing'); }
});

module.exports = router;
