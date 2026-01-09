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
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

const chunkUpload = multer({ storage: multer.memoryStorage() });

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

const getMarketingData = async (req) => {
    const { search, product_id } = req.query;

    // Materials
    const mQ = buildWhere(search, product_id, 'product_marketing', 'material_id');
    const [marketing] = await pool.query(`
        SELECT m.*, 
        (SELECT GROUP_CONCAT(product_id) FROM product_marketing WHERE material_id = m.id) as product_ids 
        FROM marketing_materials m ${mQ.where} ORDER BY m.id DESC`, mQ.params);

    // Events
    const eQ = buildWhere(search, product_id, 'product_events', 'event_id');
    const [events] = await pool.query(`
        SELECT e.*, 
        (SELECT GROUP_CONCAT(product_id) FROM product_events WHERE event_id = e.id) as product_ids,
        (SELECT GROUP_CONCAT(CONCAT(IFNULL(title, ''), '::', url) SEPARATOR '||') FROM event_links WHERE event_id = e.id) as links 
        FROM events e ${eQ.where} ORDER BY e.start_date DESC`, eQ.params);

    // Testimonies
    const tQ = buildTestimonyWhere(search, product_id);
    const [testimonies] = await pool.query(`
        SELECT t.*, 
        (SELECT GROUP_CONCAT(product_id) FROM product_testimonies WHERE testimony_id = t.id) as product_ids,
        (SELECT GROUP_CONCAT(CONCAT(IFNULL(title, ''), '::', url) SEPARATOR '||') FROM testimony_links WHERE testimony_id = t.id) as links
        FROM testimonies t ${tQ.where} ORDER BY t.start_date DESC`, tQ.params);

    const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");

    return { marketing, events, testimonies, products, search: search || '', selectedProduct: product_id || '' };
};

router.get('/', (req, res) => {
    res.redirect('/admin/marketing/materials');
});

