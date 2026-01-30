const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// Configure Multer for Logo Upload (Memory Storage for Sharp processing)
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 2 * 1024 * 1024 // 2MB Max
    }
});

// Configure Multer for Chunk Uploads
const chunkUpload = multer({ storage: multer.memoryStorage() });

// Middleware to handle Multer errors
const handleUpload = (field) => (req, res, next) => {
    upload.single(field)(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.redirect(`${req.baseUrl}${req.path === '/add' ? '/add' : '/edit/' + req.params.id}?error=File too large. Max 2MB.`);
            }
        } else if (err) {
            return res.redirect(`${req.baseUrl}${req.path === '/add' ? '/add' : '/edit/' + req.params.id}?error=Upload failed.`);
        }
        next();
    });
};

router.use((req, res, next) => {
    if (!req.session.user) return res.redirect('/auth/login');
    next();
});

router.get('/', async (req, res) => {
    try {
        const { search } = req.query;
        let query = "SELECT * FROM affiliated_companies";
        const params = [];

        if (search) {
            query += " WHERE name LIKE ? OR shortname LIKE ?";
            const term = `%${search}%`;
            params.push(term, term);
        }

        query += " ORDER BY name ASC";
        const [companies] = await pool.query(query, params);
        res.render('companies/index', {
            companies,
            search: search || '',
            query: req.query
        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Server Error');
    }
});

router.get('/add', (req, res) => {
    res.render('companies/add');
});

router.get('/edit/:id', async (req, res) => {
    try {
        const [companies] = await pool.query("SELECT * FROM affiliated_companies WHERE id = ?", [req.params.id]);
        if (companies.length === 0) return res.redirect('/admin/companies');
        res.render('companies/edit', { company: companies[0], query: req.query });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/companies');
    }
});

// Chunked Upload Route
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
                if (totalSize > 2 * 1024 * 1024) {
                    fs.rmSync(chunkDir, { recursive: true, force: true });
                    return res.status(400).json({ success: false, error: 'File too large. Max 2MB.' });
                }
                chunks.push(chunkData);
            }
            const completeBuffer = Buffer.concat(chunks);

            // Process with Sharp as before
            const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
            const dir = path.join(__dirname, '../public/uploads/logos');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const outputPath = path.join(dir, filename);

            await sharp(completeBuffer)
                .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true })
                .webp({ quality: 80, effort: 2 })
                .toFile(outputPath);

            // Clean up chunks
            fs.rmSync(chunkDir, { recursive: true, force: true });

            return res.json({
                success: true,
                logoPath: '/uploads/logos/' + filename
            });
        }

        res.json({ success: true, message: 'Chunk uploaded' });
    } catch (err) {
        console.error('Chunk upload error:', err);
        res.status(500).json({ success: false, error: 'Chunk upload failed' });
    }
});

router.post('/add', handleUpload('logo'), async (req, res) => {
    const { name, shortname, reg_no, reg_date, address, website, email, contact_number, logo_path } = req.body;
    let logo = logo_path || null;

    if (req.file && !logo) {
        try {
            const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
            const dir = path.join(__dirname, '../public/uploads/logos');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const outputPath = path.join(dir, filename);

            // Convert to WebP and optimize
            await sharp(req.file.buffer)
                .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 2 })
                .toFile(outputPath);

            logo = '/uploads/logos/' + filename;
        } catch (sharpError) {
            console.error('Sharp processing error:', sharpError);
        }
    }

    try {
        await pool.query(
            "INSERT INTO affiliated_companies (name, shortname, logo, reg_no, reg_date, address, website, email, contact_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [name, shortname, logo, reg_no, reg_date, address, website, email, contact_number]
        );
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/companies?error=Failed to add company. Shortname might already be taken.');
    }
});

router.post('/edit/:id', handleUpload('logo'), async (req, res) => {
    const { name, shortname, reg_no, reg_date, address, website, email, contact_number, existing_logo, logo_path } = req.body;
    let logo = logo_path || existing_logo;

    // Handle logo replacement via chunked upload
    if (logo_path && existing_logo) {
        try {
            const oldPath = path.join(__dirname, '../public', existing_logo);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        } catch (err) {
            console.error('Error deleting old logo during chunked replacement:', err);
        }
    }

    // Handle logo replacement or removal via normal upload (if chunked wasn't used)
    if (req.file && !logo_path) {
        try {
            // Delete old logo if it exists
            if (existing_logo) {
                const oldPath = path.join(__dirname, '../public', existing_logo);
                if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
            }

            const filename = `logo-${Date.now()}-${Math.round(Math.random() * 1E9)}.webp`;
            const dir = path.join(__dirname, '../public/uploads/logos');
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const outputPath = path.join(dir, filename);

            // Convert to WebP and optimize
            await sharp(req.file.buffer)
                .resize({ width: 1000, height: 1000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80, effort: 2 })
                .toFile(outputPath);

            logo = '/uploads/logos/' + filename;
        } catch (sharpError) {
            console.error('Sharp processing error:', sharpError);
        }
    } else if (req.body.logo_removed === 'true') {
        // Delete old logo if it exists when explicitly removed
        if (existing_logo) {
            const oldPath = path.join(__dirname, '../public', existing_logo);
            if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
        }
        logo = null;
    }

    try {
        await pool.query(
            "UPDATE affiliated_companies SET name = ?, shortname = ?, logo = ?, reg_no = ?, reg_date = ?, address = ?, website = ?, email = ?, contact_number = ? WHERE id = ?",
            [name, shortname, logo, reg_no, reg_date, address, website, email, contact_number, req.params.id]
        );
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/companies?error=Failed to update company');
    }
});

router.post('/delete/:id', async (req, res) => {
    try {
        // Get logo path before deleting the record
        const [companies] = await pool.query("SELECT logo FROM affiliated_companies WHERE id = ?", [req.params.id]);

        if (companies.length > 0 && companies[0].logo) {
            const logoPath = path.join(__dirname, '../public', companies[0].logo);
            if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
        }

        await pool.query("DELETE FROM affiliated_companies WHERE id = ?", [req.params.id]);
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/companies?error=Failed to delete');
    }
});

module.exports = router;

