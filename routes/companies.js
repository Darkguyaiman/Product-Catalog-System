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
        const [companies] = await pool.query("SELECT * FROM affiliated_companies ORDER BY name ASC");
        res.render('companies/index', { companies, query: req.query });
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

router.post('/add', handleUpload('logo'), async (req, res) => {
    const { name, reg_no, reg_date, address, website, email, contact_number } = req.body;
    let logo = null;

    if (req.file) {
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
            "INSERT INTO affiliated_companies (name, logo, reg_no, reg_date, address, website, email, contact_number) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [name, logo, reg_no, reg_date, address, website, email, contact_number]
        );
        res.redirect('/admin/companies');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/companies?error=Failed to add company');
    }
});

router.post('/edit/:id', handleUpload('logo'), async (req, res) => {
    const { name, reg_no, reg_date, address, website, email, contact_number, existing_logo } = req.body;
    let logo = existing_logo;

    // Handle logo replacement or removal
    if (req.file) {
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
            "UPDATE affiliated_companies SET name = ?, logo = ?, reg_no = ?, reg_date = ?, address = ?, website = ?, email = ?, contact_number = ? WHERE id = ?",
            [name, logo, reg_no, reg_date, address, website, email, contact_number, req.params.id]
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