router.get('/materials', async (req, res) => {
    try {
        const data = await getMarketingData(req);
        res.render('marketing/index', { ...data, activeTab: 'materials' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/events', async (req, res) => {
    try {
        const data = await getMarketingData(req);
        res.render('marketing/index', { ...data, activeTab: 'events' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/testimonies', async (req, res) => {
    try {
        const data = await getMarketingData(req);
        res.render('marketing/index', { ...data, activeTab: 'testimonies' });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

// ==========================================
// MATERIALS
// ==========================================

// Chunked Upload Route for Marketing Materials
router.post('/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
    try {
        const { fileId, chunkIndex, totalChunks, fileName } = req.body;
        const chunkDir = path.join(__dirname, '../temp/chunks', fileId);

        if (!fs.existsSync(chunkDir)) {
            fs.mkdirSync(chunkDir, { recursive: true });
        }

        const chunkPath = path.join(chunkDir, `chunk-${chunkIndex}`);
        fs.writeFileSync(chunkPath, req.file.buffer);

        const uploadedChunks = fs.readdirSync(chunkDir).length;

        if (uploadedChunks === parseInt(totalChunks)) {
            // Reassemble
            const chunks = [];
            let totalSize = 0;
            for (let i = 0; i < totalChunks; i++) {
                const chunkData = fs.readFileSync(path.join(chunkDir, `chunk-${i}`));
                totalSize += chunkData.length;
                if (totalSize > 5 * 1024 * 1024) { // 5MB limit
                    fs.rmSync(chunkDir, { recursive: true, force: true });
                    return res.status(400).json({ success: false, error: 'File too large. Max 5MB.' });
                }
                chunks.push(chunkData);
            }
            const completeBuffer = Buffer.concat(chunks);

            // Process with Sharp or Save Raw
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const uploadDir = path.join(__dirname, '../public/uploads/marketing');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            let finalPath = '';
            const ext = path.extname(fileName).toLowerCase();
            const mimeType = req.body.mimeType || '';

            if (ext === '.pdf' || ext === '.pptx' || ext === '.xlsx') {
                const filename = `material-${uniqueSuffix}${ext}`;
                fs.writeFileSync(path.join(uploadDir, filename), completeBuffer);
                finalPath = '/uploads/marketing/' + filename;
            } else if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || mimeType.startsWith('image/')) {
                // Image processing
                const filename = `material-${uniqueSuffix}.webp`;
                await sharp(completeBuffer)
                    .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80, effort: 2 })
                    .toFile(path.join(uploadDir, filename));
                finalPath = '/uploads/marketing/' + filename;
            } else {
                // Default fallback for other files
                const filename = `material-${uniqueSuffix}${ext}`;
                fs.writeFileSync(path.join(uploadDir, filename), completeBuffer);
                finalPath = '/uploads/marketing/' + filename;
            }

            // Clean up chunks
            fs.rmSync(chunkDir, { recursive: true, force: true });

            return res.json({
                success: true,
                filePath: finalPath,
                mimeType: ext === '.webp' || (ext !== '.pdf' && ext !== '.pptx' && ext !== '.xlsx' && !mimeType.startsWith('application/')) ? 'image/webp' : mimeType
            });
        }

        res.json({ success: true, message: 'Chunk uploaded' });
    } catch (err) {
        console.error('Marketing chunk upload error:', err);
        res.status(500).json({ success: false, error: 'Chunk upload failed' });
    }
});

router.get('/materials/add', async (req, res) => {
    const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
    res.render('marketing/materials/add', { products });
});

router.post('/materials/add', upload.single('file'), async (req, res) => {
    const { name, product_ids, file_path, file_mime } = req.body;
    let filePath = file_path;
    let mimeType = file_mime;

    // Fallback to normal upload if chunked wasn't used
    if (!filePath && req.file) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(req.file.originalname).toLowerCase();

        if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || req.file.mimetype.startsWith('image/')) {
            const filename = `material-${uniqueSuffix}.webp`;
            const dir = path.join(__dirname, '../public/uploads/marketing');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const outputPath = path.join(dir, filename);

            await sharp(req.file.buffer)
                .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80, effort: 2 })
                .toFile(outputPath);

            filePath = '/uploads/marketing/' + filename;
            mimeType = 'image/webp';
        } else {
            const filename = `material-${uniqueSuffix}${ext}`;
            const dir = path.join(__dirname, '../public/uploads/marketing');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, filename), req.file.buffer);
            filePath = '/uploads/marketing/' + filename;
            mimeType = req.file.mimetype;
        }
    }

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO marketing_materials (name, file_path, file_type) VALUES (?, ?, ?)", [name, filePath, mimeType || 'unknown']);
        const materialId = result.insertId;

        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const values = pIds.map(pid => [pid, materialId]);
                await connection.query("INSERT INTO product_marketing (product_id, material_id) VALUES ?", [values]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing/materials');
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
        if (rows.length === 0) return res.redirect('/admin/marketing/materials');

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
        const [related] = await pool.query("SELECT product_id FROM product_marketing WHERE material_id = ?", [req.params.id]);

        const material = rows[0];
        material.product_ids = related.map(r => r.product_id);

        res.render('marketing/materials/edit', { material, products });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/marketing/materials');
    }
});

