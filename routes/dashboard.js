const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

function isAuthenticated(req, res, next) {
    if (req.session.user) {
        next();
    } else {
        res.redirect('/auth/login');
    }
}

router.use(isAuthenticated);

const getPercentageChange = (current, last) => {
    if (last === 0) return current > 0 ? 100 : 0;
    return Math.round(((current - last) / last) * 100);
};

const toDateString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const parseDateString = (value) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
    return date;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date) => new Date(date.getFullYear(), date.getMonth() + 1, 0);

const getDefaultDateRange = () => {
    const today = new Date();
    return {
        preset: 'this_month',
        startDate: toDateString(startOfMonth(today)),
        endDate: toDateString(endOfMonth(today))
    };
};

const getDashboardDateRange = (query) => {
    if (query.preset === 'all_time') {
        return {
            preset: 'all_time',
            startDate: '',
            endDate: '',
            isAllTime: true
        };
    }

    const fallback = getDefaultDateRange();
    const requestedStart = parseDateString(query.startDate);
    const requestedEnd = parseDateString(query.endDate);

    if (!requestedStart || !requestedEnd) return fallback;

    const start = requestedStart <= requestedEnd ? requestedStart : requestedEnd;
    const end = requestedStart <= requestedEnd ? requestedEnd : requestedStart;

    return {
        preset: query.preset || 'custom',
        startDate: toDateString(start),
        endDate: toDateString(end),
        isAllTime: false
    };
};

const getPreviousDateRange = (startDate, endDate) => {
    const start = parseDateString(startDate);
    const end = parseDateString(endDate);
    const days = Math.round((end - start) / 86400000) + 1;
    const previousEnd = new Date(start);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days + 1);

    return {
        startDate: toDateString(previousStart),
        endDate: toDateString(previousEnd)
    };
};

const countInRange = async (table, range) => {
    if (range.isAllTime) {
        const [[{ count }]] = await pool.query(`SELECT COUNT(*) as count FROM ${table}`);
        return count;
    }

    const [[{ count }]] = await pool.query(
        `SELECT COUNT(*) as count FROM ${table} WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        [range.startDate, range.endDate]
    );
    return count;
};

const getProductRangeWhere = (range, alias = 'p') => {
    if (range.isAllTime) {
        return { clause: '', params: [] };
    }

    return {
        clause: `WHERE ${alias}.created_at >= ? AND ${alias}.created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
        params: [range.startDate, range.endDate]
    };
};

const getProductStatusCounts = async (range) => {
    const { clause, params } = getProductRangeWhere(range);
    const [[counts]] = await pool.query(`
        SELECT
            SUM(p.is_active = 1) AS activeProducts,
            SUM(p.is_active = 0) AS inactiveProducts
        FROM products p
        ${clause}
    `, params);

    return {
        activeProducts: Number(counts.activeProducts || 0),
        inactiveProducts: Number(counts.inactiveProducts || 0)
    };
};

const getMissingProductImagesCount = async (range) => {
    const { clause, params } = getProductRangeWhere(range);
    const [[{ count }]] = await pool.query(`
        SELECT COUNT(*) AS count
        FROM products p
        ${clause}
        ${clause ? 'AND' : 'WHERE'} TRIM(COALESCE(p.product_image, '')) = ''
        AND NOT EXISTS (
            SELECT 1
            FROM product_images pi
            WHERE pi.product_id = p.id
            LIMIT 1
        )
    `, params);

    return count;
};

