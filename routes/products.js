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

const chunkUpload = multer({ storage: multer.memoryStorage() });

const handleUploads = upload.fields([
    { name: 'mda_cert', maxCount: 1 },
    { name: 'product_images', maxCount: 10 } // Allow up to 10 images
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
        const { search, category, categories: selectedCats, suppliers: selectedSups, types: selectedTypes } = req.query;

        // Normalize filters to arrays
        const catFilters = Array.isArray(selectedCats) ? selectedCats : (selectedCats ? [selectedCats] : (category ? [category] : []));
        const supFilters = Array.isArray(selectedSups) ? selectedSups : (selectedSups ? [selectedSups] : []);
        const typeFilters = Array.isArray(selectedTypes) ? selectedTypes : (selectedTypes ? [selectedTypes] : []);

        let query = `
            SELECT DISTINCT p.* 
            FROM products p
            LEFT JOIN product_categories pc ON p.id = pc.product_id
            LEFT JOIN product_types pt ON p.id = pt.product_id
        `;
        const params = [];
        const conditions = [];

        // Fetch all peripheral data for filters
        const [allCategories] = await pool.query("SELECT * FROM categories ORDER BY name ASC");
        const [allSuppliers] = await pool.query("SELECT id, name FROM suppliers ORDER BY name ASC");
        const [allTypes] = await pool.query("SELECT id, value FROM settings WHERE type = 'product_type' ORDER BY value ASC");

        if (search) {
            conditions.push("(p.model LIKE ? OR p.code LIKE ? OR p.description LIKE ? OR p.mda_reg_no LIKE ?)");
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }

        if (catFilters.length > 0) {
            let catIdsToFilter = [];
            for (const catId of catFilters) {
                catIdsToFilter = catIdsToFilter.concat(getCategoryChildIds(allCategories, catId));
            }
            // Remove duplicates
            catIdsToFilter = [...new Set(catIdsToFilter)];

            if (catIdsToFilter.length > 0) {
                conditions.push(`pc.category_id IN (${catIdsToFilter.map(() => '?').join(',')})`);
                params.push(...catIdsToFilter);
            }
        }

        if (supFilters.length > 0) {
            conditions.push(`p.supplier_id IN (${supFilters.map(() => '?').join(',')})`);
            params.push(...supFilters);
        }

        if (typeFilters.length > 0) {
            conditions.push(`pt.type_id IN (${typeFilters.map(() => '?').join(',')})`);
            params.push(...typeFilters);
        }

        if (conditions.length > 0) {
            query += " WHERE " + conditions.join(" AND ");
        }

        query += " ORDER BY p.id DESC";

        const [products] = await pool.query(query, params);

        res.render('products/index', {
            products,
            categories: allCategories,
            suppliers: allSuppliers,
            types: allTypes,
            search: search || '',
            selectedCategories: catFilters,
            selectedSuppliers: supFilters,
            selectedTypes: typeFilters
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
        const [suppliers] = await pool.query(`
            SELECT s.*, st.value as country_name 
            FROM suppliers s
            LEFT JOIN settings st ON s.country_id = st.id
            ORDER BY s.name ASC
        `);
        res.render('products/create', { types, categories, suppliers });
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
        const [suppliers] = await pool.query(`
            SELECT s.*, st.value as country_name 
            FROM suppliers s
            LEFT JOIN settings st ON s.country_id = st.id
            ORDER BY s.name ASC
        `);
        const [prodTypes] = await pool.query("SELECT type_id FROM product_types WHERE product_id = ?", [product.id]);
        const [prodCats] = await pool.query("SELECT category_id FROM product_categories WHERE product_id = ?", [product.id]);
        const [specs] = await pool.query("SELECT spec_key as `key`, spec_value as `value` FROM product_specifications WHERE product_id = ?", [product.id]);
        const [productImages] = await pool.query("SELECT * FROM product_images WHERE product_id = ? ORDER BY is_main DESC, id ASC", [product.id]);

        product.product_types = prodTypes.map(t => t.type_id);
        product.categories = prodCats.map(c => c.category_id);
        product.specs = specs;
        product.images = productImages;

        res.render('products/edit', { product, types, categories, suppliers });
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products');
    }
});

// Helper function to process files
async function processFiles(files) {
    let mda_cert_path = null;
    let product_images = [];

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

    // Handle Product Images (Multiple images)
    if (files['product_images']) {
        const uploadDir = path.join(__dirname, '../public/uploads/products');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        for (const file of files['product_images']) {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const filename = `prod-${uniqueSuffix}.webp`;
            try {
                await sharp(file.buffer)
                    .resize({ width: 800, height: 800, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80, effort: 2 })
                    .toFile(path.join(uploadDir, filename));
                product_images.push('/uploads/products/' + filename);
            } catch (e) {
                console.error('Sharp error processing product image:', e);
            }
        }
    }

    return { mda_cert_path, product_images };
}

// Chunked Upload Route for Products
router.post('/upload-chunk', chunkUpload.single('chunk'), async (req, res) => {
    try {
        const { fileId, chunkIndex, totalChunks, fileName, type } = req.body;
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
            const uploadDir = path.join(__dirname, '../public/uploads/products');
            if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

            let finalPath = '';
            const ext = path.extname(fileName).toLowerCase();

            if (type === 'cert' && ext === '.pdf') {
                const filename = `cert-${uniqueSuffix}${ext}`;
                fs.writeFileSync(path.join(uploadDir, filename), completeBuffer);
                finalPath = '/uploads/products/' + filename;
            } else {
                // Image processing (for cert or product image)
                const prefix = type === 'cert' ? 'cert' : 'prod';
                const filename = `${prefix}-${uniqueSuffix}.webp`;
                const width = type === 'cert' ? 1200 : 800;
                await sharp(completeBuffer)
                    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
                    .webp({ quality: 80, effort: 2 })
                    .toFile(path.join(uploadDir, filename));
                finalPath = '/uploads/products/' + filename;
            }

            // Clean up chunks
            fs.rmSync(chunkDir, { recursive: true, force: true });

            return res.json({
                success: true,
                filePath: finalPath
            });
        }

        res.json({ success: true, message: 'Chunk uploaded' });
    } catch (err) {
        console.error('Product chunk upload error:', err);
        res.status(500).json({ success: false, error: 'Chunk upload failed' });
    }
});