router.post('/materials/edit/:id', upload.single('file'), async (req, res) => {
    const { name, product_ids, existing_file, file_path, file_mime } = req.body;

    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        let finalFilePath = existing_file;
        let finalFileType = undefined;

        // If new file provided via chunking
        if (file_path) {
            finalFilePath = file_path;
            finalFileType = file_mime;

            // Delete old file
            if (existing_file) {
                const oldPath = path.join(__dirname, '../public', existing_file);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch (e) { console.error("Error deleting old file:", e); }
                }
            }
        }
        // Fallback to normal upload
        else if (req.file) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(req.file.originalname).toLowerCase();
            const dir = path.join(__dirname, '../public/uploads/marketing');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || req.file.mimetype.startsWith('image/')) {
                const filename = `material-${uniqueSuffix}.webp`;
                await sharp(req.file.buffer)
                    .resize({ width: 1920, height: 1080, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80, effort: 2 })
                    .toFile(path.join(dir, filename));

                finalFilePath = '/uploads/marketing/' + filename;
                finalFileType = 'image/webp';
            } else {
                const filename = `material-${uniqueSuffix}${ext}`;
                fs.writeFileSync(path.join(dir, filename), req.file.buffer);
                finalFilePath = '/uploads/marketing/' + filename;
                finalFileType = req.file.mimetype;
            }

            // Delete old file
            if (existing_file) {
                const oldPath = path.join(__dirname, '../public', existing_file);
                if (fs.existsSync(oldPath)) {
                    try { fs.unlinkSync(oldPath); } catch (e) { console.error("Error deleting old file:", e); }
                }
            }
        }

        let query = "UPDATE marketing_materials SET name = ?";
        let params = [name];
        if (finalFileType) {
            query += ", file_path = ?, file_type = ?";
            params.push(finalFilePath, finalFileType);
        } else if (finalFilePath && finalFilePath !== existing_file) {
            query += ", file_path = ?";
            params.push(finalFilePath);
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
        res.redirect('/admin/marketing/materials');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing/materials');
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
    const { name, location, start_date, end_date, link_titles, link_urls, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO events (name, location, start_date, end_date) VALUES (?, ?, ?, ?)", [name, location, start_date, end_date]);
        const eventId = result.insertId;

        if (link_urls) {
            const urls = Array.isArray(link_urls) ? link_urls : [link_urls];
            const titles = Array.isArray(link_titles) ? link_titles : [link_titles];
            const linkValues = urls
                .map((url, i) => [eventId, titles[i], url])
                .filter(l => l[2].trim() !== '');
            if (linkValues.length > 0) await connection.query("INSERT INTO event_links (event_id, title, url) VALUES ?", [linkValues]);
        }

        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const pValues = pIds.map(pid => [pid, eventId]);
                await connection.query("INSERT INTO product_events (product_id, event_id) VALUES ?", [pValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing/events');
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
        if (events.length === 0) return res.redirect('/admin/marketing/events');
        const event = events[0];

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
        const [related] = await pool.query("SELECT product_id FROM product_events WHERE event_id = ?", [event.id]);
        const [links] = await pool.query("SELECT title, url FROM event_links WHERE event_id = ?", [event.id]);

        event.product_ids = related.map(r => r.product_id);
        event.links = links; // Now contains {title, url}

        res.render('marketing/events/edit', { event, products });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/marketing/events');
    }
});

router.post('/events/edit/:id', async (req, res) => {
    const { name, location, start_date, end_date, link_titles, link_urls, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query("UPDATE events SET name = ?, location = ?, start_date = ?, end_date = ? WHERE id = ?", [name, location, start_date, end_date, req.params.id]);

        // Update Links
        await connection.query("DELETE FROM event_links WHERE event_id = ?", [req.params.id]);
        if (link_urls) {
            const urls = Array.isArray(link_urls) ? link_urls : [link_urls];
            const titles = Array.isArray(link_titles) ? link_titles : [link_titles];
            const linkValues = urls
                .map((url, i) => [req.params.id, titles[i], url])
                .filter(l => l[2].trim() !== '');
            if (linkValues.length > 0) await connection.query("INSERT INTO event_links (event_id, title, url) VALUES ?", [linkValues]);
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
        res.redirect('/admin/marketing/events');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing/events');
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
    const { client_name, location, start_date, treatment, link_titles, link_urls, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        const [result] = await connection.query("INSERT INTO testimonies (client_name, location, start_date, treatment) VALUES (?, ?, ?, ?)", [client_name, location, start_date, treatment]);
        const testimonyId = result.insertId;

        if (link_urls) {
            const urls = Array.isArray(link_urls) ? link_urls : [link_urls];
            const titles = Array.isArray(link_titles) ? link_titles : [link_titles];
            const linkValues = urls
                .map((url, i) => [testimonyId, titles[i], url])
                .filter(l => l[2].trim() !== '');
            if (linkValues.length > 0) await connection.query("INSERT INTO testimony_links (testimony_id, title, url) VALUES ?", [linkValues]);
        }

        if (product_ids) {
            const pIds = Array.isArray(product_ids) ? product_ids : (product_ids ? [product_ids] : []);
            if (pIds.length > 0) {
                const pValues = pIds.map(pid => [pid, testimonyId]);
                await connection.query("INSERT INTO product_testimonies (product_id, testimony_id) VALUES ?", [pValues]);
            }
        }

        await connection.commit();
        res.redirect('/admin/marketing/testimonies');
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
        if (testimonies.length === 0) return res.redirect('/admin/marketing/testimonies');
        const testimony = testimonies[0];

        const [products] = await pool.query("SELECT id, code, model FROM products ORDER BY code ASC");
        const [related] = await pool.query("SELECT product_id FROM product_testimonies WHERE testimony_id = ?", [testimony.id]);
        const [links] = await pool.query("SELECT title, url FROM testimony_links WHERE testimony_id = ?", [testimony.id]);

        testimony.product_ids = related.map(r => r.product_id);
        testimony.links = links;

        res.render('marketing/testimonies/edit', { testimony, products });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/marketing/testimonies');
    }
});

router.post('/testimonies/edit/:id', async (req, res) => {
    const { client_name, location, start_date, treatment, link_titles, link_urls, product_ids } = req.body;
    let connection;
    try {
        connection = await pool.getConnection();
        await connection.beginTransaction();

        await connection.query("UPDATE testimonies SET client_name = ?, location = ?, start_date = ?, treatment = ? WHERE id = ?", [client_name, location, start_date, treatment, req.params.id]);

        // Update Links
        await connection.query("DELETE FROM testimony_links WHERE testimony_id = ?", [req.params.id]);
        if (link_urls) {
            const urls = Array.isArray(link_urls) ? link_urls : [link_urls];
            const titles = Array.isArray(link_titles) ? link_titles : [link_titles];
            const linkValues = urls
                .map((url, i) => [req.params.id, titles[i], url])
                .filter(l => l[2].trim() !== '');
            if (linkValues.length > 0) await connection.query("INSERT INTO testimony_links (testimony_id, title, url) VALUES ?", [linkValues]);
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
        res.redirect('/admin/marketing/testimonies');
    } catch (err) {
        if (connection) await connection.rollback();
        console.error(err);
        res.redirect('/admin/marketing/testimonies');
    } finally {
        if (connection) connection.release();
    }
});

router.post('/materials/delete/:id', async (req, res) => {
    try {
        const [rows] = await pool.query("SELECT file_path FROM marketing_materials WHERE id = ?", [req.params.id]);
        if (rows.length > 0 && rows[0].file_path) {
            const fullPath = path.join(__dirname, '../public', rows[0].file_path);
            if (fs.existsSync(fullPath)) {
                try { fs.unlinkSync(fullPath); } catch (e) { console.error("Error deleting material file:", e); }
            }
        }
        await pool.query("DELETE FROM marketing_materials WHERE id = ?", [req.params.id]);
        res.redirect('/admin/marketing/materials');
    } catch (e) { console.error(e); res.redirect('/admin/marketing/materials'); }
});

router.post('/events/delete/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM events WHERE id = ?", [req.params.id]);
        res.redirect('/admin/marketing/events');
    } catch (e) { console.error(e); res.redirect('/admin/marketing/events'); }
});

router.post('/testimonies/delete/:id', async (req, res) => {
    try {
        await pool.query("DELETE FROM testimonies WHERE id = ?", [req.params.id]);
        res.redirect('/admin/marketing/testimonies');
    } catch (e) { console.error(e); res.redirect('/admin/marketing/testimonies'); }
});

module.exports = router;
