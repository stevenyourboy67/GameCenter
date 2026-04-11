(function () {
    let id = localStorage.getItem('_vid');
    if (!id) {
        id = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem('_vid', id);
    }

    const badge = document.createElement('div');
    badge.id = 'viewer-badge';
    badge.style.cssText = [
        'position:fixed',
        'top:14px',
        'right:16px',
        'z-index:99999',
        'background:rgba(0,0,0,0.55)',
        'backdrop-filter:blur(8px)',
        '-webkit-backdrop-filter:blur(8px)',
        'color:#fff',
        'font-size:13px',
        'font-family:sans-serif',
        'padding:5px 11px',
        'border-radius:20px',
        'display:flex',
        'align-items:center',
        'gap:6px',
        'box-shadow:0 2px 8px rgba(0,0,0,0.3)',
        'pointer-events:none',
        'user-select:none'
    ].join(';');

    const dot = document.createElement('span');
    dot.style.cssText = 'width:7px;height:7px;border-radius:50%;background:#4ade80;display:inline-block;flex-shrink:0';

    const label = document.createElement('span');
    label.textContent = '— online';

    badge.appendChild(dot);
    badge.appendChild(label);
    document.body.appendChild(badge);

    function ping() {
        fetch('/ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        })
        .then(r => r.json())
        .then(data => {
            label.textContent = data.count + ' online';
        })
        .catch(() => {});
    }

    window.addEventListener('beforeunload', function () {
        const blob = new Blob([JSON.stringify({ id })], { type: 'application/json' });
        navigator.sendBeacon('/leave', blob);
    });

    ping();
    setInterval(ping, 30000);
})();
