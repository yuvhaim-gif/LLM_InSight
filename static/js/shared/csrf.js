(function () {
    var SAFE_METHODS = /^(GET|HEAD|OPTIONS|TRACE)$/i;

    function getToken() {
        var meta = document.querySelector('meta[name="csrf-token"]');
        return meta ? meta.getAttribute('content') : '';
    }

    function isSameOrigin(url) {
        try {
            if (!url) {
                return true;
            }
            if (/^https?:\/\//i.test(url)) {
                return new URL(url, window.location.href).origin === window.location.origin;
            }
            return true;
        } catch (e) {
            return true;
        }
    }

    var originalFetch = window.fetch;
    if (typeof originalFetch !== 'function') {
        return;
    }

    window.fetch = function (input, init) {
        init = init || {};
        var inputIsRequest = (typeof input === 'object' && input !== null && typeof input.url === 'string');
        var method = (init.method || (inputIsRequest ? input.method : 'GET') || 'GET').toUpperCase();
        var url = (typeof input === 'string') ? input : (inputIsRequest ? input.url : '');

        if (!SAFE_METHODS.test(method) && isSameOrigin(url)) {
            var headers = new Headers(init.headers || (inputIsRequest ? input.headers : undefined) || {});
            if (!headers.has('X-CSRFToken')) {
                headers.set('X-CSRFToken', getToken());
            }
            init.headers = headers;
        }

        return originalFetch.call(this, input, init);
    };
})();
