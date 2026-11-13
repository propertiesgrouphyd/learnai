const CACHE_NAME = "vidhwaan-aividhya-images-v22";

/*
 * ==========================================
 * SERVICE WORKER
 * ==========================================
 *
 * IMPORTANT:
 *
 * The PWA does NOT cache application files.
 *
 * NOT CACHED:
 *   - index.html
 *   - app.js
 *   - main.css
 *   - manifest.json
 *   - favicon
 *   - lesson .dat files
 *   - JSON
 *   - JavaScript
 *   - CSS
 *   - fonts
 *   - API responses
 *   - any other application/resource files
 *
 * ONLY IMAGES ARE CACHED.
 */


/*
 * ==========================================
 * IMAGE CHECK
 * ==========================================
 *
 * Only these image extensions are allowed
 * into the service-worker cache.
 */

function isImageRequest(request) {
  if (request.method !== "GET") {
    return false;
  }

  const url = new URL(request.url);

  return /\.(png|jpe?g|webp|gif|svg|ico|avif)$/i.test(
    url.pathname
  );
}


/*
 * ==========================================
 * INSTALL
 * ==========================================
 *
 * Do not pre-cache application files.
 *
 * The service worker activates immediately.
 */

self.addEventListener("install", event => {
  event.waitUntil(
    self.skipWaiting()
  );
});


/*
 * ==========================================
 * ACTIVATE
 * ==========================================
 *
 * Remove ALL previous service-worker caches.
 *
 * This is important because older versions of
 * the PWA may have cached app.js, main.css,
 * index.html, .dat files, etc.
 *
 * After this activation, only image caching
 * is allowed.
 */

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.map(key => caches.delete(key))
        );
      })
      .then(() => self.clients.claim())
  );
});


/*
 * ==========================================
 * FETCH
 * ==========================================
 *
 * ONLY IMAGES:
 *   Cache first.
 *
 * EVERYTHING ELSE:
 *   Network only.
 *
 * This guarantees that application files
 * always come from the current deployment.
 */

self.addEventListener("fetch", event => {
  const request = event.request;

  /*
   * Only handle GET requests.
   */
  if (request.method !== "GET") {
    return;
  }


  /*
   * ========================================
   * IMAGES
   * ========================================
   *
   * Images are the ONLY files cached by the
   * service worker.
   */

  if (isImageRequest(request)) {
    event.respondWith(
      caches.match(request)
        .then(cachedResponse => {
          if (cachedResponse) {
            return cachedResponse;
          }

          return fetch(request, {
            cache: "no-store"
          })
            .then(response => {
              /*
               * Cache only successful normal
               * responses.
               */

              if (
                !response ||
                response.status !== 200 ||
                response.type === "opaque"
              ) {
                return response;
              }

              const responseToCache =
                response.clone();

              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(
                    request,
                    responseToCache
                  );
                })
                .catch(() => {
                  /*
                   * Image caching failure must
                   * never break the image request.
                   */
                });

              return response;
            });
        })
    );

    return;
  }


  /*
   * ========================================
   * EVERYTHING ELSE
   * ========================================
   *
   * NEVER CACHE.
   *
   * This includes:
   *
   *   index.html
   *   app.js
   *   main.css
   *   manifest.json
   *   favicon
   *   .dat lesson files
   *   JSON
   *   fonts
   *   APIs
   *   any other resource
   *
   * The browser is instructed to obtain the
   * current resource from the network.
   */

  event.respondWith(
    fetch(request, {
      cache: "no-store"
    })
  );
});
