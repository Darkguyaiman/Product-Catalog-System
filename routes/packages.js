const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const sharp = require('sharp');

// Configure Multer for package image
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit for normal uploads
});

const chunkUpload = multer({ storage: multer.memoryStorage() });

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

// Chunked Upload Route for Packages
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

            // Process with Sharp
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const uploadDir = path.join(__dirname, '../public/uploads/packages');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            const filename = `pkg-${uniqueSuffix}.webp`;
            await sharp(completeBuffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 75, effort: 6 })
                .toFile(path.join(uploadDir, filename));

            const finalPath = '/uploads/packages/' + filename;

            // Clean up chunks
            fs.rmSync(chunkDir, { recursive: true, force: true });

            return res.json({
                success: true,
                filePath: finalPath
            });
        }

        res.json({ success: true, message: 'Chunk uploaded' });
    } catch (err) {
        console.error('Package chunk upload error:', err);
        res.status(500).json({ success: false, error: 'Chunk upload failed' });
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
    const { name, description, bundle_label, product_ids, spec_icons, spec_texts, main_image_path } = req.body;
    let main_image = main_image_path || null;

    if (req.file && !main_image) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const uploadDir = path.join(__dirname, '../public/uploads/packages');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        const filename = `pkg-${uniqueSuffix}.webp`;
        await sharp(req.file.buffer)
            .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 75, effort: 6 })
            .toFile(path.join(uploadDir, filename));
        main_image = '/uploads/packages/' + filename;
    }

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
    const { name, description, bundle_label, product_ids, spec_icons, spec_texts, main_image_path, remove_main_image } = req.body;
    const packageId = req.params.id;

    let connection;
    try {
        connection = await pool.getConnection();

        // Fetch current package for cleanup
        const [currentRow] = await connection.query('SELECT main_image FROM packages WHERE id = ?', [packageId]);
        const currentImage = currentRow.length > 0 ? currentRow[0].main_image : null;

        let main_image = main_image_path || currentImage;
        if (remove_main_image === 'true') {
            main_image = null;
        }

        if (req.file) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const uploadDir = path.join(__dirname, '../public/uploads/packages');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
            const filename = `pkg-${uniqueSuffix}.webp`;
            await sharp(req.file.buffer)
                .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 75, effort: 6 })
                .toFile(path.join(uploadDir, filename));
            main_image = '/uploads/packages/' + filename;
        }

        // Cleanup old file if changed or removed
        if (currentImage && (main_image !== currentImage || remove_main_image === 'true')) {
            const oldPath = path.join(__dirname, '../public', currentImage);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) { console.error('Error deleting old package image:', e); }
            }
        }

        await connection.beginTransaction();

        await connection.query(
            'UPDATE packages SET name = ?, description = ?, bundle_label = ?, main_image = ? WHERE id = ?',
            [name, description, bundle_label, main_image, packageId]
        );

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
    if (req.session.user.role !== 'Super Admin') return res.status(403).send('Unauthorized');
    try {
        const [rows] = await pool.query('SELECT main_image FROM packages WHERE id = ?', [req.params.id]);
        if (rows.length > 0 && rows[0].main_image) {
            const p = path.join(__dirname, '../public', rows[0].main_image);
            if (fs.existsSync(p)) {
                try { fs.unlinkSync(p); } catch (e) { console.error('Error deleting package image on delete:', e); }
            }
        }
        await pool.query('DELETE FROM packages WHERE id = ?', [req.params.id]);
        res.redirect('/admin/packages');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/packages?error=Failed to delete package');
    }
});

module.exports = router;
