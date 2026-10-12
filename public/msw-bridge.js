/*
 * Demo builds only (imported by the PWA service worker, see vite.config.ts).
 * A scope can only have one service worker, so the MSW worker runs inside the Workbox one.
 * MSW answers every request while mocking is active, which would bypass the precache and
 * clash with Workbox's own respondWith(). This bridge only lets MSW see API requests;
 * everything else (assets, navigations) stays with Workbox.
 */
;(function () {
  var API_PREFIX = '/api/'
  var nativeAddEventListener = self.addEventListener.bind(self)

  self.addEventListener = function (type, listener, options) {
    if (type !== 'fetch') return nativeAddEventListener(type, listener, options)
    return nativeAddEventListener(
      'fetch',
      function (event) {
        if (new URL(event.request.url).pathname.startsWith(API_PREFIX)) {
          return listener.call(self, event)
        }
      },
      options,
    )
  }

  try {
    importScripts('/mockServiceWorker.js')
  } finally {
    self.addEventListener = nativeAddEventListener
  }
})()
