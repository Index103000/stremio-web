// Copyright (C) 2017-2026 Smart code 203358507

const copyTextToClipboard = async (text) => {
    if (typeof text !== 'string') {
        throw new TypeError('Clipboard text must be a string');
    }

    // -------------------------------------------------------------------------
    // Modern Clipboard API
    // -------------------------------------------------------------------------
    //
    // This is the preferred implementation.
    //
    // navigator.clipboard.writeText() is normally available only in a secure
    // context, such as:
    //
    //   https://example.com
    //   http://localhost
    //
    // It may be unavailable when Stremio Web is opened from a LAN HTTP address,
    // for example:
    //
    //   http://192.168.11.17:8083
    //
    if (
        typeof navigator !== 'undefined' &&
        navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function' &&
        window.isSecureContext
    ) {
        await navigator.clipboard.writeText(text);
        return;
    }

    // -------------------------------------------------------------------------
    // Legacy fallback
    // -------------------------------------------------------------------------
    //
    // document.execCommand('copy') is deprecated, but it is still useful as a
    // compatibility fallback for browsers running in an insecure HTTP context.
    //
    // Instead of selecting text from a hidden textarea, intercept the actual
    // browser-generated "copy" event and write the requested value directly to
    // ClipboardEvent.clipboardData.
    //
    // This avoids several browser-specific problems with copying from hidden or
    // invisible form controls.
    if (
        typeof document === 'undefined' ||
        typeof document.execCommand !== 'function'
    ) {
        throw new Error('Clipboard API is unavailable');
    }

    let copyEventHandled = false;

    const onCopy = (event) => {
        if (!event.clipboardData) {
            return;
        }

        event.clipboardData.clearData();
        event.clipboardData.setData('text/plain', text);
        event.preventDefault();

        copyEventHandled = true;
    };

    document.addEventListener('copy', onCopy);

    try {
        const copied = document.execCommand('copy');

        if (!copied || !copyEventHandled) {
            throw new Error('Fallback clipboard copy failed');
        }
    } finally {
        document.removeEventListener('copy', onCopy);
    }
};

module.exports = copyTextToClipboard;