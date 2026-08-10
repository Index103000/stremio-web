// Copyright (C) 2017-2026 Smart code 203358507

const copyTextToClipboard = async (text) => {
    // Prefer the modern Clipboard API when available.
    //
    // navigator.clipboard.writeText() is generally only available in a
    // secure context, such as HTTPS or localhost.
    if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function' &&
        window.isSecureContext
    ) {
        await navigator.clipboard.writeText(text);
        return;
    }

    // Fallback for self-hosted Stremio Web opened through plain HTTP,
    // for example:
    //
    //   http://192.168.11.17:8083
    //
    // In this environment navigator.clipboard may be unavailable.
    if (
        typeof document === 'undefined' ||
        typeof document.execCommand !== 'function'
    ) {
        throw new Error('Clipboard API is unavailable');
    }

    const textarea = document.createElement('textarea');

    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);

    try {
        textarea.focus();
        textarea.select();
        textarea.setSelectionRange(0, textarea.value.length);

        const copied = document.execCommand('copy');

        if (!copied) {
            throw new Error('Fallback clipboard copy failed');
        }
    } finally {
        textarea.remove();
    }
};

module.exports = copyTextToClipboard;