router.post('/create', handleUploads, async (req, res) => {
    const {
        code, model, mda_reg_no, description,
        product_types, product_categories,
        spec_key, spec_value,
        main_image_index,
        supplier_id,
        mda_cert_path,
        product_images_paths
    } = req.body;

    let connection;
    try {
        const paths = await processFiles(req.files || {});

        // Prioritize chunked upload paths if available
        let finalCertPath = mda_cert_path || paths.mda_cert_path;
        let finalProductImages = paths.product_images || [];

        if (product_images_paths) {
            const chunkedImages = Array.isArray(product_images_paths) ? product_images_paths : [product_images_paths];
            finalProductImages = [...finalProductImages, ...chunkedImages];
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        // Determine main image path
        let mainImagePath = null;
        if (finalProductImages && finalProductImages.length > 0) {
            const mainIndex = main_image_index ? parseInt(main_image_index) : 0;
            mainImagePath = finalProductImages[mainIndex] || finalProductImages[0];
        }

        const [result] = await connection.query(
            "INSERT INTO products (code, model, mda_reg_no, description, mda_cert, product_image, supplier_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [code, model, mda_reg_no, description, finalCertPath, mainImagePath, supplier_id || null]
        );
        const productId = result.insertId;

        // Insert Product Images
        if (finalProductImages && finalProductImages.length > 0) {
            const mainIndex = main_image_index ? parseInt(main_image_index) : 0;
            const imageValues = finalProductImages.map((imgPath, index) => [
                productId,
                imgPath,
                index === mainIndex ? 1 : 0
            ]);
            await connection.query("INSERT INTO product_images (product_id, image_path, is_main) VALUES ?", [imageValues]);
        }

        if (product_types) {
            const types = Array.isArray(product_types) ? product_types : [product_types];
            const typeValues = types.map(t => [productId, t]);
            await connection.query("INSERT INTO product_types (product_id, type_id) VALUES ?", [typeValues]);
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
        code, model, mda_reg_no, description,
        product_types, product_categories,
        spec_key, spec_value,
        existing_mda_cert, mda_cert_removed,
        existing_images, deleted_images, main_image_id,
        supplier_id,
        mda_cert_path,
        product_images_paths
    } = req.body;

    let connection;
    try {
        const paths = await processFiles(req.files || {});

        // Prioritize chunked upload paths
        let finalCertPath = mda_cert_path || paths.mda_cert_path || existing_mda_cert;
        if (mda_cert_removed === 'true' && !mda_cert_path && !paths.mda_cert_path) finalCertPath = null;

        // Cleanup old cert file if replaced/removed
        if ((mda_cert_path || paths.mda_cert_path || mda_cert_removed === 'true') && existing_mda_cert) {
            const oldPath = path.join(__dirname, '../public', existing_mda_cert);
            if (fs.existsSync(oldPath)) {
                try { fs.unlinkSync(oldPath); } catch (e) { console.error('Error deleting old cert:', e); }
            }
        }

        connection = await pool.getConnection();
        await connection.beginTransaction();

        const productId = req.params.id;

        // Handle image deletions
        if (deleted_images) {
            const deletedIds = Array.isArray(deleted_images) ? deleted_images : [deleted_images];
            if (deletedIds.length > 0) {
                // Get image paths before deletion
                const [imagesToDelete] = await connection.query(
                    "SELECT image_path FROM product_images WHERE id IN (?)",
                    [deletedIds]
                );

                // Delete from database
                await connection.query("DELETE FROM product_images WHERE id IN (?)", [deletedIds]);

                // Delete files
                imagesToDelete.forEach(img => {
                    const filePath = path.join(__dirname, '../public', img.image_path);
                    if (fs.existsSync(filePath)) {
                        try {
                            fs.unlinkSync(filePath);
                        } catch (e) {
                            console.error('Error deleting image file:', e);
                        }
                    }
                });
            }
        }

        // Add new images (normal or chunked)
        let finalNewImages = paths.product_images || [];
        if (product_images_paths) {
            const chunkedImages = Array.isArray(product_images_paths) ? product_images_paths : [product_images_paths];
            finalNewImages = [...finalNewImages, ...chunkedImages];
        }

        if (finalNewImages.length > 0) {
            const imageValues = finalNewImages.map(imgPath => [productId, imgPath, 0]);
            await connection.query("INSERT INTO product_images (product_id, image_path, is_main) VALUES ?", [imageValues]);
        }

        // Update main image
        if (main_image_id) {
            // Set all to not main first
            await connection.query("UPDATE product_images SET is_main = 0 WHERE product_id = ?", [productId]);
            // Set selected one as main
            await connection.query("UPDATE product_images SET is_main = 1 WHERE id = ? AND product_id = ?", [main_image_id, productId]);
        }

        // Get main image for backward compatibility
        const [mainImageResult] = await connection.query(
            "SELECT image_path FROM product_images WHERE product_id = ? AND is_main = 1 LIMIT 1",
            [productId]
        );
        const mainImagePath = mainImageResult.length > 0 ? mainImageResult[0].image_path : null;

        const [result] = await connection.query(
            "UPDATE products SET code=?, model=?, mda_reg_no=?, description=?, mda_cert=?, product_image=?, supplier_id=? WHERE id=?",
            [code, model, mda_reg_no, description, finalCertPath, mainImagePath, supplier_id || null, productId]
        );

        // Reset Relations
        await connection.query("DELETE FROM product_types WHERE product_id = ?", [productId]);
        await connection.query("DELETE FROM product_categories WHERE product_id = ?", [productId]);
        await connection.query("DELETE FROM product_specifications WHERE product_id = ?", [productId]);

        if (product_types) {
            const types = Array.isArray(product_types) ? product_types : [product_types];
            const typeValues = types.map(t => [productId, t]);
            await connection.query("INSERT INTO product_types (product_id, type_id) VALUES ?", [typeValues]);
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
        }

        // Delete all product images
        const [productImages] = await pool.query("SELECT image_path FROM product_images WHERE product_id = ?", [req.params.id]);
        productImages.forEach(img => {
            const p = path.join(__dirname, '../public', img.image_path);
            if (fs.existsSync(p)) {
                try {
                    fs.unlinkSync(p);
                } catch (e) {
                    console.error('Error deleting product image:', e);
                }
            }
        });

        // Delete product (cascade will delete product_images records)
        await pool.query("DELETE FROM products WHERE id = ?", [req.params.id]);
        res.redirect('/admin/products');
    } catch (err) {
        console.error(err);
        res.redirect('/admin/products?error=Failed to delete');
    }
});

module.exports = router;
