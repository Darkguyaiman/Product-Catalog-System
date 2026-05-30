/** @param {unknown} v */
function trimValue(v) {
    if (v == null) return '';
    return String(v).trim();
}

/**
 * @param {Record<string, unknown>} body
 * @param {Record<string, string>} fields - keys in body, values are human labels
 * @returns {string|null}
 */
function validateRequired(body, fields) {
    const missing = [];
    for (const [key, label] of Object.entries(fields)) {
        if (!trimValue(body[key])) missing.push(label);
    }
    if (missing.length === 0) return null;
    return `Please fill in required field(s): ${missing.join(', ')}.`;
}

/**
 * At least one of the keys must be non-empty (e.g. file upload or chunked path).
 * @param {Record<string, unknown>} body
 * @param {string[]} keys
 * @param {string} label
 * @returns {string|null}
 */
function validateOneOf(body, keys, label) {
    const ok = keys.some((k) => trimValue(body[k]));
    if (ok) return null;
    return `${label} is required.`;
}

/** Empty strings become null (for optional DB columns, especially DATE). */
function nullIfEmpty(v) {
    const t = trimValue(v);
    return t === '' ? null : t;
}

module.exports = { trimValue, validateRequired, validateOneOf, nullIfEmpty };