const getCatalogCompleteness = async (range) => {
    const rangeWhere = range.isAllTime
        ? ''
        : 'WHERE p.created_at >= ? AND p.created_at < DATE_ADD(?, INTERVAL 1 DAY)';
    const params = range.isAllTime ? [] : [range.startDate, range.endDate];

    const [[{ completeness }]] = await pool.query(`
        SELECT COALESCE(ROUND(AVG(
            (
                (TRIM(COALESCE(p.code, '')) <> '') +
                (TRIM(COALESCE(p.model, '')) <> '') +
                (TRIM(COALESCE(p.description, '')) <> '') +
                (p.supplier_id IS NOT NULL) +
                (pc.product_id IS NOT NULL) +
                (pt.product_id IS NOT NULL) +
                (ps.product_id IS NOT NULL) +
                ((TRIM(COALESCE(p.product_image, '')) <> '') OR (pi.product_id IS NOT NULL)) +
                (TRIM(COALESCE(p.mda_reg_no, '')) <> '') +
                (TRIM(COALESCE(p.mda_cert, '')) <> '')
            ) / 10 * 100
        )), 0) AS completeness
        FROM products p
        LEFT JOIN (SELECT product_id FROM product_categories GROUP BY product_id) pc ON pc.product_id = p.id
        LEFT JOIN (SELECT product_id FROM product_types GROUP BY product_id) pt ON pt.product_id = p.id
        LEFT JOIN (
            SELECT product_id
            FROM product_specifications
            WHERE TRIM(COALESCE(spec_key, '')) <> '' OR TRIM(COALESCE(spec_value, '')) <> ''
            GROUP BY product_id
        ) ps ON ps.product_id = p.id
        LEFT JOIN (SELECT product_id FROM product_images GROUP BY product_id) pi ON pi.product_id = p.id
        ${rangeWhere}
    `, params);

    return completeness;
};

const getDashboardData = async (query) => {
    const dateRange = getDashboardDateRange(query);
    const previousRange = dateRange.isAllTime ? null : getPreviousDateRange(dateRange.startDate, dateRange.endDate);

    const totalProducts = await countInRange('products', dateRange);
    const totalCompanies = await countInRange('affiliated_companies', dateRange);
    const totalSuppliers = await countInRange('suppliers', dateRange);
    const catalogCompleteness = await getCatalogCompleteness(dateRange);
    const { activeProducts, inactiveProducts } = await getProductStatusCounts(dateRange);
    const missingProductImages = await getMissingProductImagesCount(dateRange);

    const totalMaterials = await countInRange('marketing_materials', dateRange);
    const lastMaterials = previousRange ? await countInRange('marketing_materials', previousRange) : 0;
    const materialsChange = getPercentageChange(totalMaterials, lastMaterials);

    const totalEvents = await countInRange('events', dateRange);
    const lastEvents = previousRange ? await countInRange('events', previousRange) : 0;
    const eventsChange = getPercentageChange(totalEvents, lastEvents);

    const totalTestimonials = await countInRange('testimonies', dateRange);
    const lastTestimonials = previousRange ? await countInRange('testimonies', previousRange) : 0;
    const testimonialsChange = getPercentageChange(totalTestimonials, lastTestimonials);

    const [categoriesData] = dateRange.isAllTime ? await pool.query(`
            SELECT c.name, COUNT(pc.product_id) as count 
            FROM categories c 
            LEFT JOIN product_categories pc ON c.id = pc.category_id 
            GROUP BY c.id, c.name
            HAVING count > 0
        `) : await pool.query(`
            SELECT c.name, COUNT(pc.product_id) as count 
            FROM categories c 
            LEFT JOIN product_categories pc ON c.id = pc.category_id 
            LEFT JOIN products p ON p.id = pc.product_id
            WHERE p.created_at >= ? AND p.created_at < DATE_ADD(?, INTERVAL 1 DAY)
            GROUP BY c.id, c.name
            HAVING count > 0
        `, [dateRange.startDate, dateRange.endDate]);

    const [suppliersData] = dateRange.isAllTime ? await pool.query(`
            SELECT s.name, COUNT(p.id) as product_count 
            FROM suppliers s 
            LEFT JOIN products p ON s.id = p.supplier_id
            GROUP BY s.id, s.name 
            HAVING product_count > 0
            ORDER BY product_count DESC 
            LIMIT 10
        `) : await pool.query(`
            SELECT s.name, COUNT(p.id) as product_count 
            FROM suppliers s 
            LEFT JOIN products p ON s.id = p.supplier_id
                AND p.created_at >= ? AND p.created_at < DATE_ADD(?, INTERVAL 1 DAY)
            GROUP BY s.id, s.name 
            HAVING product_count > 0
            ORDER BY product_count DESC 
            LIMIT 10
        `, [dateRange.startDate, dateRange.endDate]);

    return {
        totalProducts,
        totalCompanies,
        totalSuppliers,
        catalogCompleteness,
        activeProducts,
        inactiveProducts,
        missingProductImages,
        totalMaterials,
        materialsChange,
        totalEvents,
        eventsChange,
        totalTestimonials,
        testimonialsChange,
        categoriesData,
        suppliersData,
        dateRange
    };
};

