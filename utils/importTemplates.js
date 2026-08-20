const ExcelJS = require('exceljs');

const TEMPLATES = {
    countries: {
        filename: 'countries-import-template.xlsx',
        sheetName: 'Countries',
        headerColor: 'FF005B96',
        columns: [
            { header: 'Country', key: 'country', width: 40 }
        ],
        instructions: [
            'Enter one country name per row in column A (Country).',
            'Do not change or delete the header in row 1.',
            'Empty rows are ignored during import.',
            'Countries that already exist in the system are skipped as duplicates.'
        ]
    },
    'product-types': {
        filename: 'product-types-import-template.xlsx',
        sheetName: 'Product Types',
        headerColor: 'FF009688',
        columns: [
            { header: 'Product Type', key: 'productType', width: 40 }
        ],
        instructions: [
            'Enter one product type per row in column A (Product Type).',
            'Do not change or delete the header in row 1.',
            'Empty rows are ignored during import.',
            'Product types that already exist in the system are skipped as duplicates.'
        ]
    },
    categories: {
        filename: 'categories-import-template.xlsx',
        sheetName: 'Categories',
        headerColor: 'FF7B1FA2',
        columns: [
            { header: 'Category Name', key: 'name', width: 36 },
            { header: 'Parent Category', key: 'parent', width: 36 }
        ],
        instructions: [
            'Column A (Category Name) is required — one category per row.',
            'Column B (Parent Category) is a dropdown of top-level categories currently in the system.',
            'Leave Parent Category blank to create a new top-level category.',
            'Do not type a parent name that is not in the dropdown — it must already exist.',
            'Import parent categories first, then download a fresh template to add subcategories.',
            'Do not change or delete the headers in row 1.',
            'Categories that already exist are skipped as duplicates.'
        ]
    },
    specs: {
        filename: 'product-specs-import-template.xlsx',
        sheetName: 'Specifications',
        headerColor: 'FF005B96',
        columns: [
            { header: 'Specification Name', key: 'name', width: 36 },
            { header: 'Value', key: 'value', width: 40 }
        ],
        instructions: [
            'Column A (Specification Name) is a dropdown of names already used in the catalog.',
            'Pick an existing name for consistency, or type a new one.',
            'Column B (Value) is the value for this product.',
            'Do not change or delete the headers in row 1.',
            'Save this file, then use Import Specs from Excel on the product form.'
        ],
        footerNote: 'Fill in the Specifications sheet, save this file, then import it on the product create or edit page.'
    }
};

const DATA_ROW_COUNT = 25;
const DROPDOWN_LAST_ROW = 1000;

function styleHeaderRow(sheet, headerColor, columnCount) {
    const headerRow = sheet.getRow(1);
    headerRow.height = 24;
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 12, name: 'Calibri' };
    headerRow.alignment = { vertical: 'middle', horizontal: 'left' };
    headerRow.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: headerColor }
    };

    for (let col = 1; col <= columnCount; col++) {
        const cell = headerRow.getCell(col);
        cell.border = {
            bottom: { style: 'thin', color: { argb: headerColor } }
        };
    }
}

function addHiddenListDropdown(workbook, sheet, {
    names,
    listSheetName,
    targetRange,
    promptTitle,
    prompt,
    errorTitle,
    error,
    allowCustom = false
}) {
    const list = (names || []).map((name) => String(name).trim()).filter(Boolean);
    if (list.length === 0) return;

    const listSheet = workbook.addWorksheet(listSheetName, { state: 'hidden' });
    listSheet.state = 'hidden';
    listSheet.getColumn(1).width = 36;
    list.forEach((name, index) => {
        listSheet.getCell(index + 1, 1).value = name;
    });

    sheet.dataValidations.add(targetRange, {
        type: 'list',
        allowBlank: true,
        formulae: [`${listSheetName}!$A$1:$A$${list.length}`],
        showInputMessage: true,
        promptTitle,
        prompt,
        showErrorMessage: true,
        errorStyle: allowCustom ? 'information' : 'warning',
        errorTitle,
        error
    });
}

async function generateImportTemplate(type, options = {}) {
    const config = TEMPLATES[type];
    if (!config) return null;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Product Catalog System';
    workbook.created = new Date();
    workbook.modified = new Date();

    const sheet = workbook.addWorksheet(config.sheetName, {
        views: [{ state: 'frozen', ySplit: 1, showGridLines: true }]
    });

    sheet.columns = config.columns;

    styleHeaderRow(sheet, config.headerColor, config.columns.length);

    sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: config.columns.length }
    };

    for (let i = 0; i < DATA_ROW_COUNT; i++) {
        const row = sheet.addRow(config.columns.map(() => ''));
        row.height = 20;
        row.alignment = { vertical: 'middle' };
        row.eachCell({ includeEmpty: true }, (cell) => {
            cell.border = {
                top: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                left: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                bottom: { style: 'hair', color: { argb: 'FFE5E7EB' } },
                right: { style: 'hair', color: { argb: 'FFE5E7EB' } }
            };
        });
    }

    if (type === 'categories') {
        addHiddenListDropdown(workbook, sheet, {
            names: options.parentCategories,
            listSheetName: 'ParentOptions',
            targetRange: `B2:B${DROPDOWN_LAST_ROW}`,
            promptTitle: 'Parent Category',
            prompt: 'Pick a top-level category from the system, or leave blank.',
            errorTitle: 'Unknown parent',
            error: 'Choose a parent from the dropdown, or leave blank for a top-level category.'
        });
    }

    if (type === 'specs') {
        addHiddenListDropdown(workbook, sheet, {
            names: options.specKeys,
            listSheetName: 'SpecOptions',
            targetRange: `A2:A${DROPDOWN_LAST_ROW}`,
            promptTitle: 'Specification Name',
            prompt: 'Pick an existing specification name, or type a new one.',
            errorTitle: 'New specification name',
            error: 'This name is not in the current catalog. You can keep it as a new specification.',
            allowCustom: true
        });
    }

    const instructions = [...config.instructions];
    if (type === 'categories' && (!options.parentCategories || options.parentCategories.length === 0)) {
        instructions.splice(1, 0, 'No top-level categories exist yet. Leave Parent Category blank, import them first, then download a fresh template to add subcategories.');
    }
    if (type === 'specs' && (!options.specKeys || options.specKeys.length === 0)) {
        instructions.splice(1, 0, 'No specification names exist yet. Type names in column A; later downloads will include them in the dropdown.');
    }

    const info = workbook.addWorksheet('Instructions');
    info.columns = [
        { header: 'How to use this template', key: 'text', width: 90 }
    ];
    styleHeaderRow(info, config.headerColor, 1);

    instructions.forEach((line, index) => {
        const row = info.addRow([`${index + 1}. ${line}`]);
        row.height = 22;
        row.alignment = { vertical: 'middle', wrapText: true };
        row.font = { name: 'Calibri', size: 11 };
    });

    const note = info.addRow([config.footerNote || 'Fill in the first worksheet, save this file, then upload it on the import page.']);
    note.height = 22;
    note.font = { name: 'Calibri', size: 11, italic: true, color: { argb: 'FF6B7280' } };

    return workbook;
}

function getTemplateMeta(type) {
    return TEMPLATES[type] || null;
}

module.exports = { generateImportTemplate, getTemplateMeta };
