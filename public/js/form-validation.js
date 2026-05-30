(function (global) {
    function trim(s) {
        return (s == null ? '' : String(s)).trim();
    }

    function labelForField(field) {
        const group = field.closest('.form-group');
        const labelEl = group && group.querySelector('label');
        if (labelEl) {
            return labelEl.textContent.replace(/\s*\*\s*$/, '').trim();
        }
        return field.getAttribute('aria-label') || field.name || 'Required field';
    }

    function showFormError(form, message) {
        let banner = form.querySelector('.form-validation-banner:not(.form-validation-banner--server)');
        if (!banner) {
            banner = document.createElement('div');
            banner.className = 'form-validation-banner';
            banner.setAttribute('role', 'alert');
            form.insertBefore(banner, form.firstElementChild);
        }
        banner.innerHTML = '<i class="fas fa-exclamation-circle"></i> ' + message;
        banner.hidden = false;
        banner.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function clearFormErrors(form) {
        form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
        const banner = form.querySelector('.form-validation-banner:not(.form-validation-banner--server)');
        if (banner) banner.hidden = true;
    }

    /**
     * Run before custom async submit handlers (those that call preventDefault).
     * @param {HTMLFormElement} form
     * @returns {boolean}
     */
    function validateBeforeSubmit(form) {
        clearFormErrors(form);
        const errors = [];

        form.querySelectorAll('[required]').forEach((field) => {
            if (field.disabled) return;
            if (field.type === 'hidden') return;

            let ok = true;
            if (field.type === 'file') {
                ok = field.files && field.files.length > 0;
            } else if (field.tagName === 'SELECT' && field.multiple) {
                ok = Array.from(field.selectedOptions).length > 0;
            } else {
                ok = trim(field.value) !== '';
            }

            if (!ok) {
                field.classList.add('is-invalid');
                errors.push(labelForField(field));
            }
        });

        const requiredFile = form.dataset.requiredFile;
        if (requiredFile) {
            const hidden = form.querySelector(`[name="${requiredFile}"]`);
            const fileInputs = form.querySelectorAll('input[type="file"]');
            const hasHidden = hidden && trim(hidden.value);
            const hasFile = Array.from(fileInputs).some((inp) => inp.files && inp.files.length > 0);

            let hasFallback = false;
            const fallbackNames = (form.dataset.requiredFileFallback || '')
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
            const removedField = form.dataset.requiredFileIgnoreWhenRemoved;
            const logoRemoved = removedField
                && form.querySelector(`[name="${removedField}"]`)?.value === 'true';

            if (fallbackNames.length && !logoRemoved) {
                hasFallback = fallbackNames.some((name) => {
                    const el = form.querySelector(`[name="${name}"]`);
                    return el && trim(el.value);
                });
            }

            if (!hasHidden && !hasFile && !hasFallback) {
                const zone = form.querySelector('.upload-zone, .image-upload-dropzone');
                if (zone) zone.classList.add('is-invalid');
                errors.push(form.dataset.requiredFileLabel || 'Upload file');
            }
        }

        const unique = [...new Set(errors.filter(Boolean))];
        if (unique.length > 0) {
            showFormError(form, 'Please fill in required field(s): ' + unique.join(', ') + '.');
            const first = form.querySelector('.is-invalid, [required]:not([disabled])');
            if (first && typeof first.focus === 'function') first.focus();
            return false;
        }

        return form.reportValidity();
    }

    function initAjaxForms() {
        document.querySelectorAll('form[data-ajax-submit]').forEach((form) => {
            if (form.dataset.validationBound === 'true') return;
            form.dataset.validationBound = 'true';
            form.addEventListener('submit', function (e) {
                if (!validateBeforeSubmit(form)) {
                    e.preventDefault();
                    e.stopPropagation();
                }
            }, true);
        });
    }

    global.FormValidation = {
        validateBeforeSubmit,
        clearFormErrors,
        initAjaxForms
    };

    document.addEventListener('DOMContentLoaded', initAjaxForms);
})(window);