const getDateRangeLabel = (range) => {
    if (range.isAllTime) return 'All time';
    return `${range.startDate} to ${range.endDate}`;
};

const cleanPdfText = (value) => String(value ?? '')
    .replace(/[^\x20-\x7E]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const escapePdfText = (value) => cleanPdfText(value)
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

const formatPdfNumber = (value) => Number(value || 0).toLocaleString('en-US');

const buildDashboardPdf = (data, reportTitle) => {
    const pageWidth = 612;
    const pageHeight = 792;
    const margin = 42;
    const content = [];

    const color = {
        ink: '0.004 0.122 0.294',
        muted: '0.420 0.447 0.502',
        border: '0.820 0.843 0.875',
        soft: '0.976 0.980 0.984',
        blue: '0.000 0.357 0.588',
        blueLight: '0.700 0.804 0.878',
        green: '0.016 0.471 0.341',
        amber: '0.706 0.325 0.035',
        red: '0.725 0.110 0.110',
        white: '1 1 1'
    };

    const setFill = (rgb) => content.push(`${rgb} rg`);
    const setStroke = (rgb) => content.push(`${rgb} RG`);
    const rect = (x, y, w, h, fill = true, stroke = false) => {
        content.push(`${x} ${y} ${w} ${h} re`);
        content.push(fill && stroke ? 'B' : fill ? 'f' : 'S');
    };
    const line = (x1, y1, x2, y2) => content.push(`${x1} ${y1} m ${x2} ${y2} l S`);
    const text = (value, x, y, size = 10, fill = color.ink, font = 'F1') => {
        setFill(fill);
        content.push('BT');
        content.push(`/${font} ${size} Tf`);
        content.push(`1 0 0 1 ${x} ${y} Tm`);
        content.push(`(${escapePdfText(value)}) Tj`);
        content.push('ET');
    };
    const truncate = (value, max = 42) => {
        const cleaned = cleanPdfText(value);
        return cleaned.length > max ? `${cleaned.slice(0, max - 3)}...` : cleaned;
    };
    const card = (x, y, w, h, label, value, accent = color.blue) => {
        setFill(color.white);
        setStroke(color.border);
        rect(x, y, w, h, true, true);
        setFill(accent);
        rect(x, y + h - 4, w, 4, true, false);
        text(label, x + 12, y + h - 22, 8, color.muted);
        text(value, x + 12, y + 18, 18, color.ink, 'F2');
    };
    const progress = (x, y, w, h, percent) => {
        setFill('0.900 0.914 0.933');
        rect(x, y, w, h, true, false);
        setFill(color.blue);
        rect(x, y, Math.max(0, Math.min(w, (w * Number(percent || 0)) / 100)), h, true, false);
    };
    const sectionTitle = (title, y) => {
        text(title, margin, y, 13, color.ink, 'F2');
        setStroke(color.border);
        line(margin, y - 8, pageWidth - margin, y - 8);
    };
    const barChart = (title, rows, valueKey, x, y, w, h, accent = color.blue) => {
        setFill(color.white);
        setStroke(color.border);
        rect(x, y, w, h, true, true);
        text(title, x + 14, y + h - 22, 12, color.ink, 'F2');

        const chartRows = rows.slice(0, 8);
        if (chartRows.length === 0) {
            text('No data for the selected range.', x + 14, y + h - 52, 9, color.muted);
            return;
        }

        const maxValue = Math.max(...chartRows.map((row) => Number(row[valueKey] || 0)), 1);
        const labelX = x + 14;
        const barX = x + 150;
        const barMax = w - 205;
        const startY = y + h - 50;
        const rowGap = Math.min(24, (h - 70) / chartRows.length);

        chartRows.forEach((row, index) => {
            const rowY = startY - index * rowGap;
            const value = Number(row[valueKey] || 0);
            const barWidth = Math.max(2, (value / maxValue) * barMax);
            text(truncate(row.name, 24), labelX, rowY, 8.5, color.muted);
            setFill('0.902 0.945 0.984');
            rect(barX, rowY - 1, barMax, 8, true, false);
            setFill(accent);
            rect(barX, rowY - 1, barWidth, 8, true, false);
            text(formatPdfNumber(value), barX + barMax + 10, rowY, 8.5, color.ink);
        });
    };

    setFill(color.soft);
    rect(0, 0, pageWidth, pageHeight, true, false);

    setFill(color.blue);
    rect(0, pageHeight - 78, pageWidth, 78, true, false);
    text(reportTitle, margin, pageHeight - 42, 20, color.white, 'F2');
    text(`Generated ${new Date().toLocaleString('en-US')}  |  ${getDateRangeLabel(data.dateRange)}`, margin, pageHeight - 61, 9, color.white);

    sectionTitle('Catalog Summary', 684);
    card(42, 606, 120, 58, 'TOTAL PRODUCTS', formatPdfNumber(data.totalProducts), color.blue);
    card(174, 606, 120, 58, 'ACTIVE', formatPdfNumber(data.activeProducts), color.green);
    card(306, 606, 120, 58, 'INACTIVE', formatPdfNumber(data.inactiveProducts), color.muted);
    card(438, 606, 132, 58, 'MISSING IMAGES', formatPdfNumber(data.missingProductImages), color.amber);

    card(42, 526, 160, 58, 'COMPLETENESS', `${formatPdfNumber(data.catalogCompleteness)}%`, color.blue);
    progress(54, 536, 136, 6, data.catalogCompleteness);
    card(222, 526, 160, 58, 'COMPANIES', formatPdfNumber(data.totalCompanies), color.green);
    card(402, 526, 168, 58, 'SUPPLIERS', formatPdfNumber(data.totalSuppliers), color.amber);

    sectionTitle('Marketing Activity', 486);
    card(42, 408, 160, 58, 'TESTIMONIALS', `${formatPdfNumber(data.totalTestimonials)} (${data.testimonialsChange}%)`, color.red);
    card(222, 408, 160, 58, 'EVENTS', `${formatPdfNumber(data.totalEvents)} (${data.eventsChange}%)`, color.blue);
    card(402, 408, 168, 58, 'MARKETING ASSETS', `${formatPdfNumber(data.totalMaterials)} (${data.materialsChange}%)`, color.green);

    sectionTitle('Charts', 366);
    barChart('Products per Category', data.categoriesData, 'count', 42, 196, 252, 150, color.blue);
    barChart('Top Suppliers', data.suppliersData, 'product_count', 318, 196, 252, 150, color.green);

    sectionTitle('Notes', 154);
    text('Inactive products are hidden from public catalog pages. Missing images counts products without a main image or image records.', 42, 130, 8.5, color.muted);
    text('Percent changes compare against the previous equivalent date range. All-time reports use full catalog totals.', 42, 114, 8.5, color.muted);

    const contentStream = content.join('\n');
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(contentStream)} >>\nstream\n${contentStream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'
    ];

    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefOffset = Buffer.byteLength(pdf);
    pdf += `xref\n0 ${objects.length + 1}\n`;
    pdf += '0000000000 65535 f \n';
    offsets.slice(1).forEach((offset) => {
        pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
    });
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    return Buffer.from(pdf, 'binary');
};

router.get('/download-pdf', async (req, res) => {
    try {
        const data = await getDashboardData(req.query);
        const title = `${res.locals.brandName || 'Dashboard'} Report`;
        const pdf = buildDashboardPdf(data, title);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'attachment; filename="dashboard-report.pdf"');
        res.send(pdf);
    } catch (err) {
        console.error(err);
        res.status(500).send('Dashboard PDF error');
    }
});

router.get('/', async (req, res) => {
    try {
        res.render('dashboard', await getDashboardData(req.query));
    } catch (err) {
        console.error(err);
        res.status(500).send("Dashboard data error");
    }
});

module.exports = router;
